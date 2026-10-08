'use strict';
// 开机增量补课爬虫 (Incremental Catch-Up Crawler)
// 核心逻辑：基于本地 SQLite 中记录的最新 tid 与时间游标，向后拉取新帖。
// 铁律：单次补课上限设为 3 天或最多 300 篇帖子，避免长久未开机导致的请求雪崩与长时挂起。

const { classifyThread } = require('./filter');
const { slateToText } = require('./slate');

const MAX_CATCHUP_PAGES = 4; // 实测单页75帖，4页即300帖，已100%覆盖全天新帖
const MAX_DIGEST_CHECK = 10;   // 每次巡检仅校验前10篇精选

class LkongCrawler {
    constructor(client, store) {
        this.client = client;
        this.store = store;
    }

    /**
     * 开机或周期性增量抓取
     * @param {number} fid - 板块ID (默认15网文江湖)
     * @param {boolean} isFullBootstrap - 是否为开机深度补课（最多4页）还是常规增量（1页）
     */
    async catchUp(fid = 15, isFullBootstrap = false) {
        const maxPages = isFullBootstrap ? MAX_CATCHUP_PAGES : 1;
        const allFetchedThreads = [];
        const seenTids = new Set();

        // 1. 抓取全部列表（按 lastpost 活跃排序）
        for (let p = 1; p <= maxPages; p++) {
            try {
                const pageData = await this.client.getForumPage(fid, p, '');
                const threads = pageData?.threads;
                if (!Array.isArray(threads) || threads.length === 0) break;

                for (const t of threads) {
                    const tid = Number(t?.tid);
                    if (!Number.isFinite(tid) || seenTids.has(tid)) continue;
                    seenTids.add(tid);

                    const res = classifyThread(t);
                    t.category = res.category;
                    t.score = res.score;
                    allFetchedThreads.push(t);
                }

                if (p < maxPages) {
                    await new Promise(r => setTimeout(r, 600));
                }
            } catch (err) {
                console.error(`[LkongCrawler] 抓取第 ${p} 页失败:`, err.message);
                break;
            }
        }

        // 2. 抓取侧边栏今日热门 glThreads(fid)
        let hotThreads = [];
        try {
            const glData = await this.client.getGlThreads(fid);
            const rawHots = glData?.glThreads || [];
            for (const h of rawHots) {
                const tid = Number(h?.tid);
                if (!Number.isFinite(tid)) continue;
                // glThreads 缺失 lastpost 字段，必须兜底避免入库为0导致在同一流程 pruneExpired 时被秒杀
                h.lastpost = h.lastpost || h.dateline || Date.now();
                hotThreads.push(h);

                // 若在全部列表中未出现，补充合并入库
                if (!seenTids.has(tid)) {
                    seenTids.add(tid);
                    const res = classifyThread(h);
                    h.category = res.category;
                    h.score = res.score;
                    h.fid = fid;
                    allFetchedThreads.push(h);
                }
            }
        } catch (err) {
            console.error('[LkongCrawler] 获取 glThreads 热榜失败:', err.message);
        }

        // 3. 落盘 threads 表
        if (allFetchedThreads.length > 0) {
            this.store.saveThreads(allFetchedThreads);
        }

        // 4. 执行官方新晋精选的真实发帖时间戳校验 (防列表假时间诈尸)
        await this.syncDigests(fid);

        // 5. 触发分级生命周期淘汰 (Tiered TTL)
        const pruneStats = this.store.pruneExpired();

        return {
            totalFetched: allFetchedThreads.length,
            hotCount: hotThreads.length,
            newThreadsCount: allFetchedThreads.length,
            filteredIntelsCount: allFetchedThreads.filter(t => t.category === 'gold' || t.category === 'intel').length,
            pruned: pruneStats
        };
    }

