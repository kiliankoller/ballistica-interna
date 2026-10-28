// File helpers of the main process without Electron, so that they can be tested on their own.
import { renameSync, writeFileSync } from 'node:fs';
import { COMPONENT_KINDS, type LibraryExport } from '../shared/api';

/** A file name without the characters Windows and macOS do not allow; `fallback` when nothing is left. */
export function safeFileName(name: string, fallback: string): string {
  return name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim() || fallback;
}

/** Written to a temporary file first and then renamed: an interrupted write leaves the previous file intact. */
export function writeFileAtomic(path: string, text: string): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

/** The entries of a library export that can be added (known kind, a label and a record); throws for another file. */
export function usableComponents(content: unknown): LibraryExport['components'] {
  const c = content as Partial<LibraryExport> | null;
  if (c?.format !== 'component-library' || !Array.isArray(c.components)) throw new Error('not a component library file');
  return c.components.filter(
    (e) => e !== null && typeof e === 'object' && COMPONENT_KINDS.includes(e.kind) && typeof e.label === 'string' && e.data !== null && typeof e.data === 'object',
  );
}
