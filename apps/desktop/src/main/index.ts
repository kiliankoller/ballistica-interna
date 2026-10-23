import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron';
import { APP_NAME, DISCLAIMER_VERSION, type DialogKind, type LibraryExport, type ReportMode, type ReportPayload, type Settings } from '../shared/api';
import { findMaster, listMaster, masterRecord, masterStatus, openMasterData } from './masterdata';
import { deleteFromLibrary, exportLibrary, importLibrary, libraryRecord, listLibrary, saveToLibrary, updateInLibrary } from './library';
import { defaultSettings, loadSettings, saveSettings } from './settings';

// one data folder named like the app, in development and in the installed app alike
app.setName(APP_NAME);
app.setPath('userData', join(app.getPath('appData'), APP_NAME));

let settings: Settings;
/** Settings changes are written to disk (not in the screenshot mode, which keeps them in memory). */
let persist = true;
let mainWindow: BrowserWindow | null = null;
/** Some open load has unsaved changes (reported by the window). */
let dirty = false;

const preload = join(__dirname, '../preload/index.mjs');
const devIcon = join(__dirname, '../../build/icon.png');
const rendererUrl = (page: 'index' | 'report') =>
  process.env.ELECTRON_RENDERER_URL ? `${process.env.ELECTRON_RENDERER_URL}/${page}.html` : null;
const rendererFile = (page: 'index' | 'report') => join(__dirname, `../renderer/${page}.html`);

async function load(win: BrowserWindow, page: 'index' | 'report', query = '') {
  const url = rendererUrl(page);
  if (url) await win.loadURL(url + query);
  else await win.loadFile(rendererFile(page), query ? { search: query.slice(1) } : undefined);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1100,
    minHeight: 700,
    title: APP_NAME,
    // window icon in development on Windows and Linux; the installed app carries its own (electron-builder)
    ...(existsSync(devIcon) ? { icon: devIcon } : {}),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b1d21' : '#ffffff',
    webPreferences: { preload, sandbox: false, contextIsolation: true },
  });
  void load(mainWindow, 'index');
  guardClose(mainWindow);
}

type Ask = (win: BrowserWindow, options: Electron.MessageBoxSyncOptions) => number;

