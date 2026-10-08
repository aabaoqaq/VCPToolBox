'use strict';
// 龙空 GraphQL 只读客户端。查询语句均为第0步接口逆向中真实验证通过的版本。
// 铁律：只允许白名单内的只读 query；任何写操作一律拒绝，绝不动用账号发帖/回帖。
const fs = require('fs');
const path = require('path');
const https = require('https');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

const DEFAULTS = {
    apiBase: 'https://api.lkong.com/api',
    cookie: '',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.95 Safari/537.36',
    defaultFid: 15,
    minDelayMs: 1500,
    maxDelayMs: 3500,
    timeoutMs: 25000
};

// 真实验证通过的只读查询（operationName -> query 文本）。不在此表中的操作一律拒绝。
const QUERIES = {
    GetMe: 'query GetMe { me { uid name } }',
    ViewForumPage: 'query ViewForumPage($fid: Int!, $page: Int, $action: String) { threads(fid: $fid, action: $action, page: $page) { tid title fid dateline lastpost digest highlight author { uid name verify { type info } } replies views status lock first page forum { name } tags { id name } } }',
    ViewForumNewThreadNums: 'query ViewForumNewThreadNums($fid: Int!, $time: Date!, $action: String) { forumNewThreadNums(fid: $fid, action: $action, since: $time) }',
    ViewThreadPage: 'query ViewThreadPage($tid: Int!, $page: Int) { posts(tid: $tid, page: $page) { lou pid content dateline editTime digest status lock warning longjing user { uid name adminLevel level { name num } verify { type info } } rate { num reason } quote { pid } } }',
    ViewGlThreads: 'query ViewGlThreads($fid: Int!) { glThreads(fid: $fid) { tid title replies dateline } }',
    ViewForumHotSidebar: 'query ViewForumHotSidebar($fid: Int!) { hots: threadsFragment(fid: $fid, type: "hot") { tid title } }'
};

// 显式写操作黑名单——即使被误加进白名单也会被这层拦下（纵深防御）。
const WRITE_BLACKLIST = new Set([
    'NewThread', 'Reply', 'ReplyPostQuery', 'ReplyThreadQuery', 'EditPost', 'Modify',
    'Login', 'TwoWayLogin', 'SignUp', 'AddBook', 'UpdateDraft', 'ForgetPassword',
    'DeletePost', 'DeleteThread', 'Rate', 'Vote'
]);

function loadConfig() {
    let cfg = Object.assign({}, DEFAULTS);
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            cfg = Object.assign(cfg, JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')));
        }
    } catch (e) { /* 配置损坏时退回默认，由调用方的 test_auth 暴露问题 */ }
    return cfg;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

class LkongClient {
    constructor(cfg) {
        this.cfg = cfg || loadConfig();
        this._lastReqAt = 0;
    }

    // 底层 HTTPS。只负责发请求+解 GraphQL 错误，不含业务。
    _http(payload) {
        return new Promise((resolve, reject) => {
            const url = new URL(this.cfg.apiBase);
            const data = JSON.stringify(payload);
            const options = {
                hostname: url.hostname,
                port: 443,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data),
                    'User-Agent': this.cfg.userAgent,
                    'Cookie': this.cfg.cookie || '',
                    'Origin': 'https://www.lkong.com',
                    'Referer': 'https://www.lkong.com/forum/' + (this.cfg.defaultFid || 15),
                    'Accept': '*/*',
                    'Accept-Language': 'zh-CN,zh;q=0.9'
                },
                timeout: this.cfg.timeoutMs
            };
            const req = https.request(options, (res) => {
                const chunks = [];
                res.on('data', (d) => chunks.push(d));
                res.on('end', () => {
                    const body = Buffer.concat(chunks).toString('utf-8');
                    // 登录失效时龙空常返回非 JSON 或鉴权错误，交给上层识别
                    if (res.statusCode === 401 || res.statusCode === 403) {
                        return reject(new Error('AUTH_FAILED: HTTP ' + res.statusCode));
                    }
                    let parsed;
                    try {
                        parsed = JSON.parse(body);
                    } catch (e) {
                        return reject(new Error('响应解析失败(HTTP ' + res.statusCode + '): ' + body.slice(0, 200)));
                    }
                    if (parsed.errors && parsed.errors.length > 0) {
                        return reject(new Error(parsed.errors.map((e) => e.message).join('; ')));
                    }
                    resolve(parsed.data || parsed);
                });
            });
            req.on('error', (e) => reject(e));
            req.on('timeout', () => { req.destroy(); reject(new Error('请求龙空超时(' + this.cfg.timeoutMs + 'ms)')); });
            req.write(data);
            req.end();
        });
    }

    // 只读调用入口：双重校验 + 节流延迟。
    async _call(operationName, variables) {
        if (WRITE_BLACKLIST.has(operationName)) {
            throw new Error('只读插件拒绝写操作: ' + operationName);
        }
        if (!QUERIES[operationName]) {
            throw new Error('拒绝：不在只读白名单中的操作: ' + operationName);
        }
        // 非首次请求时按随机间隔节流，模拟人类翻阅节奏
        if (this._lastReqAt) {
            const elapsed = Date.now() - this._lastReqAt;
            const need = randInt(this.cfg.minDelayMs, this.cfg.maxDelayMs);
            if (elapsed < need) await sleep(need - elapsed);
        }
        this._lastReqAt = Date.now();
        return this._http({ operationName, query: QUERIES[operationName], variables: variables || {} });
    }

    // ---- 业务方法（全部只读）----
    getMe() {
        return this._call('GetMe', {});
    }
    getForumPage(fid, page, action) {
        return this._call('ViewForumPage', { fid: parseInt(fid, 10), page: parseInt(page || 1, 10), action: action || '' });
    }
    getNewThreadNums(fid, sinceMs, action) {
        return this._call('ViewForumNewThreadNums', { fid: parseInt(fid, 10), time: sinceMs, action: action || '' });
    }
    getThreadPage(tid, page) {
        return this._call('ViewThreadPage', { tid: parseInt(tid, 10), page: parseInt(page || 1, 10) });
    }
    getGlThreads(fid) {
        return this._call('ViewGlThreads', { fid: parseInt(fid || this.cfg.defaultFid || 15, 10) });
    }
    getForumHotSidebar(fid) {
        return this._call('ViewForumHotSidebar', { fid: parseInt(fid || this.cfg.defaultFid || 15, 10) });
    }
}
module.exports = { LkongClient, loadConfig, QUERIES, WRITE_BLACKLIST };