'use strict';
// 龙空网文情报雷达 (LkongPlugin) 主入口 - 完整全功能版
// 组装生态链:
// - lib/lkong (只读 GraphQL 通讯)
// - lib/slate (Slate 富文本转换)
// - lib/store (better-sqlite3 持久化与游标管理)
// - lib/filter (金子/情报/噪音三分类)
// - lib/crawler (开机增量补课，上限3天/300帖)
// - lib/media (图片防盗链下载与本地缓存)
// - lib/miner (楼中淘金、事件归并、情绪温度计)
// - lib/reporter (四分区日报 Markdown 渲染)
// - lib/placeholder (单行占位状态生成)
// - lib/archiver (抢救式 Markdown 存档与知识库切片)

const fs = require('fs');
const path = require('path');
const { LkongClient } = require('./lib/lkong');
const { slateToText } = require('./lib/slate');
const LkongStore = require('./lib/store');
const { classifyThread } = require('./lib/filter');
const { LkongCrawler } = require('./lib/crawler');
const { LkongMediaManager } = require('./lib/media');
const LkongMiner = require('./lib/miner');
const LkongReporter = require('./lib/reporter');
const LkongPlaceholder = require('./lib/placeholder');
const { LkongArchiver } = require('./lib/archiver');

let client;
let store;
let media;
let archiver;

function getClient() {
    if (!client) client = new LkongClient();
    return client;
}

function getStore() {
    if (!store) store = new LkongStore();
    return store;
}

function getMedia() {
    if (!media) media = new LkongMediaManager();
    return media;
}

function getArchiver() {
    if (!archiver) archiver = new LkongArchiver();
    return archiver;
}

function sendResponse(status, data) {
    if (status === 'success') {
        process.stdout.write(JSON.stringify({ status: 'success', result: data }));
    } else {
        process.stdout.write(JSON.stringify({ status: 'error', error: data }));
    }
    if (store) {
        try { store.close(); } catch (e) {}
    }
    process.exit(0);
}

// 1. 验证凭证与自检
async function handleTestAuth() {
    try {
        const c = getClient();
        const me = await c.getMe();
        return sendResponse('success', {
            auth_status: 'valid',
            message: '龙空连接与登录凭证有效！',
            user: me
        });
    } catch (err) {
        return sendResponse('error', `连通测试失败: ${err.message}`);
    }
}

// 2. 开机单行占位状态
async function handleGetStatus(args) {
    const fid = parseInt(args.fid || 15, 10);
    const s = getStore();
    let authValid = true;
    try {
        const c = getClient();
        if (!c.cfg.cookie) authValid = false;
    } catch (e) {
        authValid = false;
    }
    const statusLine = LkongPlaceholder.getStatusLine(s, fid, authValid);
    return sendResponse('success', { statusLine });
}

// 3. 增量补课巡检 (开机预热与定时补课)
async function handleCatchUp(args) {
    const fid = parseInt(args.fid || 15, 10);
    const c = getClient();
    const s = getStore();
    const crawler = new LkongCrawler(c, s);

    try {
        const res = await crawler.catchUp(fid);
        return sendResponse('success', {
            fid,
            message: `补课抓取完成，同步到 ${res.newThreadsCount} 篇新帖，初筛出 ${res.filteredIntelsCount} 篇情报/干货。`,
            details: res
        });
    } catch (err) {
        return sendResponse('error', `补课抓取失败: ${err.message}`);
    }
}

