// examples/06-sqlite-better-sample/db.ts
// 展示如何在主进程用 better-sqlite3 + WAL + keychain 衍生
import Database from 'better-sqlite3';
import path from 'node:path';
import { app, safeStorage } from 'electron';

const dbPath = path.join(app.getPath('userData'), 'app.db');

const passphrase = process.env.DB_KEY ?? (() => {
  const keyFile = path.join(app.getPath('userData'), 'db.key');
  if (require('node:fs').existsSync(keyFile)) {
    const buf = require('node:fs').readFileSync(keyFile);
    return safeStorage.decryptString(buf);
  }
  // 首次启动：从 OS 受保护存储派生
  const raw = crypto.randomUUID() + crypto.randomUUID();
  const enc = safeStorage.encryptString(raw);
  require('node:fs').writeFileSync(keyFile, enc, { mode: 0o600 });
  return raw;
})();

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);
`);

const insert = db.prepare('INSERT INTO messages (id, channel_id, body, created_at) VALUES (?, ?, ?, ?)');
const select = db.prepare('SELECT * FROM messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?');

const insertAll = db.transaction((rows: { id: string; channelId: string; body: string }[]) => {
  for (const r of rows) insert.run(r.id, r.channelId, r.body, Date.now());
});

export const dbApi = {
  insertOne(row: { id: string; channelId: string; body: string }) {
    insert.run(row.id, row.channelId, row.body, Date.now());
  },
  insertMany(rows: any[]) {
    insertAll(rows);
  },
  listByChannel(channelId: string, limit = 50, offset = 0) {
    return select.all(channelId, limit, offset);
  },
  close() {
    db.close();
  },
};
