// Types shared by the main process, the preload bridge and the renderer.

/** Name shown in titles and reports, and the name of the data folder. */
export const APP_NAME = 'BallisticaInterna';

/** Version of the disclaimer text; a new version is shown again on the next start. */
export const DISCLAIMER_VERSION = '2026-10-24';

export interface Settings {
  language: 'de' | 'en';
  /** Colour scheme: the system's, or fixed light or dark. */
  theme: 'system' | 'light' | 'dark';
  /** DISCLAIMER_VERSION the user confirmed ('' = not yet). */
  disclaimerAccepted: string;
  /** Display unit chosen per field (`section.name` → unit id), the same for every load. */
  units: Record<string, string>;
  /** Folder of the last file chosen in a dialog, per kind of file. */
  lastDirs: Partial<Record<DialogKind, string>>;
  /** Files that were open when the app was closed (reopened on the next start if they still exist). */
  openFiles: string[];
  /** The one of openFiles that was shown. */
  activeFile: string;
}

export type DialogKind = 'load' | 'pdf' | 'library';

export interface OpenedFile {
  path: string;
  content: string;
}

export interface DbStatus {
  ok: boolean;
  path: string;
  message?: string;
  counts?: { caliber: number; projectile: number; propellant: number };
}

export interface ListItem {
  id: number;
  label: string;
  /** Projectiles: bullet diameter in mm, to offer only the bullets that fit the load's caliber. */
  diameter?: number | null;
  /** Projectiles of the master data: quality flags (length_missing, length_ambiguous, implausible_*, …). */
  flags?: string | null;
}

export type ComponentKind = 'caliber' | 'projectile' | 'propellant';
export type DbRecord = Record<string, string | number | null>;
export type ComponentSource = 'own' | 'master';

export interface LibraryEntry {
  id: number;
  kind: ComponentKind;
  label: string;
  modified: string;
  /** Projectiles: bullet diameter in mm (see ListItem). */
  diameter?: number | null;
}

export interface LibraryExport {
  format: 'component-library';
  version: 1;
  components: { kind: ComponentKind; label: string; data: DbRecord }[];
}

/** View: open the PDF in the system viewer; save: ask for a file. */
export type ReportMode = 'view' | 'save';

export interface ReportPayload {
  title: string;
  html: string;
}

export interface Api {
  getSettings(): Promise<Settings>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  masterStatus(): Promise<DbStatus>;
  masterList(kind: ComponentKind): Promise<ListItem[]>;
  masterRecord(kind: ComponentKind, id: number): Promise<DbRecord | null>;
  /** The master record of a maker and product name (to show its notes for a load opened from a file). */
  masterFind(kind: ComponentKind, mname: string, pname: string): Promise<DbRecord | null>;
  libraryList(kind?: ComponentKind): Promise<LibraryEntry[]>;
  libraryRecord(id: number): Promise<DbRecord | null>;
  librarySave(kind: ComponentKind, label: string, data: DbRecord): Promise<number>;
  libraryUpdate(id: number, label: string, data: DbRecord): Promise<void>;
  libraryDelete(id: number): Promise<void>;
  libraryExport(): Promise<string | null>;
  libraryImport(): Promise<number | null>;
  openLoad(): Promise<OpenedFile | null>;
  /** Reads a load by path; null when the file no longer exists or is unreadable. */
  readLoad(path: string): Promise<OpenedFile | null>;
  saveLoad(path: string | null, content: string, suggestedName: string): Promise<string | null>;
  exportPdf(report: ReportPayload, mode: ReportMode): Promise<string | null>;
  /** Tells the main process whether a load has unsaved changes (asked before the window closes). */
  setDirty(dirty: boolean): void;
  /** Licences of the bundled third-party packages (text). */
  thirdPartyNotices(): Promise<string>;
}
