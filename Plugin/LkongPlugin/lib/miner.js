'use strict';
// 龙空深度情报挖掘器 (Miner: Post Gold + Event Cluster + Sentiment Meter)
// 包含三大核心能力：
// 1. 楼中淘金：在看似普通的新人帖或求助帖中，扫描非楼主在深层楼层发布的硬核高价值长篇解答(>400字)。
// 2. 事件归并：将同一抄袭、封控、风波或政策引发的几十篇讨论聚类为一张结构化“事件卡”。
// 3. 情绪温度计：把被折叠的噪音/争吵帖提炼为圈内焦虑指数与导火索概括。

const { slateToText } = require('./slate');

class LkongMiner {
    /**
     * 1. 楼中淘金：扫描楼层获取高价值深水区回复
     */
    static digReplies(posts, opUid = 0) {
        if (!Array.isArray(posts)) return [];
        const nuggets = [];

        for (const p of posts) {
            if (p.lou === 1 || p.lou === '1') continue;

            const text = p.content || p.text || '';
            const cleanText = text.replace(/引用.*?说：/g, '').trim();
            const cleanLen = cleanText.length;

            const hasWritingKeywords = /大纲|设定|节奏|黄金三章|金手指|主角|反派|追读|首订|留存|剧情|冲突|视角|钩子|伏笔|代入感|跳读|首订比/.test(cleanText);
            const isLongAnswer = cleanLen >= 250;
            const hasFormatting = (p.structure || 0) >= 1 && cleanLen >= 100;
            const isDenseInsight = cleanLen >= 120 && hasWritingKeywords;

            if (isLongAnswer || hasFormatting || isDenseInsight) {
                if (cleanLen >= 100) {
                    nuggets.push({
                        lou: p.lou,
                        pid: p.pid,
                        author: p.author_name || p.author || '深水老作者',
                        length: cleanText.length,
                        excerpt: cleanText.slice(0, 160) + (cleanText.length > 160 ? '...' : ''),
                        text: cleanText,
                        images: p.images || []
                    });
                }
            }
        }
        return nuggets;
    }

    /**
     * 2. 补课周期·民间好帖多维评分模型 (不限24小时，全量平铺)
     * @param {Array<Object>} threads - 抓取到的帖子
     * @param {Object} store - 本地存储实例 (用于按需关联 posts 楼层详情)
     * @returns {Array<Object>} 优质民间好帖卡片列表
     */
    /**
     * 精确计算将要登上日报的所有干货帖与吃瓜主帖 tid，供爬虫 100% 覆盖下潜
     */
    static getTargetTidsForReport(threads) {
        if (!Array.isArray(threads)) return [];
        const preliminaryGolds = LkongMiner.extractCommunityGold(threads, null);
        const preliminaryDramas = LkongMiner.clusterDramas(threads, new Set(), null);

        const tids = new Set();
        // 1. 干货榜 Top 6 篇全部下潜
        for (const g of preliminaryGolds.slice(0, 6)) {
            if (g.tid) tids.add(g.tid);
        }
        // 2. 每个吃瓜聚类的前 2 篇核心主帖全部下潜
        for (const d of preliminaryDramas) {
            for (const dt of (d.threads || []).slice(0, 2)) {
                if (dt.tid) tids.add(dt.tid);
            }
        }
        return Array.from(tids);
    }

