const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, 'lkong_data.db'), { readonly: true });

// posts 表结构
const cols = db.prepare("PRAGMA table_info('posts')").all();
console.log('=== POSTS COLUMNS ===');
console.log(cols.map(c => c.name + ':' + c.type).join(', '));

// 该帖的所有缓存回复
const rows = db.prepare("SELECT * FROM posts WHERE tid = ? ORDER BY dateline ASC").all(5972087);
console.log('\n=== POSTS of tid=5972087: ' + rows.length + ' row(s) ===');
for (const r of rows) {
  console.log('---');
  console.log('floor/seq:', r.floor !== undefined ? r.floor : (r.seq !== undefined ? r.seq : 'N/A'));
  console.log('author:', r.author_name || r.author);
  console.log('dateline:', r.dateline, '->', new Date(r.dateline).toISOString());
  console.log('content:', (r.content || r.first_content || '').slice(0, 500));
}
db.close();