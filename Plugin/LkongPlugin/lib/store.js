'use strict';
// 本地情报存储层：使用 better-sqlite3 维护 threads、posts 和 cursors 表。
// 支撑开机/定时增量抓取、避免重复解析与请求，并记录 tid 游标。
const path = require('path');
const fs = require('fs');

let Database;
try {
    Database = require('better-sqlite3');
} catch (e) {
    // 兼容环境缺失或路径问题，由调用层处理
}

const DB_PATH = path.join(__dirname, '..', 'lkong_data.db');

class LkongStore {
    constructor(dbPath = DB_PATH) {
        if (!Database) {
            throw new Error('better-sqlite3 模块未安装或不可用');
        }
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.initSchema();
    }

    initSchema() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS cursors (
                key TEXT PRIMARY KEY,
                val TEXT,
                updated_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS threads (
                tid INTEGER PRIMARY KEY,
                fid INTEGER,
                title TEXT,
                author_uid INTEGER,
                author_name TEXT,
                dateline INTEGER,
                lastpost INTEGER,
                replies INTEGER,
                views INTEGER,
                digest INTEGER,
                category TEXT, -- gold / intel / noise / unclassified
                score REAL DEFAULT 0,
                first_content TEXT,
                images TEXT, -- JSON 数组
                raw_json TEXT,
                created_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS posts (
                pid INTEGER PRIMARY KEY,
                tid INTEGER,
                lou INTEGER,
                uid INTEGER,
                author_name TEXT,
                dateline INTEGER,
                content TEXT,
                images TEXT,
                score REAL DEFAULT 0,
                created_at INTEGER
            );

            -- 官方新晋精选指纹池（记录首楼真实发帖时间与双段解析，避免重复提纯与误用）
            CREATE TABLE IF NOT EXISTS digest_pool (
                tid INTEGER PRIMARY KEY,
                title TEXT,
                author_name TEXT,
                real_dateline INTEGER, -- 首楼真实创建时间戳
                summary TEXT,          -- 📖 内容简介
                value TEXT,            -- 💡 价值简析
                is_active INTEGER DEFAULT 1,
                created_at INTEGER
            );

            -- 动态低熵水词库
            CREATE TABLE IF NOT EXISTS noise_patterns (
                word TEXT PRIMARY KEY,
                hit_count INTEGER DEFAULT 1,
                is_custom INTEGER DEFAULT 0,
                created_at INTEGER
            );

            CREATE INDEX IF NOT EXISTS idx_threads_fid_dateline ON threads(fid, dateline DESC);
            CREATE INDEX IF NOT EXISTS idx_threads_category ON threads(category);
            CREATE INDEX IF NOT EXISTS idx_threads_lastpost ON threads(lastpost DESC);
            CREATE INDEX IF NOT EXISTS idx_posts_tid_lou ON posts(tid, lou ASC);
            CREATE INDEX IF NOT EXISTS idx_digest_real_dateline ON digest_pool(real_dateline DESC);
        `);

        this._initDefaultNoise();
    }

    _initDefaultNoise() {
        const defaults = ['吃瓜', '蹲', '前排', '插眼', 'mark', '码', '看看', '支持', '借楼', '顶', '纯路人', '笑死', '典', '急', '乐'];
        const stmt = this.db.prepare('INSERT OR IGNORE INTO noise_patterns (word, hit_count, is_custom, created_at) VALUES (?, 100, 1, ?)');
        const now = Date.now();
        for (const w of defaults) {
            stmt.run(w, now);
        }
    }

    getCursor(key) {
        const row = this.db.prepare('SELECT val FROM cursors WHERE key = ?').get(key);
        return row ? row.val : null;
    }

    setCursor(key, val) {
        const stmt = this.db.prepare(`
            INSERT INTO cursors (key, val, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET val = excluded.val, updated_at = excluded.updated_at
        `);
        stmt.run(key, String(val), Date.now());
    }

    saveThreads(threads) {
        const insertStmt = this.db.prepare(`
            INSERT INTO threads (
                tid, fid, title, author_uid, author_name, dateline,
                lastpost, replies, views, digest, category, score,
                first_content, images, raw_json, created_at
            ) VALUES (
                @tid, @fid, @title, @author_uid, @author_name, @dateline,
                @lastpost, @replies, @views, @digest, @category, @score,
                @first_content, @images, @raw_json, @created_at
            ) ON CONFLICT(tid) DO UPDATE SET
                replies = excluded.replies,
                views = excluded.views,
                lastpost = excluded.lastpost,
                category = COALESCE(excluded.category, threads.category),
                score = COALESCE(excluded.score, threads.score)
        `);

        const tx = this.db.transaction((items) => {
            for (const item of items) {
                insertStmt.run({
                    tid: item.tid,
                    fid: item.fid || 15,
                    title: item.title || '',
                    author_uid: item.author?.uid || 0,
                    author_name: item.author?.name || '',
                    dateline: item.dateline || 0,
                    lastpost: item.lastpost || 0,
                    replies: item.replies || 0,
                    views: item.views || 0,
                    digest: item.digest ? 1 : 0,
                    category: item.category || 'unclassified',
                    score: item.score || 0,
                    first_content: item.first_content || '',
                    images: JSON.stringify(item.images || []),
                    raw_json: JSON.stringify(item),
                    created_at: Date.now()
                });
            }
        });

        tx(threads);
    }

    getThread(tid) {
        return this.db.prepare('SELECT * FROM threads WHERE tid = ?').get(tid);
    }

    getDailyIntels(limit = 30) {
        return this.db.prepare(`
            SELECT * FROM threads 
            WHERE category IN ('gold', 'intel')
            ORDER BY dateline DESC 
            LIMIT ?
        `).all(limit);
    }

    // ---- 官方精选池（严格以首楼 real_dateline 衡量）----
    getActiveDigests(maxAgeDays = 7) {
        const threshold = Date.now() - (maxAgeDays * 86400 * 1000);
        return this.db.prepare(`
            SELECT * FROM digest_pool
            WHERE is_active = 1 AND real_dateline >= ?
            ORDER BY real_dateline DESC
        `).all(threshold);
    }

    getDigest(tid) {
        return this.db.prepare('SELECT * FROM digest_pool WHERE tid = ?').get(tid);
    }

    saveDigest(digest) {
        const stmt = this.db.prepare(`
            INSERT INTO digest_pool (tid, title, author_name, real_dateline, summary, value, is_active, created_at)
            VALUES (@tid, @title, @author_name, @real_dateline, @summary, @value, 1, ?)
            ON CONFLICT(tid) DO UPDATE SET
                title = excluded.title,
                summary = excluded.summary,
                value = excluded.value,
                real_dateline = excluded.real_dateline
        `);
        stmt.run({
            tid: digest.tid,
            title: digest.title || '',
            author_name: digest.author_name || '',
            real_dateline: digest.real_dateline || Date.now(),
            summary: digest.summary || '',
            value: digest.value || ''
        }, Date.now());
    }

    // ---- 动态低熵水词库维护 ----
    getNoiseWords() {
        const rows = this.db.prepare('SELECT word FROM noise_patterns ORDER BY hit_count DESC').all();
        return new Set(rows.map(r => r.word));
    }

    recordNoiseWord(word) {
        if (!word || typeof word !== 'string') return;
        const clean = word.trim().slice(0, 15);
        if (clean.length < 1) return;
        const stmt = this.db.prepare(`
            INSERT INTO noise_patterns (word, hit_count, is_custom, created_at)
            VALUES (?, 1, 0, ?)
            ON CONFLICT(word) DO UPDATE SET hit_count = hit_count + 1
        `);
        stmt.run(clean, Date.now());
    }

    // ---- 分级动态生命周期清理 (Tiered TTL) ----
    pruneExpired() {
        const now = Date.now();
        const normalThreshold = now - (48 * 3600 * 1000);       // 普通帖 48小时
        const dramaThreshold = now - (7 * 86400 * 1000);        // 高热/吃瓜帖最长滚动 7天
        const digestThreshold = now - (7 * 86400 * 1000);       // 官方精选 7天

        const res = this.db.transaction(() => {
            // 1. 清理普通不活跃帖（回复<30 且 lastpost 超过48h）
            const d1 = this.db.prepare(`
                DELETE FROM threads
                WHERE replies < 30 AND lastpost < ?
            `).run(normalThreshold);

            // 2. 清理超期冷寂的高热帖（lastpost 超过7天）
            const d2 = this.db.prepare(`
                DELETE FROM threads
                WHERE lastpost < ?
            `).run(dramaThreshold);

            // 3. 将超过7天的旧精选标记为不展示
            const d3 = this.db.prepare(`
                UPDATE digest_pool SET is_active = 0 WHERE real_dateline < ?
            `).run(digestThreshold);

            return { prunedNormal: d1.changes, prunedDrama: d2.changes, deactiveDigest: d3.changes };
        })();

        return res;
    }

    close() {
        if (this.db) {
            this.db.close();
        }
    }
}

module.exports = LkongStore;