const fs = require('fs');
const { LkongClient } = require('./lib/lkong');

(async () => {
    const client = new LkongClient();

    // 1. threadsFragment(fid: 15, type: "hot")
    const hotsRes = await client.getForumHotSidebar(15);
    const hots = hotsRes?.hots || [];

    // 2. glThreads(fid: 15)
    const glRes = await client.getGlThreads(15);
    const gls = glRes?.glThreads || [];

    // 3. 检查《起点的书真的好无聊》
    const targetTitle = '起点的书真的好无聊';
    const inHots = hots.find(x => x.title.includes(targetTitle));
    const inGls = gls.find(x => x.title.includes(targetTitle));

    fs.writeFileSync('F:/VCP/VCPToolBox/Plugin/LkongPlugin/probe_diff.json', JSON.stringify({
        hots_count: hots.length,
        hots_list: hots,
        gls_count: gls.length,
        gls_top10: gls.slice(0, 10),
        inHots,
        inGls
    }, null, 2), 'utf8');
})();