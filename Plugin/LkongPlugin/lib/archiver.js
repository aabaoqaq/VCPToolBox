'use strict';
// 抢救式本地 Markdown 存档与知识库切片处理器 (Archiver)
// 目的：龙空优质干货贴容易被锁/删，一旦识别为 Gold 立即在本地落盘完整 Markdown，
// 当主人下令"入库"时，格式化为知识库标准切片文本。

const fs = require('fs');
const path = require('path');

const ARCHIVE_DIR = path.join(__dirname, '..', 'archives');

class LkongArchiver {
    constructor(archiveDir = ARCHIVE_DIR) {
        this.archiveDir = archiveDir;
        if (!fs.existsSync(this.archiveDir)) {
            fs.mkdirSync(this.archiveDir, { recursive: true });
        }
    }

    /**
     * 将主题与楼层保存为抢救式 Markdown
     * @param {Object} thread - 主题帖元数据
     * @param {Array<Object>} posts - 格式化楼层列表
     * @returns {string} 保存的本地文件绝对路径
     */
    saveThreadMarkdown(thread, posts = []) {
        const tid = thread.tid;
        const safeTitle = (thread.title || `thread_${tid}`).replace(/[\\/:*?"<>|]/g, '_').slice(0, 50);
        const fileName = `${tid}_${safeTitle}.md`;
        const filePath = path.join(this.archiveDir, fileName);

        const lines = [];
        lines.push(`# ${thread.title}`);
        lines.push(`- **原帖链接**: https://www.lkong.com/thread/${tid}`);
        lines.push(`- **作者**: ${thread.author_name || thread.author?.name || '未知'}`);
        lines.push(`- **发表时间**: ${thread.dateline ? new Date(thread.dateline * 1000).toLocaleString() : '未知'}`);
        lines.push(`- **分类等级**: ${thread.category || 'gold'} (打分: ${thread.score || 0})`);
        lines.push('');
        lines.push('---');
        lines.push('## 楼层正文存档');
        lines.push('');

        for (const p of posts) {
            lines.push(`### #${p.lou} 楼 · ${p.author || '网友'} (${p.level || '普通会员'})`);
            lines.push(p.text || '');
            if (p.images && p.images.length > 0) {
                lines.push('');
                lines.push('**图片存档**:');
                for (const img of p.images) {
                    lines.push(`- ![](${img})`);
                }
            }
            lines.push('');
        }

        fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
        return filePath;
    }

    /**
     * 格式化为言叶的知识入库切片
     * @param {Object} thread
     * @param {string} [firstPostText]
     * @returns {{ title: string, content: string, tag: string }}
     */
    formatForKnowledge(thread, firstPostText = '') {
        const title = `[龙空干货] ${thread.title}`;
        const content = `【核心论点与背景】\n原帖：https://www.lkong.com/thread/${thread.tid}\n作者：${thread.author_name || '龙空老作者'}\n\n【干货内容提纯】\n${firstPostText.slice(0, 1200)}\n\n【收录价值】\n${(thread.reasons || []).join('；') || '网文行业实战与大纲设定经验'}`;
        const tag = `网文江湖, 创作经验, 龙空干货, ${thread.category || 'gold'}`;

        return { title, content, tag };
    }
}

module.exports = { LkongArchiver, ARCHIVE_DIR };