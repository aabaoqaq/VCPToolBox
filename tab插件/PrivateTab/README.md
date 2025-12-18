# PrivateTab - 隐身新标签页

## 简介
这是一个注重隐私保护的 Chrome 新标签页扩展。它表面上是一个极简的搜索页，但在“天气组件”背后隐藏了一个私密的网址导航。

## 安装方法
1. 打开 Chrome 浏览器，进入 `chrome://extensions/`
2. 开启右上角的 **"开发者模式" (Developer mode)**
3. 点击 **"加载已解压的扩展程序" (Load unpacked)**
4. 选择本目录 `F:\VCP\VCPToolBox\tab插件\PrivateTab`

## 使用说明
*   **普通模式**: 正常的搜索框和常用网址。
*   **隐身模式**: **双击**右上角的“天气组件”，或者**长按**它，即可展开隐私网址列表。
*   **数据修改**: 目前链接数据存储在 `js/storage.js` 的 `defaults` 对象中，或者通过控制台修改 `localStorage`。

## 目录结构
*   `manifest.json`: 配置文件
*   `newtab.html`: 页面结构
*   `css/`: 样式文件 (style.css, stealth.css)
*   `js/`: 脚本文件 (main.js, stealth.js, storage.js)