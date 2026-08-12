// packages/core/src/db/repositories.ts
import BetterSqlite3 from 'better-sqlite3';
import crypto from 'node:crypto';
import type { Note, NoteCreateInput } from '../domain/note';
import { normalizeNote, validateNote } from '../domain/note';
import type { UUID } from '../domain/types';

export class NoteRepository {
  constructor(private db: BetterSqlite3.Database) {}

  private migrate() {
    const v = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
    if (v.user_version < 1) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT DEFAULT '',
          folder TEXT,
          tags TEXT NOT NULL DEFAULT '[]',
          pinned INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder);
        CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
        PRAGMA user_version = 1;
      `);
    }
  }

  list(q?: string, limit = 50, offset = 0): Note[] {
    this.migrate();
    const params: unknown[] = [];
    let sql = 'SELECT * FROM notes';
    if (q) {
      sql += ' WHERE title LIKE ? OR content LIKE ?';
      params.push(`%${q}%`, `%${q}%`);
    }
    sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    return (this.db.prepare(sql).all(...params) as any[]).map(normalizeNote);
  }

  get(id: UUID): Note | null {
    this.migrate();
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
    return row ? normalizeNote(row) : null;
  }

  create(input: NoteCreateInput): UUID {
    this.migrate();
    validateNote(input);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO notes (id, title, content, folder, tags, pinned, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        id,
        input.title,
        input.content ?? '',
        input.folder ?? null,
        JSON.stringify(input.tags ?? []),
        now,
        now,
      );
    return id;
  }

  delete(id: UUID): boolean {
    const r = this.db.prepare('DELETE FROM notes WHERE id = ?').run(id);
    return r.changes > 0;
  }

  update(id: UUID, patch: Partial<Note>): Note | null {
    const cur = this.get(id);
    if (!cur) return null;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE notes
         SET title = COALESCE(?, title),
             content = COALESCE(?, content),
             folder = ?,
             tags = ?,
             pinned = COALESCE(?, pinned),
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        patch.title,
        patch.content,
        patch.folder === undefined ? cur.folder : patch.folder,
        patch.tags ? JSON.stringify(patch.tags) : JSON.stringify(cur.tags),
        patch.pinned === undefined ? (cur.pinned ? 1 : 0) : patch.pinned ? 1 : 0,
        now,
        id,
      );
    return this.get(id);
  }
}
