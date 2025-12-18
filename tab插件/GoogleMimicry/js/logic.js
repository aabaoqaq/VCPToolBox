// 渲染快捷方式（每行4个，共2行）
function renderShortcuts() {
  const container = document.getElementById('shortcuts-container');
  const itemsPerRow = 4;
  const totalRows = 2;

  for (let row = 0; row < totalRows; row++) {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'shortcuts-row';

    const start = row * itemsPerRow;
    const end = start + itemsPerRow;
    const rowItems = publicShortcuts.slice(start, end);

    rowItems.forEach(item => {
      const link = document.createElement('a');
      link.className = 'shortcut-item';
      link.href = item.url;
      link.dataset.id = item.id;

      const iconDiv = document.createElement('div');
      iconDiv.className = 'shortcut-icon';
      const img = document.createElement('img');
      img.src = item.icon;
      img.alt = item.name;
      iconDiv.appendChild(img);

      const nameDiv = document.createElement('div');
      nameDiv.className = 'shortcut-name';
      nameDiv.textContent = item.name;

      link.appendChild(iconDiv);
      link.appendChild(nameDiv);
      rowDiv.appendChild(link);
    });

    container.appendChild(rowDiv);
  }
}

// 渲染隐私列表
function renderPrivateList() {
  const privateList = document.getElementById('private-list');
  privateShortcuts.forEach(item => {
    const link = document.createElement('a');
    link.className = 'private-item';
    link.href = item.url;
    link.textContent = item.name;
    link.target = '_blank';
    privateList.appendChild(link);
  });
}

// 拦截特定图标点击事件
function setupTrigger() {
  document.addEventListener('click', (e) => {
    const target = e.target.closest('.shortcut-item');
    // 如果点击的是带有 trigger-key ID 的图标（GitHub）
    if (target && target.dataset.id === 'trigger-key') {
      e.preventDefault(); // 阻止默认跳转
      document.getElementById('secret-panel').classList.add('active'); // 显示隐私面板
    }
  });

  // 点击弹窗外部关闭
  const panel = document.getElementById('secret-panel');
  panel.addEventListener('click', (e) => {
    if (e.target === panel) {
      panel.classList.remove('active');
    }
  });
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  renderShortcuts();
  renderPrivateList();
  setupTrigger();
});