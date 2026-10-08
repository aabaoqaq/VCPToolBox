'use strict';
// 龙空正文是 Slate 编辑器 JSON 节点数组（非 HTML）。本模块把它转成纯文本，
// 并单独收集图片地址——截图交给 Agent 识读的方案依赖这些 URL。
// 节点类型与文本映射规则照搬龙空前端渲染器，保持与网页显示一致。

const IMG_PREFIX = 'https://images.lkong.com/images/';

// 站内图走 imageKey，外链走 url。
function imageUrl(node) {
    if (node.imageKey) return IMG_PREFIX + node.imageKey + '.jpg';
    if (node.url) return String(node.url);
    return '';
}

// 判断"认真写的长文"信号：出现这些结构节点，基本不是吵架帖。
const STRUCTURE_NODES = new Set(['heading', 'numbered-list', 'bulleted-list', 'table', 'code-block', 'poll']);

function walk(nodes, out, images, stats) {
    if (!Array.isArray(nodes)) nodes = [nodes];
    for (const n of nodes) {
        if (n == null) continue;
        // 叶子文本节点
        if (typeof n.text === 'string') { out.push(n.text); continue; }
        const type = n.type;
        if (STRUCTURE_NODES.has(type)) stats.structure++;
        switch (type) {
            case 'image': {
                const u = imageUrl(n);
                if (u) images.push(u);
                out.push(u ? '[图片:' + u + ']' : '[图片]');
                out.push('\n');
                break;
            }
            case 'video':
                out.push('[视频]');
                out.push('\n');
                break;
            case 'emotion':
                out.push('[表情]'); // 行内元素，不换行
                break;
            case 'divider':
                out.push('——————');
                out.push('\n');
                break;
            case 'break':
                out.push('\n');
                break;
            case 'code-block':
                out.push('[代码]');
                if (n.children) walk(n.children, out, images, stats);
                out.push('\n');
                break;
            case 'link':
                if (n.children) walk(n.children, out, images, stats); // 行内，不换行
                break;
            case 'mention':
                out.push('@' + (n.name || n.uid || ''));
                break;
            case 'lkong-tip':
                if (n.children) walk(n.children, out, images, stats);
                out.push('\n');
                break;
            default:
                // paragraph / heading / list / blockquote 等块级节点
                if (n.children) walk(n.children, out, images, stats);
                out.push('\n');
        }
    }
}

// 入参可以是 Slate JSON 字符串，也可以是已解析的数组。
// 返回 { text, images, structureCount }。
function slateToText(content) {
    let nodes;
    if (typeof content === 'string') {
        try { nodes = JSON.parse(content); }
        catch (e) { return { text: content, images: [], structureCount: 0 }; }
    } else {
        nodes = content;
    }
    const out = [];
    const images = [];
    const stats = { structure: 0 };
    walk(nodes, out, images, stats);
    const text = out.join('').replace(/\n{3,}/g, '\n\n').trim();
    return { text, images, structureCount: stats.structure };
}

module.exports = { slateToText, imageUrl };