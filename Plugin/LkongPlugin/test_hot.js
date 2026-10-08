const fs = require('fs');
const https = require('https');

function getHtml(path) {
    return new Promise((resolve) => {
        https.get('https://www.lkong.com' + path, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            }
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(data));
        }).on('error', () => resolve(''));
    });
}

(async () => {
    const threadHtml = await getHtml('/thread/5971052');
    const forumHtml = await getHtml('/forum/15');
    
    function findSideHot(html) {
        const matches = [];
        const regex = /今日热门[\s\S]{1,1000}?<\/div>/g;
        let m;
        while ((m = regex.exec(html)) !== null) {
            matches.push(m[0]);
        }
        return matches;
    }

    fs.writeFileSync('F:/VCP/VCPToolBox/Plugin/LkongPlugin/html_side.json', JSON.stringify({
        threadSide: findSideHot(threadHtml),
        forumSide: findSideHot(forumHtml),
        hasBoringInThread: threadHtml.includes('起点的书真的好无聊'),
        hasBoringInForum: forumHtml.includes('起点的书真的好无聊')
    }, null, 2), 'utf8');
})();