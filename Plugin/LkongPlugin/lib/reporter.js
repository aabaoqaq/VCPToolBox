'use strict';
// 龙空网文日报排版生成器 (Reporter) v2.1 —— 全内联样式版
// ============================================================
// 核心修复: VCPChat 气泡净化器会剥离 <style> 标签与 class 属性，
// 依赖 class 上色的 HTML 在气泡内链接颜色会回落到客户端主题蓝。
// 本版将全部样式逐一映射进元素 style 属性 (0 style 标签 / 0 class)，
// 确保 VCPChat 气泡与独立浏览器存档双端渲染一致且颜色正确。
// ============================================================

// 全局样式常量 (单一事实来源，改一处全量生效)
const S = {
    container: "max-width:820px;margin:0 auto 20px auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Source Han Sans CN','Microsoft YaHei',sans-serif;background-color:#f7f4ed;background-image:radial-gradient(circle at 75% 8%,rgba(200,60,45,0.08) 0%,transparent 22%),radial-gradient(circle at 85% 15%,rgba(60,75,85,0.06) 0%,transparent 45%);color:#2b2623;border-radius:12px;padding:26px 22px;border:1.5px solid #ded6c8;box-shadow:0 12px 36px rgba(45,35,25,0.06),inset 0 0 0 1px #fcfaf5;position:relative;line-height:1.6;",

    header: "display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1.5px solid #e2dac9;padding-bottom:18px;margin-bottom:22px;position:relative;",
    headerLeft: "display:flex;align-items:center;gap:14px;",
    seal: "width:44px;height:44px;background:#a83226;border-radius:7px;display:flex;flex-direction:column;justify-content:center;align-items:center;color:#fff;box-shadow:0 3px 10px rgba(168,50,38,0.28),inset 0 0 0 1px rgba(255,255,255,0.2);border:1px solid #8e2318;flex-shrink:0;",
    sealChar: "font-family:'Songti SC','Source Han Serif SC',serif;font-size:20px;font-weight:900;line-height:1;",
    titleMain: "font-family:'Songti SC','Source Han Serif SC','Noto Serif SC',serif;font-size:24px;font-weight:800;color:#1c1815;letter-spacing:2px;",
    titleDot: "display:inline-block;width:6px;height:6px;background:#a83226;border-radius:1px;transform:rotate(45deg);margin-left:6px;",
    titleSub: "font-size:11.5px;color:#9c9183;margin-top:3px;",
    headerRight: "text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:8px;",
    poem: "font-family:'Songti SC','STKaiti',serif;font-size:11.5px;color:#7d7265;line-height:1.4;border-right:2px solid #a83226;padding-right:8px;",
    dateBadge: "background:#a83226;color:#ffffff;font-size:11px;font-weight:700;padding:2px 10px;border-radius:4px;display:inline-block;letter-spacing:0.5px;font-family:monospace;box-shadow:0 2px 6px rgba(168,50,38,0.2);",
    dateSub: "font-size:10.5px;color:#8c8275;margin-top:3px;",

    hotBox: "background:#ffffff;border:1.5px solid #ded6c7;border-radius:8px;padding:14px 18px;margin-bottom:22px;box-shadow:0 4px 14px rgba(60,45,30,0.03),inset 0 0 0 1px #fcfbfa;",
    hotHeader: "display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;",
    hotTitle: "font-size:13.5px;font-weight:800;color:#1c1815;display:flex;align-items:center;gap:6px;",
    hotGrid: "display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:8px;",
    hotItem: "text-decoration:none;background:#fdfcf9;border:1px solid #e2dac9;padding:8px 12px;border-radius:6px;font-size:12.5px;color:#2c2623 !important;font-weight:700;display:flex;justify-content:space-between;align-items:center;gap:8px;box-shadow:0 1px 3px rgba(0,0,0,0.02);line-height:1.4;",
    hotItemText: "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:8px;flex:1;color:#2c2623 !important;",
    hotBadge: "background:#8b5325;color:#ffffff !important;font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:10px;flex-shrink:0;",

    sectionTitle: "display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:14.5px;font-weight:800;color:#1c1815;",
    sectionMeta: "font-size:11.5px;font-weight:600;color:#5c5449;",

    cardBase: "background:#ffffff;border:1.5px solid #ded6c8;border-radius:8px;padding:16px 18px;margin-bottom:14px;box-shadow:0 4px 14px rgba(45,35,25,0.04),inset 0 0 0 1px #fcfbfa;",
    cardGreenLeft: "border-left:5px solid #1e5c3c;",
    cardOchreLeft: "border-left:5px solid #8c3b1e;",
    cardGoldLeft: "border-left:5px solid #8f5a13;",
    cardHeader: "display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;",
    badgeBase: "display:inline-flex;align-items:center;gap:4px;padding:2.5px 9px;border-radius:4px;font-size:11.5px;font-weight:800;",
    badgeGreen: "background:#e3f2e8;color:#144d2d;border:1.5px solid #a3d4b6;",
    badgeOchre: "background:#faede8;color:#7c2d12;border:1.5px solid #eec0b1;",
    badgeGold: "background:#fdf5df;color:#78350f;border:1.5px solid #f2d184;",
    cardTitle: "text-decoration:underline;text-decoration-color:#dcd4c3;font-family:'Songti SC','Source Han Serif SC',serif;font-size:16px;font-weight:900;color:#5c2c16 !important;display:block;margin-bottom:10px;letter-spacing:0.2px;line-height:1.45;",
    cardAuthor: "font-size:11.5px;color:#5c5449;font-weight:600;",
    fieldDesc: "font-size:13px;color:#2b2623;line-height:1.65;margin-bottom:8px;",
    fieldValGreen: "font-size:13px;color:#144d2d;line-height:1.65;border-top:1px dashed #dcd4c3;padding-top:8px;font-weight:500;",
    fieldValOchre: "font-size:13px;color:#7c2d12;line-height:1.65;border-top:1px dashed #dcd4c3;padding-top:8px;font-weight:500;",
    fieldValGold: "font-size:13px;color:#78350f;line-height:1.65;border-top:1px dashed #dcd4c3;padding-top:8px;font-weight:500;",
    strongDark: "color:#1c1815;font-weight:800;",

    details: "background:#ffffff;border:1.5px solid #ded6c8;border-left:5px solid #a83226;border-radius:8px;margin-bottom:16px;overflow:hidden;box-shadow:0 4px 14px rgba(45,35,25,0.04),inset 0 0 0 1px #fcfbfa;",
    summary: "padding:13px 18px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;user-select:none;background:#ffffff;",
    melonBadge: "font-size:11px;font-weight:800;color:#a83226;background:#faede9;border:1px solid #eed0c7;padding:1.5px 7px;border-radius:4px;",
    summaryTitle: "font-family:'Songti SC','Source Han Serif SC',serif;font-size:14.5px;font-weight:800;color:#1c1815;margin-left:8px;",
    detailsBody: "padding:0 18px 14px 18px;font-size:12.5px;color:#433c35;border-top:1px dashed #ede5d8;margin-top:4px;padding-top:10px;",
    disputeBox: "background:#fbf9f4;border:1px solid #eee8dc;padding:10px 12px;border-radius:5px;margin-bottom:8px;line-height:1.55;",
    evidenceList: "font-size:12px;color:#72685c;display:flex;flex-direction:column;gap:5px;",
    evidenceLink: "color:#5c2c16 !important;font-weight:800;text-decoration:underline;text-decoration-color:#8c8275;",

    sentWrap: "font-size:11.5px;color:#7d7265;",
    sentHeader: "display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;",
    progressBar: "height:4px;background:#e5dfd3;border-radius:2px;overflow:hidden;margin-bottom:12px;",
    progressFill: "height:100%;background:linear-gradient(90deg,#d4a359,#a83226);border-radius:2px;",
    noiseDetails: "background:#f2ede2;border-radius:5px;padding:7px 12px;border:1.5px solid #ded6c8;",
    noiseSummary: "cursor:pointer;color:#6e6559;user-select:none;font-size:11px;"
};