// 4. “龙空今天怎样”全景展开 —— 渲染书卷水墨固定 UI (热门 + 7天精选 + 补课好帖平铺 + 吃瓜聚类 + 情绪)
async function handleExpandDaily(args) {
    const fid = parseInt(args.fid || 15, 10);
    const c = getClient();
    const s = getStore();
    const crawler = new LkongCrawler(c, s);

    try {
        // 先触发一次快速增量补课与精选同步
        await crawler.catchUp(fid, false);

        // 1. 获取原网页右侧边栏原汁原味的【今日热门】(threadsFragment hot) 并联查回复数
        let hotThreads = [];
        try {
            const hotRes = await c.getForumHotSidebar(fid);
            const rawHots = hotRes?.hots || [];
            hotThreads = rawHots.map(h => {
                const row = s.getThread(h.tid);
                return {
                    tid: h.tid,
                    title: h.title,
                    replies: row ? row.replies : 0
                };
            });
            if (hotThreads.length === 0) {
                const glRes = await c.getGlThreads(fid);
                hotThreads = (glRes?.glThreads || []).map(g => ({
                    tid: g.tid,
                    title: g.title,
                    replies: g.replies || 0
                }));
            }
        } catch(e) {
            console.error('[ExpandDaily] 获取今日热门失败:', e.message);
        }

        // 2. 从 digest_pool 获取严格 7 天内的新晋精选
        const activeDigests = s.getActiveDigests(7);

        // 3. 从本地库拉取有效窗口期的所有活跃帖子 (至多 250 篇)
        const recentThreads = s.db.prepare(`
            SELECT * FROM threads
            WHERE fid = ?
            ORDER BY lastpost DESC
            LIMIT 250
        `).all(fid);

        // ==== Tiered Deep Crawl: 日报上榜帖正文与楼层100%精准下潜持久化 ====
        const targetTids = LkongMiner.getTargetTidsForReport(recentThreads);

        try {
            await crawler.deepCrawlThreads(targetTids, { delayMs: 400 });
        } catch (e) {
            console.error('[ExpandDaily] 深度抓取候选帖异常:', e.message);
        }

        // 重新获取已写入正文快照的最新列表
        const refreshedThreads = s.db.prepare(`
            SELECT * FROM threads
            WHERE fid = ?
            ORDER BY lastpost DESC
            LIMIT 250
        `).all(fid);

        // 4. 挖掘补课窗口期高分民间好帖 (传入 store 关联真实正文与楼层，杜绝套话)
        const communityGolds = LkongMiner.extractCommunityGold(refreshedThreads, s);

        // 5. 提取报业级吃瓜深度特稿 (结合首楼指控事实与前排交锋论点)
        const noiseWords = s.getNoiseWords();
        const dramas = LkongMiner.clusterDramas(refreshedThreads, noiseWords, s);

        // 6. 圈内情绪温度计与降噪审计
        const sentiment = LkongMiner.calculateSentiment(refreshedThreads);
        const foldedNoise = refreshedThreads.filter(t => t.category === 'noise');

        // 7. 使用书卷水墨质感固定 UI 模板渲染
        const reportHtml = LkongReporter.formatHtmlReport({
            hotThreads,
            activeDigests,
            communityGolds,
            dramas,
            sentiment,
            foldedNoise
        });

        return sendResponse('success', {
            fid,
            report_html: reportHtml,
            hot_count: hotThreads.length,
            digest_count: activeDigests.length,
            community_gold_count: communityGolds.length,
            drama_count: dramas.length,
            anxiety_score: sentiment.anxietyScore
        });
    } catch (err) {
        return sendResponse('error', `生成全景日报失败: ${err.message}`);
    }
}

