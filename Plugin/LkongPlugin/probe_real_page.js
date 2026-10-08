const https = require('https');
const fs = require('fs');

function fetchPage(urlPath) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'www.lkong.com',
            port: 443,
            path: urlPath,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9'
            }
        };
        const req = https.request(options, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('error', reject);
        req.end();
    });
}

(async () => {
    // 1. 抓取板块页 /forum/15
    const forumRes = await fetchPage('/forum/15');
    fs.writeFileSync('F:/VCP/VCPToolBox/Plugin/LkongPlugin/forum15_dump.html', forumRes.body, 'utf8');

    // 2. 抓取全站首页 /
    const homeRes = await fetchPage('/');
    fs.writeFileSync('F:/VCP/VCPToolBox/Plugin/LkongPlugin/home_dump.html', homeRes.body, 'utf8');

    console.log('forum15 len:', forumRes.body.length, 'home len:', homeRes.body.length);
})();