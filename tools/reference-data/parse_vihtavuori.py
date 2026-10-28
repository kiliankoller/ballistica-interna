"""Reads the load tables of the Vihtavuori reloading guide (PDF of double pages) into a local SQLite database,
for comparing the model with velocities. Vihtavuori gives no pressures in the guide.

  python3 tools/reference-data/parse_vihtavuori.py fixtures/sources/vihtavuori/<guide>.pdf
      [--db fixtures/reference/vihtavuori/vihtavuori.db]

Each page holds two printed pages side by side; both halves are read separately (`pdftotext -layout -x -W`).
A cartridge block gives the test barrel, primer and case; a row gives the bullet (weight, maker, type, C.O.L.)
and per powder the starting and maximum charge with velocity; following rows without a bullet repeat it.
"C" marks a compressed charge.

Tables:
  cartridge(id, name, barrel_mm, twist, primer, cases)
  charge(cartridge_id, bullet_g, bullet_gr, bullet_maker, bullet_type, col_mm, powder, start_g, start_ms,
         max_g, max_ms, compressed, page)
"""
import argparse
import os
import re
import sqlite3
import subprocess
import sys

POWDER = r'(?P<powder>N\d{3}|\d{2}N\d{2}|N\d{3}[A-Z]?)'
CHARGES = (r'\s+(?P<sg>\d+,\d+)C?\s+[\d.]+C?\s+(?P<sv>\d{3,4})\s+\d{3,4}'
           r'\s+(?P<mg>\d+,\d+)(?P<c>C)?\s+[\d.]+C?\s+(?P<mv>\d{3,4})\s+\d{3,4}')
FULL = re.compile(r'^\s*(?P<bg>\d+,\d+)\s+(?P<bgr>\d+(?:,\d+)?)\s+(?P<maker>\S+(?: \S+)*?)\s{2,}(?P<type>\S.*?)\s{2,}'
                  r'(?P<col>\d+,\d)\s+\d\.\d{3}\s+' + POWDER + CHARGES)
POWDER_ONLY = re.compile(r'^\s*' + POWDER + CHARGES)


def num(s):
    return float(s.replace(',', '.'))


def page_sizes(pdf):
    """{page: (width, height)}; single and double pages are mixed."""
    info = subprocess.run(['pdfinfo', '-f', '1', '-l', '9999', pdf], capture_output=True, text=True, encoding='utf-8', check=True).stdout
    return {int(p): (float(w), float(h)) for p, w, h in re.findall(r'Page\s+(\d+) size:\s*([\d.]+) x ([\d.]+)', info)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('--db', default='fixtures/reference/vihtavuori/vihtavuori.db')
    ap.add_argument('--pages', default='')
    a = ap.parse_args()
    sizes = page_sizes(a.pdf)
    first, last = (int(x) for x in a.pages.split('-')) if a.pages else (1, max(sizes))
    os.makedirs(os.path.dirname(a.db), exist_ok=True)
    # built in a temporary file: a failing run (pdftotext missing, an error) leaves the previous database as it was
    tmp = a.db + '.tmp'
    if os.path.exists(tmp):
        os.remove(tmp)
    db = sqlite3.connect(tmp)
    db.executescript('''
      drop table if exists cartridge; drop table if exists charge;
      create table cartridge(id integer primary key, name text, barrel_mm real, twist text, primer text, cases text);
      create table charge(cartridge_id integer, bullet_g real, bullet_gr real, bullet_maker text, bullet_type text,
        col_mm real, powder text, start_g real, start_ms real, max_g real, max_ms real, compressed integer, page integer);
    ''')
    ids = {}
    n = 0
    for p in range(first, last + 1):
        w, h = sizes[p]
        half = w / 2 if w > h else w  # a double page is wider than high
        for x in ((0, half) if w > h else (0,)):
            text = subprocess.run(['pdftotext', '-layout', '-f', str(p), '-l', str(p), '-x', str(int(x)), '-y', '0',
                                   '-W', str(int(half)), '-H', str(int(h)), a.pdf, '-'],
                                  capture_output=True, text=True, encoding='utf-8', check=True).stdout
            name, bullet = None, None
            barrel = twist = primer = cases = None
            for line in text.split('\n'):
                if (m := re.search(r'Test barrel:\s*([\d,]+)\s*mm[^,]*,?\s*(1 in [\d.,]+”?)?', line)):
                    barrel, twist = num(m[1]), m[2]
                if 'Primers:' in line:
                    name = line.split('Primers:')[0].strip() or name
                    primer = line.split('Primers:')[1].strip()
                if 'Cases:' in line:
                    cases = line.split('Cases:')[1].strip()
                if (m := re.match(r'^\s*(\S.*?)\s+cont\.\s*$', line)):
                    name = m[1].strip()
                m = FULL.match(line)
                if m:
                    bullet = (num(m['bg']), num(m['bgr']), m['maker'], m['type'].strip(), num(m['col']))
                else:
                    m = POWDER_ONLY.match(line)
                    if not m or bullet is None:
                        continue
                if not name:
                    continue
                key = name
                if key not in ids:
                    ids[key] = db.execute('insert into cartridge(name, barrel_mm, twist, primer, cases) values (?,?,?,?,?)',
                                          (name, barrel, twist, primer, cases)).lastrowid
                elif barrel:
                    db.execute('update cartridge set barrel_mm = coalesce(barrel_mm, ?), twist = coalesce(twist, ?), '
                               'primer = coalesce(primer, ?), cases = coalesce(cases, ?) where id = ?',
                               (barrel, twist, primer, cases, ids[key]))
                db.execute('insert into charge values (?,?,?,?,?,?,?,?,?,?,?,?,?)',
                           (ids[key], *bullet, m['powder'], num(m['sg']), float(m['sv']), num(m['mg']), float(m['mv']),
                            1 if m['c'] else 0, p))
                n += 1
    db.commit()
    db.close()
    os.replace(tmp, a.db)
    print(f'{len(ids)} cartridges, {n} charges → {a.db}', file=sys.stderr)


if __name__ == '__main__':
    main()