/** Closing the window (or quitting) with unsaved loads asks first; `ask` is replaced by the click checks. */
function guardClose(win: BrowserWindow, ask: Ask = (w, o) => dialog.showMessageBoxSync(w, o)) {
  win.on('close', (e) => {
    if (!dirty) return;
    const de = settings.language === 'de';
    const choice = ask(win, {
      type: 'warning',
      buttons: de ? ['Änderungen verwerfen', 'Abbrechen'] : ['Discard changes', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: de ? 'Es gibt ungespeicherte Ladungen.' : 'There are unsaved loads.',
      detail: de ? 'Beim Schließen gehen die Änderungen verloren.' : 'Closing loses the changes.',
    });
    if (choice === 1) e.preventDefault();
    else dirty = false;
  });
}

/** Renders the report HTML in a hidden window and prints it to A4 PDF. */
async function renderPdf(html: string): Promise<Buffer> {
  const win = new BrowserWindow({ show: false, webPreferences: { preload, sandbox: false, contextIsolation: true } });
  try {
    await load(win, 'report');
    await win.webContents.executeJavaScript(`window.renderReport(${JSON.stringify(html)})`);
    return await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  } finally {
    win.destroy();
  }
}

/** Default path of a dialog: the file name in the folder last used for this kind of file. */
function inLastDir(kind: DialogKind, fileName = ''): string | undefined {
  const dir = settings.lastDirs[kind];
  if (dir && existsSync(dir)) return fileName ? join(dir, fileName) : dir;
  return fileName || undefined;
}

/** Remembers the folder of a chosen file for the next dialog of the same kind. */
function rememberDir(kind: DialogKind, filePath: string) {
  settings = { ...settings, lastDirs: { ...settings.lastDirs, [kind]: dirname(filePath) } };
  if (persist) saveSettings(settings);
}

/** Writes the report to a temporary file and opens it in the system's PDF viewer. */
async function viewPdf(report: ReportPayload): Promise<string> {
  const dir = join(app.getPath('temp'), APP_NAME);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${report.title.replace(/[\\/:*?"<>|]/g, '_')}.pdf`);
  writeFileSync(file, await renderPdf(report.html));
  const error = await shell.openPath(file);
  if (error) throw new Error(error);
  return file;
}

async function exportPdf(report: ReportPayload, mode: ReportMode): Promise<string | null> {
  if (mode === 'view') return viewPdf(report);
  const target = await dialog.showSaveDialog({
    defaultPath: inLastDir('pdf', `${report.title}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (target.canceled || !target.filePath) return null;
  rememberDir('pdf', target.filePath);
  writeFileSync(target.filePath, await renderPdf(report.html));
  return target.filePath;
}

function registerIpc() {
  ipcMain.handle('settings:get', () => settings);
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    settings = { ...settings, ...patch };
    if (persist) saveSettings(settings);
    nativeTheme.themeSource = settings.theme;
    return settings;
  });
  ipcMain.handle('master:status', () => masterStatus());
  ipcMain.handle('master:list', (_e, kind) => listMaster(kind));
  ipcMain.handle('master:record', (_e, kind, id: number) => masterRecord(kind, id));
  ipcMain.handle('master:find', (_e, kind, mname: string, pname: string) => findMaster(kind, mname, pname));
  ipcMain.handle('lib:list', (_e, kind) => listLibrary(kind));
  ipcMain.handle('lib:record', (_e, id: number) => libraryRecord(id));
  ipcMain.handle('lib:save', (_e, kind, label: string, data) => saveToLibrary(kind, label, data));
  ipcMain.handle('lib:update', (_e, id: number, label: string, data) => updateInLibrary(id, label, data));
  ipcMain.handle('lib:delete', (_e, id: number) => deleteFromLibrary(id));
  ipcMain.handle('lib:export', async () => {
    const r = await dialog.showSaveDialog({ defaultPath: inLastDir('library', 'components.json'), filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return null;
    rememberDir('library', r.filePath);
    writeFileSync(r.filePath, JSON.stringify(exportLibrary(), null, 1));
    return r.filePath;
  });
  ipcMain.handle('lib:import', async () => {
    const r = await dialog.showOpenDialog({ defaultPath: inLastDir('library'), properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    rememberDir('library', r.filePaths[0]);
    return importLibrary(JSON.parse(readFileSync(r.filePaths[0], 'utf8')) as LibraryExport);
  });
  ipcMain.handle('load:open', async () => {
    const r = await dialog.showOpenDialog({
      defaultPath: inLastDir('load'),
      properties: ['openFile'],
      filters: [{ name: 'Load', extensions: ['grtload'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    rememberDir('load', r.filePaths[0]);
    return { path: r.filePaths[0], content: readFileSync(r.filePaths[0], 'utf8') };
  });
  ipcMain.handle('load:read', (_e, path: string) => {
    try {
      return { path, content: readFileSync(path, 'utf8') };
    } catch {
      return null;
    }
  });
  ipcMain.handle('load:save', async (_e, path: string | null, content: string, suggestedName: string) => {
    let target = path;
    if (!target) {
      const r = await dialog.showSaveDialog({
        defaultPath: inLastDir('load', `${suggestedName}.grtload`),
        filters: [{ name: 'Load', extensions: ['grtload'] }],
      });
      if (r.canceled || !r.filePath) return null;
      rememberDir('load', r.filePath);
      target = r.filePath;
    }
    writeFileSync(target, content);
    return target;
  });
  ipcMain.handle('report:pdf', (_e, report: ReportPayload, mode: ReportMode) => exportPdf(report, mode));
  ipcMain.on('app:dirty', (_e, value: boolean) => (dirty = value));
  ipcMain.handle('app:notices', () => {
    // the packaged copy, or the one generated in the repository (pnpm notices)
    const file = [join(process.resourcesPath ?? '', 'THIRD_PARTY_NOTICES.txt'), join(app.getAppPath(), 'notices', 'THIRD_PARTY_NOTICES.txt')].find((f) => existsSync(f));
    return file ? readFileSync(file, 'utf8') : 'THIRD_PARTY_NOTICES.txt not found (run pnpm notices).';
  });
}

/**
 * `--screenshot <file.png> [--open <file.grtload>]`: renders the window off screen and exits (for checks and the
 * pictures of the documentation). Settings stay in memory; the files of the last session are not reopened.
 * `--clean` starts from the default settings (default units, light theme) instead of the user's,
 * `--lang de|en` sets the language, `--dark` the dark theme, `--scale 2` renders at twice the resolution,
 * `--name-only` shows the opened files by their name, not by their full path.
 */
async function screenshotMode(args: string[]) {
  const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const out = arg('--screenshot')!;
  const openIdx = args.indexOf('--open');
  persist = false;
  if (args.includes('--clean')) settings = { ...defaultSettings(), theme: 'light' };
  const lang = arg('--lang');
  if (lang === 'de' || lang === 'en') settings = { ...settings, language: lang };
  if (args.includes('--dark')) settings = { ...settings, theme: 'dark' };
  nativeTheme.themeSource = settings.theme;
  // the check renders the work area, not the first-start notice
  settings = { ...settings, openFiles: [], activeFile: '', disclaimerAccepted: args.includes('--disclaimer') ? '' : DISCLAIMER_VERSION };
  console.log('master', JSON.stringify(openMasterData()));
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    show: false,
    webPreferences: { preload, sandbox: false, contextIsolation: true, offscreen: { deviceScaleFactor: Number(arg('--scale') ?? 1) } },
  });
  await load(win, 'index');
  if (openIdx >= 0) {
    for (let i = 0; i < args.length; i++) {
      if (args[i] !== '--open') continue;
      const path = args[i + 1]!;
      const file = JSON.stringify({ path: args.includes('--name-only') ? basename(path) : path, content: readFileSync(path, 'utf8') });
      await win.webContents.executeJavaScript(`window.__openForCheck(${file})`);
    }
    if (args.includes('--compare')) await win.webContents.executeJavaScript('window.__compareForCheck()');
  }
  await new Promise((r) => setTimeout(r, 1500));
  const image = await win.webContents.capturePage();
  writeFileSync(out, image.toPNG());
  console.log('screenshot', basename(out));
  // --steps <file.json>: [{ "js": "…", "wait": 800, "shot": "name.png" }, …] runs in the window one after the
  // other (clicks, inputs), each followed by a screenshot next to the main one, for checks by hand-like steps
  const stepsIdx = args.indexOf('--steps');
  if (stepsIdx >= 0) {
    const steps = JSON.parse(readFileSync(args[stepsIdx + 1]!, 'utf8')) as { js?: string; wait?: number; shot?: string; close?: 0 | 1 }[];
    // "close": 0 or 1 closes the window with the quit question answered by that button (0 discard, 1 cancel)
    let answer = 1;
    let asked: string[] = [];
    guardClose(win, (_w, o) => (asked.push(`${o.message} [${(o.buttons ?? []).join(' | ')}]`), answer));
    for (const [i, step] of steps.entries()) {
      let result: unknown;
      if (step.close !== undefined) {
        answer = step.close;
        asked = [];
        win.close();
        await new Promise((r) => setTimeout(r, 300));
        result = { asked, windowOpen: !win.isDestroyed() };
        if (win.isDestroyed()) {
          console.log(`step ${i + 1}:`, JSON.stringify(result));
          break;
        }
      } else result = await win.webContents.executeJavaScript(`(async () => { ${step.js} })()`).catch((e: unknown) => `error: ${String(e)}`);
      await new Promise((r) => setTimeout(r, step.wait ?? 800));
      if (result !== undefined) console.log(`step ${i + 1}:`, JSON.stringify(result));
      if (step.shot) {
        writeFileSync(join(dirname(out), step.shot), (await win.webContents.capturePage()).toPNG());
        console.log('screenshot', step.shot);
      }
    }
  }
  const pdfIdx = args.indexOf('--pdf');
  if (pdfIdx >= 0) {
    const html = (await win.webContents.executeJavaScript('window.__reportForCheck()')) as string;
    writeFileSync(args[pdfIdx + 1]!, await renderPdf(html));
    console.log('pdf', basename(args[pdfIdx + 1]!));
  }
  app.exit(0);
}

void app.whenReady().then(async () => {
  settings = loadSettings();
  nativeTheme.themeSource = settings.theme;
  openMasterData();
  registerIpc();
  if (process.argv.includes('--screenshot')) return screenshotMode(process.argv);
  // development on macOS: the Dock shows the Electron icon unless it is set (the installed app has its own)
  if (process.platform === 'darwin' && existsSync(devIcon)) app.dock?.setIcon(devIcon);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