    static extractCommunityGold(threads, store = null) {
        if (!Array.isArray(threads)) return [];
        const goldList = [];

        for (const t of threads) {
            const title = t.title || '';
            const content = t.first_content || '';
            const combined = title + ' ' + content;

            // 过滤纯水、散财、求书与纯撕逼吃瓜帖（撕逼帖归入吃瓜专区）
            if (/散财|散币|龙币|金币|打卡|签到|求书|书荒|有无好书|腰椎间盘|恶心|小丑|抄袭狗|滚回来|调色盘|战斗《|八爪鱼/.test(title)) continue;

            let score = 0;
            const tags = [];

            // A. 数据密度打分（首订、追读、留存率、均订、完读率、稿费、单章字数、万订）
            if (/首订|追读|留存|均订|千字|首订比|转化率|收订比|上架成绩|完读率|稿费|精品|畅销\d+|单章|2000字|4000字|万订|万定/.test(combined)) {
                score += 35;
                tags.push('📊 核心数据复盘');
            }

            // B. 图表识别（通过 slate/images 探测到作者后台截图）
            let hasImages = false;
            try {
                const imgs = typeof t.images === 'string' ? JSON.parse(t.images) : (t.images || []);
                if (Array.isArray(imgs) && imgs.length > 0) hasImages = true;
            } catch(e) {}
            if (hasImages) {
                score += 20;
                if (!tags.includes('📊 核心数据复盘')) tags.push('📈 含后台截图');
            }

            // C. 题材与实操方法论（内投、试水推、新书期、过签、反派塑造、写书心得）
            if (/总结|攻略|复盘|实操|避坑|指南|反派塑造|设定|大纲|试水推|内投|新书期|过签|签约|开篇|主线|金手指|死磕|经验|枪手|续写/.test(combined)) {
                score += 25;
                tags.push('💡 题材实战');
            }

            // D. 篇幅与时效性加分 (近7日新帖优先呈现)
            if (content.length >= 200) score += 15;
            const now = Date.now();
            const ageDays = t.dateline ? (now - t.dateline) / (86400 * 1000) : 0;
            if (ageDays <= 7) score += 20;

            // 阈值：>= 35 分即判定为民间高价值干货，精选 Top 6 篇深度呈现
            if (score >= 35) {
                let posts = Array.isArray(t.posts) ? t.posts : [];
                if (posts.length === 0 && store && typeof store.getPosts === 'function') {
                    try { posts = store.getPosts(t.tid, 15); } catch (e) {}
                }

                const authorName = t.author_name || t.author?.name || '民间高人';
                const usedLous = new Set();
                const summary = LkongMiner._distillGoldSummary(title, content, posts, authorName, usedLous);
                const value = LkongMiner._distillGoldValue(title, content, posts, tags, authorName, usedLous);

                goldList.push({
                    tid: t.tid,
                    title: t.title,
                    author: authorName,
                    replies: t.replies || 0,
                    views: t.views || 0,
                    tags,
                    summary,
                    value,
                    score,
                    is_deleted: !!t.is_deleted
                });
            }
        }

        // 按评分和回复量综合降序，保留最硬核的 Top 6 篇确保篇篇精读
        return goldList.sort((a, b) => b.score - a.score || b.replies - a.replies).slice(0, 6);
    }

    /**
     * 从真实正文与作者后续楼层提纯真实内容简介 (拒绝套话，句句带货)
     */
    static _distillGoldSummary(title, firstContent, posts = [], opName = '', usedLous = new Set()) {
        const raw = (firstContent || '').trim();
        if (raw.length === 0) {
            return `主题《${title}》正在同步正文快照...`;
        }

        // 清洗常见无关前缀、龙空引用与冗长图片URL
        const cleaned = raw
            .replace(/\[图片:https?:\/\/[^\]]+\]/g, '[附实测截图]')
            .replace(/引用.*?说：/g, '')
            .replace(/^(如题|新人发帖|各位大佬好|本人纯萌新|防沉底|闲着没事发个贴)[，。\s]*/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        let fullSummary = cleaned.slice(0, 280);
        if (cleaned.length > 280) fullSummary += '...';

        // 当首楼较简短时，收集楼主在后续楼层的重要追更或前排解答
        if (fullSummary.length < 220) {
            const extraUpdates = [];
            for (const p of posts) {
                if (p.lou > 1) {
                    const text = (p.content || '')
                        .replace(/\[图片:https?:\/\/[^\]]+\]/g, '[附图]')
                        .replace(/引用.*?说：/g, '')
                        .replace(/\s+/g, ' ')
                        .trim();
                    const isOp = opName && p.author_name === opName;
                    if (isOp && text.length >= 10) {
                        extraUpdates.push(`【楼主${p.lou}楼追更】${text.slice(0, 90)}`);
                        usedLous.add(p.lou);
                    } else if (/day\d+|实测|首订|追读|留存|细纲|千字/i.test(text) && text.length >= 25) {
                        extraUpdates.push(`【${p.lou}楼 @${p.author_name}】${text.slice(0, 90)}`);
                        usedLous.add(p.lou);
                    }
                    if (extraUpdates.length >= 2) break;
                }
            }
            if (extraUpdates.length > 0) {
                fullSummary += ' ' + extraUpdates.join(' ');
            }
        }

