const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, 'lkong_data.db'), { readonly: true });

// 1. 列出所有表
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
console.log('=== TABLES ===');
console.log(tables.join(', '));

// 2. 全表扫描关键词
const keywords = ['大洗牌', '掌阅'];

console.log('\n=== MATCHES ===');
for (const t of tables) {
  let cols;
  try { cols = db.prepare(`PRAGMA table_info("${t}")`).all(); } catch (e) { continue; }
  for (const c of cols) {
    const type = String(c.type || '').toUpperCase();
    if (type.includes('INT') || type.includes('REAL') || type.includes('BLOB')) continue;
    for (const kw of keywords) {
      try {
        const rows = db.prepare(`SELECT * FROM "${t}" WHERE "${c.name}" LIKE ?`).all('%' + kw + '%');
        if (rows.length) {
          console.log(`\n### ${t} . ${c.name} (keyword: ${kw}) -> ${rows.length} row(s)`);
          for (const r of rows) console.log(JSON.stringify(r, null, 2));
        }
      } catch (e) {}
    }
  }
}
db.close();