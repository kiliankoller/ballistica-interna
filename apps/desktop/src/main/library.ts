import { join } from 'node:path';
import Database from 'better-sqlite3';
import { app } from 'electron';
import { COMPONENT_KINDS, type ComponentKind, type DbRecord, type LibraryEntry, type LibraryExport } from '../shared/api';

// The user's own components (writable), kept apart from the read-only master data. A record has the
// same field names as a master record, so it is taken over into a load the same way.

let db: Database.Database | null = null;

function library(): Database.Database {
  if (db) return db;
  db = new Database(join(app.getPath('userData'), 'library.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS component (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    kind     TEXT NOT NULL,
    label    TEXT NOT NULL,
    data     TEXT NOT NULL,
    created  TEXT NOT NULL,
    modified TEXT NOT NULL
  )`);
  return db;
}

export function listLibrary(kind?: ComponentKind): LibraryEntry[] {
  if (kind !== undefined && !COMPONENT_KINDS.includes(kind)) return [];
  const sql = `SELECT id, kind, label, modified, CASE kind WHEN 'projectile' THEN json_extract(data, '$.gdia') END AS diameter FROM component ${kind ? 'WHERE kind = ?' : ''} ORDER BY label COLLATE NOCASE`;
  return (kind ? library().prepare(sql).all(kind) : library().prepare(sql).all()) as LibraryEntry[];
}

export function libraryRecord(id: number): DbRecord | null {
  const row = library().prepare('SELECT data FROM component WHERE id = ?').get(id) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as DbRecord) : null;
}

export function saveToLibrary(kind: ComponentKind, label: string, data: DbRecord): number {
  if (!COMPONENT_KINDS.includes(kind)) throw new Error(`unknown component kind "${String(kind)}"`);
  const now = new Date().toISOString();
  const r = library()
    .prepare('INSERT INTO component (kind, label, data, created, modified) VALUES (?, ?, ?, ?, ?)')
    .run(kind, label, JSON.stringify(data), now, now);
  return Number(r.lastInsertRowid);
}

export function updateInLibrary(id: number, label: string, data: DbRecord): void {
  library().prepare('UPDATE component SET label = ?, data = ?, modified = ? WHERE id = ?').run(label, JSON.stringify(data), new Date().toISOString(), id);
}

export function deleteFromLibrary(id: number): void {
  library().prepare('DELETE FROM component WHERE id = ?').run(id);
}

export function exportLibrary(): LibraryExport {
  const rows = library().prepare('SELECT kind, label, data FROM component ORDER BY kind, label').all() as {
    kind: ComponentKind;
    label: string;
    data: string;
  }[];
  return { format: 'component-library', version: 1, components: rows.map((r) => ({ kind: r.kind, label: r.label, data: JSON.parse(r.data) as DbRecord })) };
}

/** Adds the components of an export; returns how many were added (entries of an unknown kind are left out). */
export function importLibrary(content: LibraryExport): number {
  if (content?.format !== 'component-library' || !Array.isArray(content.components)) throw new Error('not a component library file');
  const usable = content.components.filter(
    (c) => COMPONENT_KINDS.includes(c?.kind) && typeof c.label === 'string' && c.data !== null && typeof c.data === 'object',
  );
  library().transaction(() => {
    for (const c of usable) saveToLibrary(c.kind, c.label, c.data);
  })();
  return usable.length;
}