// 5. 抓取单个帖子楼层详情与图片防盗链本地缓存（含原帖被删时的本地抢救快照回退）
async function handleGetThread(args) {
    const tid = parseInt(args.tid, 10);
    if (!tid) return sendResponse('error', '缺少必要参数: tid');

    const page = parseInt(args.page || 1, 10);
    const downloadImages = !!args.cache_images;
    const c = getClient();
    const s = getStore();
    const m = getMedia();

    try {
        const posts = (await c.getThreadPage(tid, page))?.posts;
        if (!Array.isArray(posts) || posts.length === 0) {
            throw new Error('REMOTE_POSTS_EMPTY_OR_DELETED');
        }

        const formattedPosts = [];
        const postsToSave = [];
        const allImageUrls = [];

        for (const p of posts) {
            const slateRes = slateToText(p.content);
            if (slateRes.images && slateRes.images.length > 0) {
                allImageUrls.push(...slateRes.images);
            }
            formattedPosts.push({
                lou: p.lou,
                pid: p.pid,
                author: p.user?.name,
                level: p.user?.level?.name,
                dateline: p.dateline,
                text: slateRes.text,
                images: slateRes.images,
                structure: slateRes.structureCount
            });
            postsToSave.push({
                pid: p.pid,
                tid,
                lou: p.lou,
                uid: p.user?.uid || 0,
                author_name: p.user?.name || '',
                dateline: p.dateline || 0,
                content: slateRes.text,
                images: slateRes.images,
                score: 0
            });
        }

        // 顺手持久化进 SQLite
        try {
            s.savePosts(postsToSave);
            if (page === 1 && formattedPosts[0]) {
                s.updateThreadSnapshot(tid, {
                    first_content: formattedPosts[0].text,
                    images: formattedPosts[0].images,
                    is_deleted: 0
                });
            }
        } catch (dbErr) {}

        // 如果要求缓存图片（防盗链）
        let cachedImages = [];
        if (downloadImages && allImageUrls.length > 0) {
            cachedImages = await m.downloadImagesBatch(allImageUrls.slice(0, 8));
        }

        return sendResponse('success', {
            tid,
            page,
            from_local_snapshot: false,
            post_count: formattedPosts.length,
            posts: formattedPosts,
            cached_images: cachedImages
        });
    } catch (err) {
        // 原站删帖或网络异常时，自动回退读取本地 SQLite 7日窗口快照
        try {
            const localThread = s.getThread(tid);
            const localPosts = s.getPosts(tid, 50);
            if (localPosts && localPosts.length > 0) {
                s.updateThreadSnapshot(tid, { is_deleted: 1 });
                return sendResponse('success', {
                    tid,
                    title: localThread ? localThread.title : '',
                    from_local_snapshot: true,
                    notice: '⚠️ 原站该帖已被删除或无法访问，已自动调取本地 SQLite 抢救快照！',
                    post_count: localPosts.length,
                    posts: localPosts.map(lp => ({
                        lou: lp.lou,
                        pid: lp.pid,
                        author: lp.author_name,
                        dateline: lp.dateline,
                        text: lp.content,
                        images: (() => { try { return JSON.parse(lp.images || '[]'); } catch(e) { return []; } })()
                    }))
                });
            }
        } catch (fallbackErr) {}

        return sendResponse('error', `获取帖子楼层详情失败且本地无快照 (tid: ${tid}): ${err.message}`);
    }
}

// 6. 抢救式归档入库
async function handleArchiveToKnowledge(args) {
    const tid = parseInt(args.tid, 10);
    if (!tid) return sendResponse('error', '缺少必要参数: tid');

    const s = getStore();
    const thread = s.getThread(tid);
    if (!thread) return sendResponse('error', `库中未找到 tid: ${tid} 的帖子`);

    const c = getClient();
    const threadPage = await c.getThreadPage(tid, 1);
    const rawPosts = threadPage?.posts || [];
    const formattedPosts = rawPosts.map(p => ({
        lou: p.lou,
        author: p.user?.name,
        text: slateToText(p.content).text,
        images: slateToText(p.content).images
    }));

    const archiver = getArchiver();
    const savedPath = archiver.saveThreadMarkdown(thread, formattedPosts);
    const knowledgePayload = archiver.formatForKnowledge(thread, formattedPosts[0]?.text || '');

    return sendResponse('success', {
        tid,
        saved_file: savedPath,
        knowledge_entry: knowledgePayload
    });
}

// 主入口分发
async function main() {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => input += chunk);
    process.stdin.on('end', async () => {
        let args = {};
        try {
            if (input.trim()) args = JSON.parse(input.trim());
        } catch (e) {
            return sendResponse('error', `入参解析失败: ${e.message}`);
        }

        const command = args.command || 'expand_daily';
        try {
            if (command === 'test_auth') {
                await handleTestAuth();
            } else if (command === 'get_status') {
                await handleGetStatus(args);
            } else if (command === 'catch_up') {
                await handleCatchUp(args);
            } else if (command === 'expand_daily' || command === 'get_daily') {
                await handleExpandDaily(args);
            } else if (command === 'get_thread') {
                await handleGetThread(args);
            } else if (command === 'archive_to_knowledge') {
                await handleArchiveToKnowledge(args);
            } else {
                return sendResponse('error', `未知指令: ${command}`);
            }
        } catch (err) {
            if (store) {
                try { store.close(); } catch (e) {}
            }
            return sendResponse('error', `执行异常: ${err.message}`);
        }
    });
}

main();