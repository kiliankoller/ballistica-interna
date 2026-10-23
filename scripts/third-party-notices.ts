// Collects the licences of every package that goes into the desktop app (the runtime dependency and the
// libraries bundled into the renderer, with everything they depend on) into one notice file, shipped with the
// app and shown in its settings. Electron's own licences (LICENSE, LICENSES.chromium.html) come with Electron.
//   pnpm notices   → apps/desktop/notices/THIRD_PARTY_NOTICES.txt
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const desktop = join(import.meta.dirname, '..', 'apps', 'desktop');
// what the app's code imports (main, preload, renderer) and the workspace packages' own dependencies
const roots = ['better-sqlite3', 'vue', 'vue-i18n', 'element-plus', '@element-plus/icons-vue', 'pinia', 'uplot', '@ballistica-interna/grtload', '@ballistica-interna/solver'];

interface Pkg {
  name: string;
  version: string;
  license: string;
  text: string;
}
const seen = new Map<string, Pkg>();

/** Directory of a package as resolved from another package's directory. */
function packageDir(name: string, from: string): string | null {
  const require = createRequire(join(from, 'package.json'));
  for (const probe of [`${name}/package.json`, name]) {
    try {
      let dir = dirname(require.resolve(probe));
      // an alias ("@popperjs/core": "npm:@sxzz/popperjs-es") has another name inside its folder
      const isPackage = (d: string) =>
        existsSync(join(d, 'package.json')) &&
        (JSON.parse(readFileSync(join(d, 'package.json'), 'utf8')).name === name || d.endsWith(join('node_modules', name)));
      while (!isPackage(dir) && dirname(dir) !== dir) dir = dirname(dir);
      if (isPackage(dir)) return realpathSync(dir);
    } catch {
      // try the next way (packages without "./package.json" in their exports)
    }
  }
  // ESM-only packages: look for node_modules/<name> from the requiring package upwards
  for (let dir = from; ; dir = dirname(dir)) {
    for (const candidate of [join(dir, 'node_modules', name), ...(dir.endsWith('node_modules') ? [join(dir, name)] : [])]) {
      if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
    }
    if (dirname(dir) === dir) return null;
  }
}

function licenceText(dir: string): string {
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f));
  return file ? readFileSync(join(dir, file), 'utf8').trim() : '';
}

function visit(name: string, from: string) {
  const dir = packageDir(name, from);
  if (!dir) {
    console.warn(`not found: ${name} (from ${from})`);
    return;
  }
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
    license?: string | { type: string };
    dependencies?: Record<string, string>;
    private?: boolean;
  };
  const key = `${pkg.name}@${pkg.version}`;
  if (seen.has(key)) return;
  const own = pkg.name.startsWith('@ballistica-interna/');
  if (!own) {
    const license = typeof pkg.license === 'string' ? pkg.license : (pkg.license?.type ?? 'see text');
    seen.set(key, { name: pkg.name, version: pkg.version, license, text: licenceText(dir) });
  } else {
    seen.set(key, { name: pkg.name, version: pkg.version, license: 'own', text: '' });
  }
  for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep, dir);
}

for (const r of roots) visit(r, desktop);
const list = [...seen.values()].filter((p) => p.license !== 'own').sort((a, b) => a.name.localeCompare(b.name));
const out = [
  'BallisticaInterna – third-party software',
  '',
  'BallisticaInterna is licensed under the GNU General Public License v3.0 or later. It contains the following',
  'packages under their own licences. Electron and Chromium bring their licences along (LICENSE and',
  'LICENSES.chromium.html in the application folder).',
  '',
  ...list.map((p) => `- ${p.name} ${p.version} (${p.license})`),
  '',
  ...list.flatMap((p) => ['='.repeat(78), `${p.name} ${p.version} — ${p.license}`, '='.repeat(78), p.text || `(the package contains no licence text; its package.json states ${p.license})`, '']),
].join('\n');
mkdirSync(join(desktop, 'notices'), { recursive: true });
writeFileSync(join(desktop, 'notices', 'THIRD_PARTY_NOTICES.txt'), out);
const byLicence = new Map<string, number>();
for (const p of list) byLicence.set(p.license, (byLicence.get(p.license) ?? 0) + 1);
console.log(`${list.length} packages:`, Object.fromEntries(byLicence));
const missing = list.filter((p) => !p.text).map((p) => p.name);
if (missing.length) console.log('without licence text:', missing.join(', '));