    /**
     * 巡检精选列表，下潜首楼提取 real_dateline 校验 7 天生命周期
     */
    async syncDigests(fid = 15) {
        try {
            const digestData = await this.client.getForumPage(fid, 1, 'digest');
            const digestThreads = digestData?.threads || [];
            const now = Date.now();
            const sevenDaysMs = 7 * 86400 * 1000;

            for (let i = 0; i < Math.min(digestThreads.length, MAX_DIGEST_CHECK); i++) {
                const dt = digestThreads[i];
                const tid = Number(dt?.tid);
                if (!Number.isFinite(tid)) continue;

                // 若本地已有且为 active，跳过网络查询
                const existing = this.store.getDigest(tid);
                if (existing) continue;

                // 下潜获取首楼真实创建时间
                try {
                    const threadDetail = await this.client.getThreadPage(tid, 1);
                    const firstPost = threadDetail?.posts?.[0];
                    if (!firstPost) continue;

                    const realDateline = firstPost.dateline || (firstPost.editTime ? firstPost.editTime : dt.dateline);

                    // 严格卡死：必须是一周（7天）内新创建的帖子
                    if (now - realDateline <= sevenDaysMs) {
                        const parsedFirst = slateToText(firstPost.content);
                        const rawContent = parsedFirst.text || '';
                        this.store.saveDigest({
                            tid,
                            title: dt.title,
                            author_name: dt.author?.name || firstPost.user?.name || '',
                            real_dateline: realDateline,
                            summary: rawContent.slice(0, 360).replace(/\s+/g, ' ').trim(),
                            value: '官方加精认可，具有极高行业参考价值与实战指导意义'
                        });

                        // 顺带持久化正文和楼层，避免后续被删后内容灭失
                        const postsList = (threadDetail?.posts || []).map(p => {
                            const parsed = slateToText(p.content);
                            return {
                                pid: p.pid,
                                tid,
                                lou: p.lou,
                                uid: p.user?.uid || 0,
                                author_name: p.user?.name || '',
                                dateline: p.dateline || 0,
                                content: parsed.text,
                                images: parsed.images,
                                score: 0
                            };
                        });
                        this.store.savePosts(postsList);

                        // 确保精选帖存在于 threads 表中（若常规翻页未收录该帖则先补全元数据，防止 snapshot 为 no-op）
                        if (!this.store.getThread(tid)) {
                            this.store.saveThreads([{
                                tid,
                                fid,
                                title: dt.title || '',
                                author: {
                                    uid: firstPost.user?.uid || dt.author?.uid || 0,
                                    name: dt.author?.name || firstPost.user?.name || ''
                                },
                                dateline: realDateline,
                                lastpost: dt.lastpost || realDateline,
                                replies: dt.replies || (threadDetail?.posts?.length ? threadDetail.posts.length - 1 : 0),
                                views: dt.views || 0,
                                digest: 1,
                                category: 'gold',
                                score: 100,
                                first_content: rawContent,
                                images: parsedFirst.images
                            }]);
                        }

                        this.store.updateThreadSnapshot(tid, {
                            first_content: rawContent,
                            images: parsedFirst.images,
                            summary: rawContent.slice(0, 360).replace(/\s+/g, ' ').trim(),
                            value: '官方加精认可，具有极高行业参考价值与实战指导意义',
                            is_deleted: 0
                        });
                    }
                    await new Promise(r => setTimeout(r, 500));
                } catch (e) {
                    console.error(`[LkongCrawler] 校验精选帖 ${tid} 首楼失败:`, e.message);
                }
            }
        } catch (err) {
            console.error('[LkongCrawler] 同步精选列表失败:', err.message);
        }
    }

    /**
     * 深度下潜精读选定帖子（干货帖、吃瓜大瓜核心帖）：
     * 1. 本地已有且非空则 0 网络开销直读本地
     * 2. 本地缺失则通过 GraphQL 拉取首楼与前排回帖，解析 Slate 树并持久化至 posts 和 threads 表
     * 3. 遇到删帖/404时保留本地已存快照并标记 is_deleted
     */
    async deepCrawlThreads(tids, options = {}) {
        if (!Array.isArray(tids) || tids.length === 0) return [];
        const delayMs = options.delayMs || 600;
        const results = [];

        for (const rawTid of tids) {
            const tid = Number(rawTid);
            if (!Number.isFinite(tid)) continue;

            const localThread = this.store.getThread(tid);
            const localPosts = this.store.getPosts(tid);

            // 缓存命中：本地已精读且有首楼内容与楼层数据
            // 缓存命中：本地已精读（is_deep_crawled）且已有楼层数据，避免纯表情或空首楼导致假击穿
            if (localThread && localThread.is_deep_crawled && localPosts.length > 0) {
                results.push({
                    ...localThread,
                    posts: localPosts,
                    fromCache: true
                });
                continue;
            }

            // 本地无详情或未完成下潜，发起网络抓取
            try {
                const threadDetail = await this.client.getThreadPage(tid, 1);
                const rawPosts = threadDetail?.posts;

                // 遇到原帖已删或不存在
                if (!Array.isArray(rawPosts) || rawPosts.length === 0) {
                    if (localThread) {
                        this.store.updateThreadSnapshot(tid, { is_deleted: 1 });
                        results.push({
                            ...localThread,
                            is_deleted: 1,
                            posts: localPosts,
                            fromCache: true,
                            wasDeleted: true
                        });
                    }
                    continue;
                }

                // 正常解析所有楼层
                const firstRaw = rawPosts[0];
                const firstParsed = slateToText(firstRaw.content);
                const firstContent = firstParsed.text || '';
                const firstImages = firstParsed.images || [];

                const postsToSave = rawPosts.map(p => {
                    const parsed = slateToText(p.content);
                    return {
                        pid: p.pid,
                        tid,
                        lou: p.lou,
                        uid: p.user?.uid || 0,
                        author_name: p.user?.name || '',
                        dateline: p.dateline || 0,
                        content: parsed.text,
                        images: parsed.images,
                        score: 0
                    };
                });

                // 持久化楼层
                this.store.savePosts(postsToSave);

                // 更新 threads 快照
                this.store.updateThreadSnapshot(tid, {
                    first_content: firstContent,
                    images: firstImages,
                    is_deleted: 0
                });

                const updatedThread = this.store.getThread(tid);
                results.push({
                    ...(updatedThread || { tid }),
                    posts: postsToSave,
                    fromCache: false
                });

                await new Promise(r => setTimeout(r, delayMs));
            } catch (err) {
                console.error(`[LkongCrawler] 下潜抓取 tid: ${tid} 失败:`, err.message);
                // 接口报错或404时若本地有旧快照，退守本地
                if (localThread) {
                    results.push({
                        ...localThread,
                        posts: localPosts,
                        fromCache: true,
                        fetchError: err.message
                    });
                }
            }
        }

        return results;
    }
}

module.exports = { LkongCrawler, MAX_CATCHUP_PAGES };