import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { app } from 'electron';
import { COMPONENT_KINDS, type ComponentKind, type DbRecord, type DbStatus, type ListItem } from '../shared/api';

// The master data BallisticaInterna ships (data/build/ballisticainterna.db, built from data/*.csv): read only. Records use the
// same field names as the components of a load, so they are taken over the same way.

let db: Database.Database | null = null;
let status: DbStatus = { ok: false, path: '', message: 'not open' };

/** Table names come from this list only (the kind arrives from the renderer). */
const known = (kind: unknown): kind is ComponentKind => COMPONENT_KINDS.includes(kind as ComponentKind);

const LABELS: Record<ComponentKind, string> = {
  caliber: "cipname || CASE WHEN coalesce(altname, '') <> '' THEN ' (' || altname || ')' ELSE '' END",
  projectile: "mname || ', ' || pname || ', ' || caliber",
  propellant: "mname || ' ' || pname",
};

/** The packaged copy in the installed app; in development the one built in the repository. */
function candidates(): string[] {
  if (app.isPackaged) return [join(process.resourcesPath, 'ballisticainterna.db')];
  return [
    join(app.getAppPath(), '..', '..', 'data', 'build', 'ballisticainterna.db'),
    join(process.cwd(), 'data', 'build', 'ballisticainterna.db'),
    join(process.cwd(), '..', '..', 'data', 'build', 'ballisticainterna.db'),
  ];
}

export function openMasterData(): DbStatus {
  db?.close();
  db = null;
  const path = candidates().find((p) => existsSync(p)) ?? '';
  if (!path) return (status = { ok: false, path: '', message: 'master data not found (run pnpm data)' });
  try {
    const candidate = new Database(path, { readonly: true, fileMustExist: true });
    const count = (t: ComponentKind) => (candidate.prepare(`SELECT count(*) AS n FROM ${t} WHERE geloescht = 0`).get() as { n: number }).n;
    status = { ok: true, path, counts: { caliber: count('caliber'), projectile: count('projectile'), propellant: count('propellant') } };
    db = candidate;
  } catch (e) {
    status = { ok: false, path, message: e instanceof Error ? e.message : String(e) };
  }
  return status;
}

/** The state of the last opening (the database is read only and does not change while the app runs). */
export function masterStatus(): DbStatus {
  return status;
}

export function listMaster(kind: ComponentKind): ListItem[] {
  if (!db || !known(kind)) return [];
  return db
    .prepare(`SELECT id, ${LABELS[kind]} AS label${kind === 'projectile' ? ', gdia AS diameter, flags' : ''} FROM ${kind} WHERE geloescht = 0 ORDER BY label COLLATE NOCASE`)
    .all() as ListItem[];
}

/** A master record with the name of its source (from the source table). */
export function masterRecord(kind: ComponentKind, id: number): DbRecord | null {
  if (!db || !known(kind)) return null;
  const r = db.prepare(`SELECT * FROM ${kind} WHERE id = ?`).get(id) as DbRecord | undefined;
  if (!r) return null;
  const names = String(r.source ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (db!.prepare('SELECT name FROM source WHERE id = ?').get(s) as { name: string } | undefined)?.name ?? s);
  return { ...r, source_name: names.join('; ') };
}

/** The master record of a projectile or propellant by maker and product name (null for calibers or when absent). */
export function findMaster(kind: ComponentKind, mname: string, pname: string): DbRecord | null {
  if (!db || !known(kind) || kind === 'caliber' || !mname || !pname) return null;
  const r = db.prepare(`SELECT id FROM ${kind} WHERE geloescht = 0 AND mname = ? AND pname = ? LIMIT 1`).get(mname, pname) as { id: number } | undefined;
  return r ? masterRecord(kind, r.id) : null;
}
