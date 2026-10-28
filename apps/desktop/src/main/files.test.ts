import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { safeFileName, usableComponents, writeFileAtomic } from './files';

describe('safeFileName', () => {
  it('replaces the characters file systems do not allow', () => {
    expect(safeFileName('6,5 x 57 / 140 gr: "RS 60" <test>|?*', 'x')).toBe('6,5 x 57 _ 140 gr_ _RS 60_ _test____');
    expect(safeFileName('a\\b\nc', 'x')).toBe('a_b_c');
  });

  it('gives the fallback for a name that is empty after cleaning', () => {
    expect(safeFileName('   ', 'BallisticaInterna')).toBe('BallisticaInterna');
  });
});

describe('writeFileAtomic', () => {
  it('replaces the file and leaves no temporary file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bi-'));
    const file = join(dir, 'settings.json');
    writeFileSync(file, 'old');
    writeFileAtomic(file, 'new');
    expect(readFileSync(file, 'utf8')).toBe('new');
    expect(readdirSync(dir)).toEqual(['settings.json']);
  });
});

describe('usableComponents', () => {
  const entry = (kind: unknown, label: unknown = 'x', data: unknown = { a: 1 }) => ({ kind, label, data });

  it('keeps only entries of a known kind with a label and a record, so the count is what is added', () => {
    const content = {
      format: 'component-library',
      version: 1,
      components: [entry('caliber'), entry('projectile'), entry('gun'), entry('propellant', 3), entry('propellant', 'p', null), null],
    };
    expect(usableComponents(content).map((c) => c.kind)).toEqual(['caliber', 'projectile']);
  });

  it('refuses another file', () => {
    expect(() => usableComponents({ format: 'other', components: [] })).toThrow('not a component library file');
    expect(() => usableComponents(null)).toThrow();
  });
});