        return fullSummary;
    }

    /**
     * 从真实正文与回帖提炼实操价值简析 (切中要害的实操价值与避坑指引)
     */
    static _distillGoldValue(title, firstContent, posts = [], tags = [], opName = '', usedLous = new Set()) {
        const combined = (title + ' ' + (firstContent || '')).toLowerCase();
        const valuePoints = [];

        if (/稿费|千字|单章|2000字|4000字|阅读量|广告|分成|完读率|收益/.test(combined)) {
            valuePoints.push('一手收益与分章实测：通过真实后台字数与稿费数据对比，拆解免费/付费平台广告计费权重与读者完读留存的平衡点。');
        } else if (/起点|首订|追读|留存|试水推|内投|签约|过签|万订|万定/.test(combined)) {
            valuePoints.push('主站推荐与签约复盘：还原新书期真实追读转化门槛与长线连载节奏，为内投立项、试水推晋级及续写决策提供量化参照。');
        } else if (/番茄|红果|免费|七猫|出走/.test(combined)) {
            valuePoints.push('免费站生态生存指南：剖析下沉市场推书算法与受众偏好，降低跨站开书的试错成本。');
        } else if (/大纲|设定|节奏|反派|金手指|钩子|伏笔|人设|写书心得|框架|套路|商业化/.test(combined)) {
            valuePoints.push('商业网文结构方法论：系统梳理题材爆点、角色成长弧线与主线冲突设计，可直接作为开书人设表与细纲模板使用。');
        } else {
            valuePoints.push('一线创作经验复盘：结合真实连载痛点，提供可落地的节奏把控与心态调适参考。');
        }

        // 挖掘楼中同行老作者的关键补充或争议碰撞（严格避开已在简介中引用的楼层与楼主自回）
        const peerInsights = [];
        for (const p of posts) {
            if (p.lou > 1 && !usedLous.has(p.lou) && p.author_name !== opName) {
                const text = (p.content || '')
                    .replace(/\[图片:https?:\/\/[^\]]+\]/g, '')
                    .replace(/引用.*?说：/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                if (text.length >= 20 && /注意|其实|坑|建议|规则|算法|以前|现在|不会|没用|细纲|打磨|稿费|写好|套路|读者/.test(text)) {
                    peerInsights.push(`@${p.author_name}：“${text.slice(0, 68)}${text.length > 68 ? '...' : ''}”`);
                    if (peerInsights.length >= 1) break;
                }
            }
        }

        if (peerInsights.length > 0) {
            valuePoints.push(`💬 楼中同行锐评：${peerInsights[0]}`);
        }

        return valuePoints.join(' ');
    }

    /**
     * 3. 报业级吃瓜脉络归并与深度特稿生成 (Drama Cluster & Investigative Report)
     * 告别死板模板，真正读过首楼事实与楼中前排交锋，提供详尽报道与证据链
     */
    static clusterDramas(threads, noiseWords = new Set(), store = null) {
        if (!Array.isArray(threads)) return [];
        const clusters = new Map();

        // 识别吃瓜四大主战场
        const DRAMA_DEFINITIONS = [
            {
                key: '作品抄袭调色盘与融梗对峙',
                regex: /抄袭|融梗|调色盘|七月封阳|洗稿|同学，你也要攻略|战斗《/,
                categoryName: '版权维权与抄袭争议'
            },
            {
                key: '短剧漫改爆发与红果番茄垄断争议',
                regex: /漫剧|漫改|短剧|红果|番茄.*大抄袭|不烧心/,
                categoryName: '新兴衍生剧与平台垄断'
            },
            {
                key: '平台合同条款与版权归属争议',
                regex: /合同|全版权|分成|扣税|拿回版权|纵横七猫|保底|断更.*版权/,
                categoryName: '平台政策与作者权益'
            },
            {
                key: '圈内作者异动与江湖论战',
                regex: /小乌贼|鹤守|邹大海|大神.*回归|姬叉|老写手.*AI|摧毁脑洞|基本盘/,
                categoryName: '名家动态与圈内论战'
            }
        ];

        for (const t of threads) {
            const title = t.title || '';
            if (/散财|散币|龙币/.test(title)) continue;
            for (const d of DRAMA_DEFINITIONS) {
                if (d.regex.test(title)) {
                    if (!clusters.has(d.key)) {
                        clusters.set(d.key, {
                            eventName: d.key,
                            categoryName: d.categoryName,
                            threads: [],
                            totalReplies: 0
                        });
                    }
                    const item = clusters.get(d.key);
                    item.totalReplies += (t.replies || 0);
                    item.threads.push(t);
                    break;
                }
            }
        }

        const reports = [];

        for (const [key, item] of clusters.entries()) {
            if (item.threads.length === 0) continue;

            // 选出该事件中最具核心爆发力的主帖（优先已有正文或回复最多）
            const sortedThreads = [...item.threads].sort((a, b) => (b.replies || 0) - (a.replies || 0));
            const mainThread = sortedThreads[0];

            // 获取主帖的楼层数据
            let posts = Array.isArray(mainThread.posts) ? mainThread.posts : [];
            if (posts.length === 0 && store && typeof store.getPosts === 'function') {
                try { posts = store.getPosts(mainThread.tid, 20); } catch(e) {}
            }

            // 报业级深度报道提纯
            const investigation = LkongMiner._distillDramaInvestigation(mainThread, sortedThreads, posts);

            reports.push({
                eventName: item.eventName,
                categoryName: item.categoryName,
                threadCount: item.threads.length,
                totalReplies: item.totalReplies,
                brief: investigation.brief,
                coreDispute: investigation.coreDispute,
                stances: investigation.stances,
                threads: sortedThreads.map(t => ({
                    tid: t.tid,
                    title: t.title,
                    author: t.author_name || t.author?.name || '',
                    replies: t.replies || 0,
                    hasImages: (typeof t.images === 'string' && t.images.length > 5) || (Array.isArray(t.images) && t.images.length > 0)
                }))
            });
        }

        return reports;
    }

    /**
     * 深度报道提炼器：还原真实事件全貌、当事人控诉细节与回帖交锋
     */
    static _distillDramaInvestigation(mainThread, allThreads, posts = []) {
        const title = mainThread.title || '';
        const author = mainThread.author_name || mainThread.author?.name || '发帖人';
        const firstContent = (mainThread.first_content || '').trim();

        // 1. 新闻导语简报（不与正文重复，点明焦点规模与导火索）
        const totalReplies = allThreads.reduce((acc, cur) => acc + (cur.replies || 0), 0);
        const brief = `焦点主帖《${title}》（楼主：@${author}）引爆讨论，该话题下共聚合 ${allThreads.length} 篇关联帖、累计 ${totalReplies} 条交锋回复。`;

        // 2. 深度脉络与首楼详情还原 (读过首楼正文，挖掘具体书名、当事人与证据)
        let coreDispute = '';
        if (firstContent.length > 0) {
            const cleanContent = firstContent
                .replace(/\[图片:https?:\/\/[^\]]+\]/g, '[附证据截图]')
                .replace(/引用.*?说：/g, '')
                .replace(/\s+/g, ' ')
                .trim();
            coreDispute = `楼主 @${author} 原文披露：${cleanContent.slice(0, 300)}${cleanContent.length > 300 ? '...' : ''}`;
        } else {
            coreDispute = `围绕《${title}》展开讨论，正文快照正在同步入库中。`;
        }

        // 3. 楼中交锋与真实回帖实录 (读取第2~20楼真实回帖，还原各方原话)
        const realQuotes = [];
        for (const p of posts) {
            if (p.lou <= 1) continue;
            const text = (p.content || '')
                .replace(/\[图片:https?:\/\/[^\]]+\]/g, '[附图]')
                .replace(/引用.*?说：/g, '')
                .replace(/\s+/g, ' ')
                .trim();
            // 过滤纯水词（如“顶”、“插眼”）
            if (text.length < 8 || /^(顶+|支持|前排|吃瓜|mark|插眼)$/i.test(text)) continue;

            realQuotes.push(`[${p.lou}楼 @${p.author_name}]：“${text.slice(0, 65)}${text.length > 65 ? '...' : ''}”`);
            if (realQuotes.length >= 3) break;
        }

        let stances = '';
        if (realQuotes.length > 0) {
            stances = realQuotes.join(' ｜ ');
        } else {
            stances = '楼内书友围绕事件真实性与后续影响持续跟进讨论中。';
        }

        return { brief, coreDispute, stances };
    }

    /**
     * 4. 情绪温度计：统计圈内焦虑度与导火索
     */
    static calculateSentiment(allThreads) {
        if (!Array.isArray(allThreads) || allThreads.length === 0) {
            return { anxietyScore: 0, noiseCount: 0, topics: [], summary: '暂无帖子数据' };
        }

        const TOPIC_SIGNALS = [
            { name: '唱衰网文/末日论', regex: /要完|凉了|末日|崩盘|寒冬|跑路|劝退/ },
            { name: 'AI写作与版权争议', regex: /AI|人工智能|降维打击|实体书|融梗/ },
            { name: '收益与分成焦虑', regex: /降薪|扣税|分成|买断|不给发|腰斩|全职/ },
            { name: '对线撕逼与避雷', regex: /对线|小丑|挂人|吵架|恶心|避雷/ }
        ];

        const topicCounts = new Map();
        for (const s of TOPIC_SIGNALS) topicCounts.set(s.name, 0);

        let noiseTotal = 0;
        for (const t of allThreads) {
            const title = t.title || '';
            let isNegative = false;

            for (const s of TOPIC_SIGNALS) {
                if (s.regex.test(title)) {
                    topicCounts.set(s.name, topicCounts.get(s.name) + 1);
                    isNegative = true;
                }
            }
            if (isNegative || t.category === 'noise') noiseTotal++;
        }

        const anxietyScore = Math.min(Math.round((noiseTotal / allThreads.length) * 100), 100);
        const topics = [];
        let maxTopic = { name: '日常闲聊', count: 0 };
        for (const [name, count] of topicCounts.entries()) {
            if (count > 0) topics.push({ name, count });
            if (count > maxTopic.count) maxTopic = { name, count };
        }

        const summary = `今日情绪指数 ${anxietyScore}/100（噪音与争议帖共 ${noiseTotal} 篇）。主要焦虑导火索聚焦于：【${maxTopic.name}】(${maxTopic.count}篇)，整体氛围处于${anxietyScore > 50 ? '高焦虑动荡期' : '平稳创作期'}。`;

        return {
            anxietyScore,
            noiseCount: noiseTotal,
            topics,
            summary
        };
    }
}

module.exports = LkongMiner;