'use strict';
// 龙空图片本地安全缓存层 (Media Downloader & Cache)
// 痛点：直接将 images.lkong.com 链接交给 Agent 多模态往往会遭遇 403 防盗链阻断。
// 本模块携带合法 Referer 与 UA 下载图片到本地 cache 目录，并进行 SHA-256 去重。

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

const CACHE_DIR = path.join(__dirname, '..', 'cache', 'images');

class LkongMediaManager {
    constructor(cacheDir = CACHE_DIR) {
        this.cacheDir = cacheDir;
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    /**
     * 将远端图片下载到本地缓存
     * @param {string} imgUrl - 图片URL
     * @param {number} [timeoutMs=15000] - 超时毫秒
     * @returns {Promise<{ localPath: string, isCached: boolean, size: number }>}
     */
    downloadImage(imgUrl, timeoutMs = 15000) {
        return new Promise((resolve, reject) => {
            if (!imgUrl || typeof imgUrl !== 'string') {
                return reject(new Error('无效图片URL'));
            }

            const urlHash = crypto.createHash('sha256').update(imgUrl).digest('hex').slice(0, 16);
            const ext = path.extname(new URL(imgUrl).pathname) || '.jpg';
            const localFileName = `${urlHash}${ext}`;
            const localPath = path.join(this.cacheDir, localFileName);

            // 若已有本地缓存，直接返回本地路径（命中缓存）
            if (fs.existsSync(localPath)) {
                const stat = fs.statSync(localPath);
                if (stat.size > 0) {
                    return resolve({ localPath, isCached: true, size: stat.size });
                }
            }

            const parsedUrl = new URL(imgUrl);
            const isHttps = parsedUrl.protocol === 'https:';
            const client = isHttps ? https : http;

            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (isHttps ? 443 : 80),
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.95 Safari/537.36',
                    'Referer': 'https://www.lkong.com/',
                    'Origin': 'https://www.lkong.com',
                    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
                },
                timeout: timeoutMs
            };

            const req = client.request(options, (res) => {
                if (res.statusCode !== 200) {
                    return reject(new Error(`图片下载失败: HTTP ${res.statusCode}`));
                }

                const fileStream = fs.createWriteStream(localPath);
                let totalSize = 0;

                res.on('data', (chunk) => {
                    totalSize += chunk.length;
                });

                res.pipe(fileStream);

                fileStream.on('finish', () => {
                    fileStream.close(() => {
                        resolve({ localPath, isCached: false, size: totalSize });
                    });
                });

                fileStream.on('error', (err) => {
                    try { fs.unlinkSync(localPath); } catch (e) {}
                    reject(err);
                });
            });

            req.on('error', (e) => {
                try { fs.unlinkSync(localPath); } catch (err) {}
                reject(e);
            });

            req.on('timeout', () => {
                req.destroy();
                try { fs.unlinkSync(localPath); } catch (err) {}
                reject(new Error(`下载图片超时(${timeoutMs}ms)`));
            });

            req.end();
        });
    }

    /**
     * 批量下载图片（限流串行，避免击穿图床）
     * @param {string[]} imgUrls
     * @returns {Promise<Array<{ url: string, localPath: string|null, error?: string }>>}
     */
    async downloadImagesBatch(imgUrls) {
        const results = [];
        for (const url of imgUrls) {
            try {
                const res = await this.downloadImage(url);
                results.push({ url, localPath: res.localPath, size: res.size });
            } catch (err) {
                results.push({ url, localPath: null, error: err.message });
            }
            // 友好休眠 200ms
            await new Promise(r => setTimeout(r, 200));
        }
        return results;
    }
}

module.exports = { LkongMediaManager, CACHE_DIR };