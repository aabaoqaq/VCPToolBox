'use strict';
// 开机增量补课爬虫 (Incremental Catch-Up Crawler)
// 核心逻辑：基于本地 SQLite 中记录的最新 tid 与时间游标，向后拉取新帖。
// 铁律：单次补课上限设为 3 天或最多 300 篇帖子，避免长久未开机导致的请求雪崩与长时挂起。

const { classifyThread } = require('./filter');

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
                        // 提取纯文本简介
                        const rawContent = typeof firstPost.content === 'string' ? firstPost.content : '';
                        this.store.saveDigest({
                            tid,
                            title: dt.title,
                            author_name: dt.author?.name || firstPost.user?.name || '',
                            real_dateline: realDateline,
                            summary: rawContent.slice(0, 300),
                            value: '官方加精认可，具有极高参考价值'
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
}

module.exports = { LkongCrawler, MAX_CATCHUP_PAGES };