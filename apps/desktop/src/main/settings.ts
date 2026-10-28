import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import type { Settings } from '../shared/api';

const file = () => join(app.getPath('userData'), 'settings.json');

export const defaultSettings = (): Settings => ({
  language: app.getLocale().startsWith('de') ? 'de' : 'en',
  theme: 'system',
  lastDirs: {},
  openFiles: [],
  activeFile: '',
  units: {},
  disclaimerAccepted: '',
});

export function loadSettings(): Settings {
  try {
    if (existsSync(file())) {
      // an earlier version stored the path of an external database file; that setting is dropped
      const { grtDatabase: _dropped, ...stored } = JSON.parse(readFileSync(file(), 'utf8')) as Partial<Settings> & { grtDatabase?: string };
      return { ...defaultSettings(), ...stored };
    }
  } catch {
    // unreadable settings fall back to the defaults
  }
  return defaultSettings();
}

/** Written to a temporary file first: an interrupted write leaves the previous settings intact. */
export function saveSettings(settings: Settings): void {
  const tmp = `${file()}.tmp`;
  writeFileSync(tmp, JSON.stringify(settings, null, 2));
  renameSync(tmp, file());
}
