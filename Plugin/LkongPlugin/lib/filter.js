'use strict';
// 龙空内容三分类初筛引擎：金子 (gold) / 情报 (intel) / 噪音 (noise)。
// 核心原则：过滤散财、短帖对骂、纯灌水；保留设定拆解、行业数据、大纲干货、毒点探讨。

// 纯灌水模式正则（强调首尾独立特征或纯数值散财）
const PURE_NOISE_REGEX = /^(?:散财|红包|打卡|签到|求关注|测试帖?|删帖)|^纯水$|(?:散财|发红包|求暖帖|领钱)\s*\d+|散财楼/;
// 流派/设定豁免词：当标题含有这些词时，即使有“红包/散财/签到”，也是网文题材或写作探讨而非纯灌水
const GENRE_EXEMPTION_REGEX = /(?:红包|散财|签到|抽奖|打卡)(?:流|系统|文|小说|设定|金手指|主角|反派|外挂)|(?:测试|内投|签约).*(?:复盘|总结|分析|探讨|浅析)/;

const INTEL_KEYWORDS = [
    '首订', '均订', '追读', '月票', '稿费', '版权', '改编', '签约', '过稿', '内投',
    '起点', '番茄', '晋江', '纵横', '刺猬猫', '飞卢', '七猫', '买断', '保底', '分成',
    '毒点', '爽点', '金手指', '世界观', '设定', '大纲', '节奏', '主角', '反派', '主线',
    '榜单', '畅销', '新书', '万订', '风向', '断更', '太监', '完本', '崩盘', '同人'
];

const GOLD_KEYWORDS = [
    '复盘', '拆书', '拆解', '深度', '经验总结', '写作技巧', '设定集', '细纲',
    '投稿指南', '防坑', '签约指南', '核心设定', '题材分析', '数据统计', '干货'
];

/**
 * 对主题帖进行规则打分与分类
 * @param {Object} thread - 龙空主题帖对象
 * @param {string} [firstPostText] - 楼主首楼正文（如果有）
 * @param {Object} [slateStats] - slate 结构分析统计（heading, list, table 等）
 * @returns {{ category: 'gold'|'intel'|'noise', score: number, reasons: string[] }}
 */
function classifyThread(thread, firstPostText = '', slateStats = { structure: 0 }) {
    if (!thread || typeof thread !== 'object') {
        return { category: 'noise', score: -100, reasons: ['无效帖子对象'] };
    }

    const title = typeof thread.title === 'string' ? thread.title : '';
    const replies = Number.isFinite(thread.replies) ? thread.replies : (parseInt(thread.replies, 10) || 0);
    const views = Number.isFinite(thread.views) ? thread.views : (parseInt(thread.views, 10) || 0);
    const digest = !!thread.digest;
    const reasons = [];
    let score = 0;

    // 1. 噪音过滤与流派题材豁免检查
    const isPureNoise = PURE_NOISE_REGEX.test(title);
    const isGenreExempt = GENRE_EXEMPTION_REGEX.test(title);

    if (isPureNoise && !isGenreExempt) {
        return { category: 'noise', score: -100, reasons: ['命中纯灌水/散财特征且无流派豁免'] };
    }

    // 2. 精华帖与高价值加权
    if (digest) {
        score += 50;
        reasons.push('版主加精(+50)');
    }

    // 3. 标题与正文关键词匹配
    let goldMatches = 0;
    for (const kw of GOLD_KEYWORDS) {
        if (title.includes(kw)) {
            score += 25;
            goldMatches++;
            reasons.push(`标题命中干货词[${kw}](+25)`);
        }
    }

    let intelMatches = 0;
    for (const kw of INTEL_KEYWORDS) {
        if (title.includes(kw)) {
            score += 10;
            intelMatches++;
            reasons.push(`标题命中行业词[${kw}](+10)`);
        }
    }

    // 4. 正文结构分 (如果提供了楼主解析数据)
    const textLen = firstPostText.length;
    if (textLen > 1000) {
        score += 20;
        reasons.push(`长篇正文(${textLen}字)(+20)`);
    } else if (textLen > 400) {
        score += 10;
        reasons.push(`中篇正文(${textLen}字)(+10)`);
    } else if (textLen > 0 && textLen < 30 && replies < 5) {
        score -= 15;
        reasons.push('短文本低互动(-15)');
    }

    if (slateStats.structure > 0) {
        score += slateStats.structure * 8;
        reasons.push(`排版格式清晰(${slateStats.structure}处结构化标签)(+${slateStats.structure * 8})`);
    }

    // 5. 热度与互动加权
    if (replies >= 50) {
        score += 15;
        reasons.push(`高讨论度(${replies}回复)(+15)`);
    } else if (replies >= 15) {
        score += 8;
        reasons.push(`中等讨论(${replies}回复)(+8)`);
    }

    // 6. 最终归类判定
    let category = 'noise';
    if (score >= 45 || goldMatches >= 1 || digest) {
        category = 'gold';
    } else if (score >= 15 || intelMatches >= 1 || replies >= 20) {
        category = 'intel';
    }

    return {
        category,
        score,
        reasons
    };
}

module.exports = {
    classifyThread,
    INTEL_KEYWORDS,
    GOLD_KEYWORDS
};