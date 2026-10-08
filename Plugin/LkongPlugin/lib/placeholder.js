'use strict';
// 龙空雷达静态占位符生成器 (Placeholder Generator)
// 在开机未主动查询时，只占用一行提示，显示离线时长、新帖积压量、初筛候选与 Cookie 状态。

class LkongPlaceholder {
    /**
     * 生成系统上下文单行占位文本
     * @param {Object} store - LkongStore 实例
     * @param {number} fid - 板块ID
     * @param {boolean} [authValid=true] - 登录态是否有效
     * @returns {string}
     */
    static getStatusLine(store, fid = 15, authValid = true) {
        if (!authValid) {
            return `[龙空雷达] ⚠️ 登录态已失效或未配置 Cookie，请主人更新配置。`;
        }

        const lastSyncTime = parseInt(store.getCursor(`last_sync_time_${fid}`) || 0, 10);
        const lastTid = parseInt(store.getCursor(`cursor_fid_${fid}`) || 0, 10);

        let timeDesc = '首次运行';
        if (lastSyncTime > 0) {
            const diffHours = Math.round((Date.now() - lastSyncTime) / (3600 * 1000));
            if (diffHours < 1) {
                timeDesc = '刚刚同步';
            } else if (diffHours < 24) {
                timeDesc = `距上次查看 ${diffHours} 小时`;
            } else {
                const days = Math.round(diffHours / 24);
                timeDesc = `距上次查看 ${days} 天`;
            }
        }

        const intels = store.getDailyIntels(100);
        const golds = intels.filter(t => t.category === 'gold');

        return `[龙空·网文江湖] ${timeDesc}，库中积压待阅干货 ${golds.length} 篇、情报 ${intels.length} 条 (最新tid: ${lastTid || '待拉取'})。主人问"龙空今天怎样"时调用 LkongPlugin 展开完整日报。`;
    }
}

module.exports = LkongPlaceholder;