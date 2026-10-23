"""Reads the powder characteristics table of the Vihtavuori reloading guide (bulk density, energy content per
powder) into the local component database (table powder_datasheet, maker Vihtavuori). Powders the guide's table
lacks (N530, N105) are taken from the table of Vihtavuori's industrial powders brochure if it is given: one row per
powder, "N530 55 0,8 0,8 930 0,6 3950 20 kg" (relative burn rate, grain length and diameter mm, bulk density g/l,
perforation mm, energy content J/g, package).

  python3 tools/reference-data/parse_vihtavuori_powders.py <guide.pdf> [--brochure <brochure.pdf>]
    [--db fixtures/open-db/components.db]
"""
import argparse
import os
import re
import sqlite3
import subprocess
import sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('--brochure', help="Vihtavuori's industrial powders brochure (PDF)")
    ap.add_argument('--db', default='fixtures/open-db/components.db')
    a = ap.parse_args()
    text = subprocess.run(['pdftotext', '-layout', a.pdf, '-'], capture_output=True, text=True).stdout
    lines = text.split('\n')
    rows = []
    for k, line in enumerate(lines):
        if not line.strip().startswith('Bulk density'):
            continue
        # the header with the powder names stands a few lines above, the energy content right below
        head = next((lines[j] for j in range(k - 1, max(k - 5, 0), -1) if re.search(r'\bN\d{3}\b|\d{2}N\d{2}|3N3\d', lines[j])), '')
        names = re.findall(r'\b(N\d{3}|\d{1,2}N\d{2})\b', head.split('Consumer')[0])
        kind = next((('handgun' if 'Handgun' in lines[j] else 'rifle') for j in range(k - 1, max(k - 6, 0), -1) if 'Reloading Powders' in lines[j]), 'rifle')
        bulk = [float(x) for x in re.findall(r'\b(\d{3,4})\b', line.split('Measures')[0])]
        energy_line = lines[k + 1]
        energy = [float(x) for x in re.findall(r'\b(\d{4})\b', energy_line.split('N110')[0]) ]
        if not (len(names) == len(bulk) == len(energy)):
            print(f'table at line {k}: {len(names)} names, {len(bulk)} densities, {len(energy)} energies', file=sys.stderr)
            continue
        for n, b, e in zip(names, bulk, energy):
            rows.append(dict(maker='Vihtavuori', name=n, kind=kind, qex_j_g=e, bulk_density_g_l=b, grain_1_mm=None,
                             grain_2_mm=None, grain_text='', powder_type='', tolerance='', url='',
                             source='Vihtavuori reloading guide 2026'))
    if a.brochure:
        raw = subprocess.run(['pdftotext', '-raw', a.brochure, '-'], capture_output=True, text=True).stdout
        known = {r['name'] for r in rows}
        num = r'(\d+,\d+|\d+)'
        for m in re.finditer(rf'^(N\d{{3}}|\d{{1,2}}N\d{{2}}) \d+ {num} {num} (\d{{3}}) {num} (\d{{4}}) \d+ kg', raw, re.M):
            if m[1] in known:
                continue
            kind = 'handgun' if m[1] == 'N105' or m[1].startswith(('N3', '3N')) else 'rifle'
            rows.append(dict(maker='Vihtavuori', name=m[1], kind=kind, qex_j_g=float(m[6]), bulk_density_g_l=float(m[4]),
                             grain_1_mm=float(m[2].replace(',', '.')), grain_2_mm=float(m[3].replace(',', '.')),
                             grain_text='', powder_type='', tolerance='', url='',
                             source='Vihtavuori industrial powders brochure 2022'))
            print(f'{m[1]}: from the brochure', file=sys.stderr)
    db = sqlite3.connect(a.db)
    db.execute('''create table if not exists powder_datasheet(maker text, name text, kind text, qex_j_g real,
      bulk_density_g_l real, grain_1_mm real, grain_2_mm real, grain_text text, powder_type text, tolerance text,
      url text, source text)''')
    db.execute("delete from powder_datasheet where maker = 'Vihtavuori'")
    db.executemany('insert into powder_datasheet values (:maker,:name,:kind,:qex_j_g,:bulk_density_g_l,:grain_1_mm,'
                   ':grain_2_mm,:grain_text,:powder_type,:tolerance,:url,:source)', rows)
    db.commit()
    print(f'{len(rows)} powders → {a.db}', file=sys.stderr)


if __name__ == '__main__':
    main()
