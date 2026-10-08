'use strict';
// LkongDaily 静态插件入口脚本 (符合 VCP 动态上下文语义折叠协议 vcp_dynamic_fold)
// 1. 系统开机与日常提问中：默认命中 threshold 0.0，向 Agent 注入单行超轻量占位符（零 Token 浪费，无注意力劫持）。
// 2. 当主人问及"龙空今天怎样"、"网文江湖"、"行业情报"时：触发语义相似度匹配，展开完整的四分区全景日报与楼中黄金。

const { LkongClient } = require('./lib/lkong');
const LkongStore = require('./lib/store');
const { LkongCrawler } = require('./lib/crawler');
const LkongMiner = require('./lib/miner');
const LkongReporter = require('./lib/reporter');
const LkongPlaceholder = require('./lib/placeholder');

async function main() {
    let store;
    try {
        store = new LkongStore();
        const client = new LkongClient();
        const crawler = new LkongCrawler(client, store);

        // 开机自动静默增量补课（捕获最新 tid 与新帖）
        try {
            await crawler.catchUp(15);
        } catch (e) {
            // 网络异常时退守本地已有数据，不阻塞静态输出
        }

        // 1. 生成默认单行占位符 (Threshold 0.0)
        let authValid = true;
        try {
            if (!client.cfg.cookie) authValid = false;
        } catch (e) {
            authValid = false;
        }
        const defaultLine = LkongPlaceholder.getStatusLine(store, 15, authValid);

        // 2. 生成全景日报内容 (用于语义展开区块)
        let hotThreads = [];
        try {
            const hotRes = await client.getForumHotSidebar(15);
            const rawHots = hotRes?.hots || [];
            hotThreads = rawHots.map(h => {
                const row = store.getThread(h.tid);
                return {
                    tid: h.tid,
                    title: h.title,
                    replies: row ? row.replies : 0
                };
            });
            if (hotThreads.length === 0) {
                const glRes = await client.getGlThreads(15);
                hotThreads = (glRes?.glThreads || []).map(g => ({
                    tid: g.tid,
                    title: g.title,
                    replies: g.replies || 0
                }));
            }
        } catch(e) {}

        const activeDigests = store.getActiveDigests(7);
        const recentThreads = store.db.prepare('SELECT * FROM threads WHERE fid = 15 ORDER BY lastpost DESC LIMIT 250').all();
        const communityGolds = LkongMiner.extractCommunityGold(recentThreads);
        const noiseWords = store.getNoiseWords();
        const dramas = LkongMiner.clusterDramas(recentThreads, noiseWords);
        const sentiment = LkongMiner.calculateSentiment(recentThreads);
        const foldedNoise = recentThreads.filter(t => t.category === 'noise');

        const reportHtml = LkongReporter.formatHtmlReport({
            hotThreads,
            activeDigests,
            communityGolds,
            dramas,
            sentiment,
            foldedNoise
        });

        // 构造标准的 vcp_dynamic_fold 协议响应
        const foldOutput = {
            vcp_dynamic_fold: true,
            plugin_description: "龙空网文情报雷达与论坛每日简报，包含网文江湖干货精选、行业政策风向、作品风波事件与圈内情绪温度计",
            dynamic_fold_strategy: "toolbox_block_similarity",
            fold_blocks: [
                {
                    threshold: 0.5,
                    description: "主人询问龙空论坛今天怎样、网文江湖热点、最新行业动态、毒点讨论或干货日报",
                    content: reportHtml
                },
                {
                    threshold: 0.0,
                    description: "默认单行论坛状态与积压情报概况",
                    content: defaultLine
                }
            ]
        };

        // 标准 JSON 输出，由 Plugin.js 自动捕获并存入 staticPlaceholderValues
        process.stdout.write(JSON.stringify(foldOutput, null, 2));
    } catch (err) {
        // 异常兜底输出单行降级提示
        const fallback = {
            vcp_dynamic_fold: true,
            plugin_description: "龙空网文雷达",
            fold_blocks: [
                {
                    threshold: 0.0,
                    description: "降级概况",
                    content: `[龙空·网文江湖] 状态检查异常: ${err.message}`
                }
            ]
        };
        process.stdout.write(JSON.stringify(fallback, null, 2));
    } finally {
        if (store) {
            try { store.close(); } catch (e) {}
        }
        process.exit(0);
    }
}

main();