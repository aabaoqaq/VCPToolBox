/**
 * 隐身模式逻辑
 * 处理伪装组件的交互和隐私层的显示
 */
document.addEventListener('DOMContentLoaded', () => {
    const weatherWidget = document.getElementById('weather-widget');
    const stealthLayer = document.getElementById('stealth-layer');
    const closeBtn = document.getElementById('close-stealth');
    const privateGrid = document.getElementById('private-grid');

    // 渲染隐私链接
    function renderPrivateLinks() {
        const links = StorageMgr.getPrivateLinks();
        privateGrid.innerHTML = '';
        links.forEach(link => {
            const a = document.createElement('a');
            a.className = 'link-item';
            a.href = link.url;
            a.innerHTML = `
                <img src="${link.icon}" class="link-icon" onerror="this.src='assets/icons/icon.png'">
                <span class="link-title">${link.title}</span>
            `;
            privateGrid.appendChild(a);
        });
    }

    // 触发隐身模式：双击天气组件
    weatherWidget.addEventListener('dblclick', () => {
        renderPrivateLinks();
        stealthLayer.classList.add('visible');
    });

    // 也可以添加长按触发 (适合触摸屏)
    let pressTimer;
    weatherWidget.addEventListener('mousedown', () => {
        pressTimer = setTimeout(() => {
            renderPrivateLinks();
            stealthLayer.classList.add('visible');
        }, 1000); // 长按1秒
    });
    weatherWidget.addEventListener('mouseup', () => clearTimeout(pressTimer));
    weatherWidget.addEventListener('mouseleave', () => clearTimeout(pressTimer));

    // 关闭隐身模式
    closeBtn.addEventListener('click', () => {
        stealthLayer.classList.remove('visible');
    });

    // 点击背景也可以关闭
    stealthLayer.addEventListener('click', (e) => {
        if (e.target === stealthLayer) {
            stealthLayer.classList.remove('visible');
        }
    });
    
    // 键盘 ESC 关闭
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && stealthLayer.classList.contains('visible')) {
            stealthLayer.classList.remove('visible');
        }
    });
});