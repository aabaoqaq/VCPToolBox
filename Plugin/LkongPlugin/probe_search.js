const fs = require('fs');

function analyzeFile(filename) {
    if (!fs.existsSync(filename)) {
        return { exists: false };
    }
    const content = fs.readFileSync(filename, 'utf8');
    const hasHot = content.includes('今日热门');
    const hasBookBoring = content.includes('起点的书真的好无聊');
    const hasWuzei = content.includes('回头再看小乌贼喷鹤守');

    // 搜索包含“今日热门”附近的文本
    let snippet = '';
    const idx = content.indexOf('今日热门');
    if (idx !== -1) {
        snippet = content.slice(Math.max(0, idx - 100), idx + 800);
    }

    return {
        exists: true,
        size: content.length,
        hasHot,
        hasBookBoring,
        hasWuzei,
        snippet
    };
}

const f15 = analyzeFile('F:/VCP/VCPToolBox/Plugin/LkongPlugin/forum15_dump.html');
const home = analyzeFile('F:/VCP/VCPToolBox/Plugin/LkongPlugin/home_dump.html');

fs.writeFileSync('F:/VCP/VCPToolBox/Plugin/LkongPlugin/probe_analysis.json', JSON.stringify({ f15, home }, null, 2), 'utf8');