'use strict';
// LkongDaily 静态占位符插件入口
// 专为持有 {{VCPLkongDaily}} 的 Agent 提供按需展开服务
const path = require('path');
const lkongPluginDir = path.join(__dirname, '..', 'LkongPlugin');

const { LkongClient } = require(path.join(lkongPluginDir, 'lib', 'lkong'));
const LkongStore = require(path.join(lkongPluginDir, 'lib', 'store'));
const { LkongCrawler } = require(path.join(lkongPluginDir, 'lib', 'crawler'));
const LkongMiner = require(path.join(lkongPluginDir, 'lib', 'miner'));
const LkongReporter = require(path.join(lkongPluginDir, 'lib', 'reporter'));
const LkongPlaceholder = require(path.join(lkongPluginDir, 'lib', 'placeholder'));

async function main() {
    let store;
    try {
        store = new LkongStore();
        const client = new LkongClient();
        const crawler = new LkongCrawler(client, store);

        // 开机自动静默增量补课
        try {
            await crawler.catchUp(15);
        } catch (e) {}

        // 生成默认单行占位符
        let authValid = true;
        try {
            if (!client.cfg.cookie) authValid = false;
        } catch (e) {
            authValid = false;
        }
        const defaultLine = LkongPlaceholder.getStatusLine(store, 15, authValid);

        // 生成全景日报内容
        // 1. 获取原网热门并补齐真实回复数
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

        process.stdout.write(JSON.stringify(foldOutput, null, 2));
    } catch (err) {
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