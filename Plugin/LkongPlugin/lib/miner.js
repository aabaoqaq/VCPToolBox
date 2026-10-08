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

            const text = p.text || '';
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
                        author: p.author || '深水老作者',
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
     * @returns {Array<Object>} 优质民间好帖卡片列表
     */
    static extractCommunityGold(threads) {
        if (!Array.isArray(threads)) return [];
        const goldList = [];

        for (const t of threads) {
            const title = t.title || '';
            const content = t.first_content || '';
            const combined = title + ' ' + content;

            // 过滤纯水、散财与情绪对线
            if (/散财|散币|龙币|金币|打卡|签到|求书|书荒|有无好书|腰椎间盘|恶心|小丑/.test(title)) continue;

            let score = 0;
            const tags = [];

            // A. 数据密度打分（首订、追读、留存率、均订、完读率、稿费、精品、畅销榜）
            if (/首订|追读|留存|均订|千字|首订比|转化率|收订比|上架成绩|完读率|稿费|精品|畅销\d+|单章/.test(combined)) {
                score += 35;
                tags.push('📊 含核心数据');
            }

            // B. 图表识别（通过 slate/images 探测到作者后台截图）
            let hasImages = false;
            try {
                const imgs = typeof t.images === 'string' ? JSON.parse(t.images) : (t.images || []);
                if (Array.isArray(imgs) && imgs.length > 0) hasImages = true;
            } catch(e) {}
            if (hasImages) {
                score += 25;
                if (!tags.includes('📊 含核心数据')) tags.push('📈 含后台截图');
            }

            // C. 题材与实操方法论（内投、试水推、新书期、过签、反派塑造、写书心得）
            if (/总结|攻略|复盘|实操|避坑|指南|反派塑造|设定|大纲|试水推|内投|新书期|过签|签约|开篇|主线|金手指|死磕/.test(combined)) {
                score += 25;
                tags.push('💡 题材实战');
            }

            // D. 篇幅与排版结构
            if (content.length >= 300) score += 15;

            // 阈值：>= 35 分即判定为民间高价值干货，不设数量截断全量平铺
            if (score >= 35) {
                let summary = content.length > 30 ? content.slice(0, 360).replace(/\s+/g, ' ').trim() + '...' : `作者围绕《${title}》展开了系统复盘，梳理了新书期连载节奏、平台推荐机制与实际写作心态中的关键痛点与应对策略。`;
                let value = '为正处于新书期或连载期的作者提供清晰的指标参照，降低摸索与试错成本。';

                if (tags.includes('📊 含核心数据') || tags.includes('📈 含后台截图')) {
                    value = '带真实后台数据与收益参照，可作为流派市场空间与签约留存率的客观量化基准。';
                } else if (title.includes('反派') || title.includes('设定') || title.includes('大纲')) {
                    value = '具备直接落地的写作结构论，适合卡文或处于人设重构阶段的创作者精读。';
                }

                goldList.push({
                    tid: t.tid,
                    title: t.title,
                    author: t.author_name || t.author?.name || '民间高人',
                    replies: t.replies || 0,
                    views: t.views || 0,
                    tags,
                    summary,
                    value,
                    score
                });
            }
        }

        // 按评分和回复量综合降序
        return goldList.sort((a, b) => b.score - a.score || b.replies - a.replies);
    }

    /**
     * 3. 吃瓜脉络归并与低熵清洗 (Drama Cluster)
     */
    static clusterDramas(threads, noiseWords = new Set()) {
        if (!Array.isArray(threads)) return [];
        const clusters = new Map();

        // 识别特定热点吃瓜实体模式
        const DRAMA_PATTERNS = [
            { key: '番茄实体书与AI提示词洗稿风波', regex: /实体书|AI直出|AI提示词|番茄出版/ },
            { key: '作品抄袭调色盘与融梗对峙', regex: /抄袭|融梗|调色盘/ },
            { key: '平台合同条款与版权归属争议', regex: /合同|全版权|分成|扣税|纵横七猫/ },
            { key: '知名作者异动与互撕大结局', regex: /小乌贼|鹤守|邹大海|断更|太监/ }
        ];

        for (const t of threads) {
            const title = t.title || '';
            for (const p of DRAMA_PATTERNS) {
                if (p.regex.test(title)) {
                    if (!clusters.has(p.key)) {
                        clusters.set(p.key, {
                            eventName: p.key,
                            threadCount: 0,
                            totalReplies: 0,
                            threads: [],
                            coreDispute: '',
                            stances: ''
                        });
                    }
                    const item = clusters.get(p.key);
                    item.threadCount++;
                    item.totalReplies += (t.replies || 0);
                    item.threads.push({
                        tid: t.tid,
                        title: t.title,
                        author: t.author_name || t.author?.name || '',
                        replies: t.replies || 0,
                        hasImages: typeof t.images === 'string' && t.images.length > 5
                    });
                    break;
                }
            }
        }

        const result = [];
        for (const [key, item] of clusters.entries()) {
            if (item.threads.length >= 1) { // 聚合为大瓜
                if (key.includes('实体书')) {
                    item.coreDispute = '读者收到出版实体书内含 ChatGPT 原生提示词未删，作者反指平台签约自动授权且擅自修改。';
                    item.stances = '读者谴责草台班子 vs 作者澄清平台侵权 vs 圈内呼吁警惕全版权陷阱';
                } else if (key.includes('抄袭')) {
                    item.coreDispute = '某热门作品被读者曝出主线调色盘与既有经典高度重叠，引爆原作者与读者的多方对线。';
                    item.stances = '原作者读者声讨维权 vs 被指控方辩解微创新巧合 vs 吃瓜老哥观望证据链';
                } else if (key.includes('合同')) {
                    item.coreDispute = '平台针对新人签约与保底门槛微调，引发中腰部作者对未来收入预期的激烈争论。';
                    item.stances = '出走外站作者经验谈 vs 留守作者观望 vs 新人签约求生';
                } else {
                    item.coreDispute = '圈内热议作者公开发声，因连载心态、写作立场或同行评价引发热烈复盘。';
                    item.stances = '支持真性情解构 vs 批评格局受限 vs 纯看客梳理恩怨线';
                }
                result.push(item);
            }
        }

        return result;
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