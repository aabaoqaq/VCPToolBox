/**
 * 数据管理模块
 * 封装 localStorage 操作，区分 'public' 和 'private' 数据集
 */
const StorageMgr = {
    // 默认数据
    defaults: {
        public: [
            { title: "Bilibili", url: "https://www.bilibili.com", icon: "https://www.bilibili.com/favicon.ico" },
            { title: "GitHub", url: "https://github.com", icon: "https://github.com/favicon.ico" },
            { title: "VCP Forum", url: "https://vcp.club", icon: "assets/icons/icon.png" }
        ],
        private: [
            { title: "JavBus", url: "https://javbus.com", icon: "https://javbus.com/favicon.ico" },
            { title: "MissAV", url: "https://missav.com", icon: "https://missav.com/favicon.ico" },
            { title: "Discord", url: "https://discord.com", icon: "https://discord.com/favicon.ico" }
        ]
    },

    getPublicLinks: function() {
        const data = localStorage.getItem('pt_public_links');
        return data ? JSON.parse(data) : this.defaults.public;
    },

    getPrivateLinks: function() {
        const data = localStorage.getItem('pt_private_links');
        return data ? JSON.parse(data) : this.defaults.private;
    },

    savePublicLinks: function(links) {
        localStorage.setItem('pt_public_links', JSON.stringify(links));
    },

    savePrivateLinks: function(links) {
        localStorage.setItem('pt_private_links', JSON.stringify(links));
    }
};