/**
 * 主程序
 * 处理普通模式的渲染和基础功能
 */
document.addEventListener('DOMContentLoaded', () => {
    const publicGrid = document.getElementById('public-grid');
    const searchInput = document.querySelector('input[name="q"]');

    // 自动聚焦搜索框
    searchInput.focus();

    // 渲染普通链接
    function renderPublicLinks() {
        const links = StorageMgr.getPublicLinks();
        publicGrid.innerHTML = '';
        links.forEach(link => {
            const a = document.createElement('a');
            a.className = 'link-item';
            a.href = link.url;
            a.innerHTML = `
                <img src="${link.icon}" class="link-icon" onerror="this.src='assets/icons/icon.png'">
                <span class="link-title">${link.title}</span>
            `;
            publicGrid.appendChild(a);
        });
    }

    renderPublicLinks();

    // 简单的天气伪装数据更新 (让它看起来更真实)
    function updateWeatherMock() {
        const tempEl = document.querySelector('#weather-widget .temp');
        const hour = new Date().getHours();
        // 晚上显示月亮，白天显示太阳
        const icon = (hour > 18 || hour < 6) ? '🌙' : '⛅';
        document.querySelector('#weather-widget .icon').textContent = icon;
    }
    
    updateWeatherMock();
});