class LkongReporter {
    /**
     * 渲染书卷水墨质感 UI —— 全内联样式版 (气泡净化器免疫)
     */
    static formatHtmlReport(data) {
        const now = new Date();

        const hotList = data.hotThreads || [];
        const digests = data.activeDigests || [];
        const golds = data.communityGolds || [];
        const dramas = data.dramas || [];
        const sent = data.sentiment || { anxietyScore: 42, summary: '平稳' };
        const folded = data.foldedNoise || [];

        // 1. 渲染官方7天精选卡片 (金色系 · 无则隐藏)
        let digestSectionHtml = '';
        if (digests.length > 0) {
            const digestCards = digests.map(d => {
                const daysAgo = Math.max(0, Math.floor((Date.now() - d.real_dateline) / (86400 * 1000)));
                const timeText = daysAgo === 0 ? '今天' : daysAgo + '天前';
                return `
                <div style="${S.cardBase}${S.cardGoldLeft}">
                    <div style="${S.cardHeader}">
                        <div>
                            <span style="${S.badgeBase}${S.badgeGold}">👑 官方精选</span>
                            <span style="font-size:11.5px;color:#8c8275;margin-left:6px;">真实发布于 ${timeText}</span>
                        </div>
                        <span style="${S.cardAuthor}">作者：${escapeHtml(d.author_name || '佚名')}</span>
                    </div>
                    <a href="https://www.lkong.com/thread/${d.tid}" target="_blank" style="${S.cardTitle}">《${escapeHtml(d.title)}》</a>
                    <div style="${S.fieldDesc}"><strong style="${S.strongDark}">📖 内容简介：</strong>${escapeHtml(d.summary || '暂无简介')}</div>
                    <div style="${S.fieldValGold}"><strong style="${S.strongDark}">💡 价值简析：</strong>${escapeHtml(d.value || '官方精选干货')}</div>
                </div>`;
            }).join('');
            digestSectionHtml = `
    <div style="margin-bottom:22px;">
        <div style="${S.sectionTitle}">
            <span>👑</span> 官方新晋精选
            <span style="${S.sectionMeta}">(近 7 日内新晋殿堂级好帖 · 真实发帖时间已核验)</span>
        </div>
        ${digestCards}
    </div>`;
        }

        // 2. 渲染民间好帖卡片 (数据类=墨绿系 / 创作类=熟褐系)
        const goldCards = golds.map(g => {
            const isData = (g.tags || []).some(t => t.includes('数据') || t.includes('截图'));
            const cardLeft = isData ? S.cardGreenLeft : S.cardOchreLeft;
            const badge = isData ? S.badgeGreen : S.badgeOchre;
            const badgeText = isData ? '📊 核心数据复盘' : '💡 题材创作实战';
            const fieldVal = isData ? S.fieldValGreen : S.fieldValOchre;
            return `
                <div style="${S.cardBase}${cardLeft}">
                    <div style="${S.cardHeader}">
                        <span style="${S.badgeBase}${badge}">${badgeText}</span>
                        <span style="${S.cardAuthor}">作者：${escapeHtml(g.author || '民间高人')} · ${g.replies || 0}回</span>
                    </div>
                    <a href="https://www.lkong.com/thread/${g.tid}" target="_blank" style="${S.cardTitle}">《${escapeHtml(g.title)}》</a>
                    <div style="${S.fieldDesc}"><strong style="${S.strongDark}">📖 内容简介：</strong>${escapeHtml(g.summary || '')}</div>
                    <div style="${fieldVal}"><strong style="${S.strongDark}">💡 价值简析：</strong>${escapeHtml(g.value || '')}</div>
                </div>`;
        }).join('');

        // 3. 渲染吃瓜脉络折叠卡
        const dramaCards = dramas.map(d => `
            <div style="${S.details}">
                <details open>
                    <summary style="${S.summary}">
                        <span style="display:flex;align-items:center;">
                            <span style="${S.melonBadge}">🔥 聚类大瓜</span>
                            <span style="${S.summaryTitle}">《${escapeHtml(d.eventName)}》</span>
                        </span>
                        <span style="font-size:11.5px;color:#a83226;font-weight:700;">展开证据链 (${d.threadCount}篇) ▾</span>
                    </summary>
                    <div style="${S.detailsBody}">
                        <div style="${S.disputeBox}">
                            <div style="margin-bottom:4px;"><strong>💥 核心争议：</strong>${escapeHtml(d.coreDispute)}</div>
                            <div><strong>⚖️ 涉及立场：</strong>${escapeHtml(d.stances)}</div>
                        </div>
                        <div style="${S.evidenceList}">
                            ${(d.threads || []).map((t, idx) => `
                            <div>
                                ${idx + 1}. <a href="https://www.lkong.com/thread/${t.tid}" target="_blank" style="${S.evidenceLink}">《${escapeHtml(t.title)}》</a>
                                ${t.hasImages ? '<span style="background:#f0e9dc;padding:1px 4px;border-radius:2px;font-size:10px;color:#85612c;">📷 含截图证据</span>' : ''}
                                <span style="color:#8c8275;">(${t.replies}回)</span>
                            </div>`).join('')}
                        </div>
                    </div>
                </details>
            </div>`).join('');

        // 4. 组装全景模板 (0 style 标签 / 0 class · 双端一致渲染)
        return `
<div id="vcp-root" style="${S.container}">

    <!-- Header -->
    <div style="${S.header}">
        <div style="${S.headerLeft}">
            <div style="${S.seal}"><span style="${S.sealChar}">書</span></div>
            <div>
                <div style="display:flex;align-items:baseline;">
                    <span style="${S.titleMain}">网文江湖</span>
                    <span style="${S.titleDot}"></span>
                </div>
                <div style="${S.titleSub}">发现好书 · 追踪热点 · 与千万书友一起看更好的网文</div>
            </div>
        </div>
        <div style="${S.headerRight}">
            <div style="${S.poem}">一卷江湖梦<br>万千人间事</div>
            <div>
                <div style="${S.dateBadge}">${now.getFullYear()}·${String(now.getMonth() + 1).padStart(2, '0')}·${String(now.getDate()).padStart(2, '0')}</div>
                <div style="${S.dateSub}">今日更新 · 热门榜单</div>
            </div>
        </div>
    </div>

    <!-- Zone 1：今日全站热议榜 -->
    <div style="${S.hotBox}">
        <div style="${S.hotHeader}">
            <div style="${S.hotTitle}">
                <span style="color:#c2410c;font-size:14px;">🔥</span> 今日全站热议榜 <span style="font-size:11px;font-weight:400;color:#9c9183;">/ Trending Topics</span>
            </div>
            <a href="https://www.lkong.com/forum/15" target="_blank" style="text-decoration:none;font-size:11px;color:#8c8275 !important;">查看更多热搜 &gt;</a>
        </div>
        <div style="${S.hotGrid}">
            ${hotList.map(h => `
            <a href="https://www.lkong.com/thread/${h.tid}" target="_blank" style="${S.hotItem}">
                <span style="${S.hotItemText}">${escapeHtml(h.title)}</span>
                <span style="${S.hotBadge}">${h.replies || 0}回</span>
            </a>`).join('')}
        </div>
    </div>

    <!-- Zone 2：官方新晋精选 (无则优雅隐藏) -->
    ${digestSectionHtml}

    <!-- Zone 3：精选行业干货 (全量平铺不限量) -->
    <div style="margin-bottom:22px;">
        <div style="${S.sectionTitle}">
            <span>🪶</span> 精选行业干货与经验复盘
            <span style="${S.sectionMeta}">(高价值实战 · 共 ${golds.length} 篇)</span>
        </div>
        ${goldCards}
    </div>

    <!-- Zone 4：吃瓜脉络与同类项归并 -->
    <div style="margin-bottom:22px;">
        <div style="${S.sectionTitle}">
            <span>🍉</span> 行业焦点与吃瓜脉络
            <span style="${S.sectionMeta}">(多帖聚类 · 原生可折叠证据链)</span>
        </div>
        ${dramaCards}
    </div>

    <!-- Zone 5：行业情绪温度 & 降噪纯水审计 -->
    <div style="${S.sentWrap}">
        <div style="${S.sentHeader}">
            <span style="color:#2b2623;font-weight:700;">
                🌡️ 行业情绪指数：${sent.anxietyScore} / 100 <span style="font-weight:400;color:#8c8275;">(${sent.anxietyScore > 50 ? '高焦虑动荡期' : '平稳创作期'})</span>
            </span>
            <span style="font-size:11px;">${escapeHtml((sent.summary || '').slice(0, 30))}...</span>
        </div>
        <div style="${S.progressBar}">
            <div style="${S.progressFill}width:${sent.anxietyScore}%;"></div>
        </div>

        <details style="${S.noiseDetails}">
            <summary style="${S.noiseSummary}">
                ▶ 🗂️ 隐藏纯水审计 (已清洗 ${folded.length} 篇数据，求书与日常闲扯，点击查验) ▾
            </summary>
            <div style="font-size:11px;color:#8a7e70;line-height:1.6;margin-top:6px;padding-top:6px;border-top:1px dashed #ddd4c5;">
                ${folded.slice(0, 6).map(f => '• [' + escapeHtml(f.title) + '] (' + f.replies + ' 回)').join('<br>\n')}
                ${folded.length > 6 ? '<br>• ...等其余更多闲聊贴已安全隔离' : ''}
            </div>
        </details>

        <div style="text-align:center;margin-top:14px;font-size:10px;color:#ad9f8d;font-family:monospace;">
            VCP LkongPlugin v2.1 · 全内联气泡版 · SQLite 本地多维打分引擎驱动
        </div>
    </div>
</div>
        `;
    }
}

function escapeHtml(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

module.exports = LkongReporter;