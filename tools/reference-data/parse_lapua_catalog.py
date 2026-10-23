"""Reads the rifle bullets of the Lapua catalogue (PDF, "Components – centerfire rifle") into the local component
database: part number, name, bullet code, type, diameter, weight, G1 and G7 BC. Lapua publishes no bullet length
(neither in the catalogue nor on its product pages): the length comes from JBM's list in merge_bullets.py, or is
missing.

  python3 tools/reference-data/parse_lapua_catalog.py [catalogue.pdf] [--db fixtures/open-db/components.db]

The components page is read with `pdftotext -raw`, one bullet per line: an optional calibre and brass case before
it ("6.5 mm (.264) 4PH6012 6.5 x 55 SE"), then "4 PL/HL 6014 FMJ S341 FMJ 6.71 .264 6.50 100 0.250 [G7]".
Decimal commas occur. A bullet listed under two part numbers (box sizes) becomes two rows; merge_bullets.py joins
them. Table maker_bullet (see bullet_sources.py), Lapua rows replaced on every run.
"""
import argparse
import datetime
import glob
import os
import re
import subprocess
import sys

from bullet_sources import COMPONENTS_DB, FIX, MAKER_BULLET_COLUMNS, replace_rows

SOURCES = os.path.join(FIX, 'sources', 'lapua')
URL = 'https://www.lapua.com'
NUM = r'(\d+[.,]\d+|\d+)'
# part number, name, bullet code, type, diameter mm and inch, weight g and grains, G1, optional G7
ROW = re.compile(r'(?P<part>(?:4|N)\s?(?:PL|HL)(?:/(?:PL|HL))?\s?\d{4})\s+(?P<name>.+?)\s+'
                 r'(?P<code>[A-Z]{1,2}\d{3}|D\d{2,3})\s+(?P<type>[A-Z]{2,6})\s+'
                 rf'{NUM}\s+(?P<din>\.\d{{3}})\s+{NUM}\s+(?P<gr>\d{{2,3}})\s+(?P<g1>\d?[.,]\d+)(?:\s+(?P<g7>\d?[.,]\d+))?\s*$')


def num(s):
    return float(s.replace(',', '.')) if s else None


def page_of_components(pdf):
    """Pages whose text names the rifle components table."""
    out = subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout
    pages = int(re.search(r'Pages:\s+(\d+)', out)[1])
    for p in range(1, pages + 1):
        t = subprocess.run(['pdftotext', '-raw', '-f', str(p), '-l', str(p), pdf, '-'], capture_output=True, text=True).stdout
        if 'COMPONENTS - CENTERFIRE RIFLE' in t:
            yield p, t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf', nargs='?', help='the catalogue PDF (default: the newest in fixtures/sources/lapua)')
    ap.add_argument('--db', default=COMPONENTS_DB)
    a = ap.parse_args()
    pdf = a.pdf or max(glob.glob(os.path.join(SOURCES, '*.pdf')), key=os.path.getmtime)
    retrieved = datetime.date.fromtimestamp(os.path.getmtime(pdf)).isoformat()
    rows, unread = [], []
    for page, text in page_of_components(pdf):
        for line in text.splitlines():
            m = ROW.search(line)
            if not m:
                if re.search(r'(PL|HL)\s?/?\s?(PL|HL)?\s?\d{4}', line):
                    unread.append(line)
                continue
            part = re.sub(r'\s+', ' ', m['part'].replace('4HL/PL', '4 PL/HL ').replace('PL/HL', 'PL/HL ')).replace('  ', ' ').strip()
            rows.append(dict(
                maker='Lapua', product_line=m['name'].split()[0], name=f"{m['name']} {m['code']} {m['type']} {m['gr']} gr",
                part_number=part, diameter_in=float(m['din']), weight_gr=float(m['gr']), length_in=None,
                bc_g1=num(m['g1']), bc_g7=num(m['g7']), ogive_in=None, nose_in=None, bearing_in=None, boattail_in=None,
                twist_min_in=None, note=f'catalogue page {page}', url=URL, retrieved=retrieved, source='lapua-catalogue-2026'))
    replace_rows('maker_bullet', MAKER_BULLET_COLUMNS, rows, 'maker = ?', ('Lapua',), db_path=a.db)
    print(f'maker_bullet: {len(rows)} Lapua part numbers, {sum(r["bc_g7"] is not None for r in rows)} with G7 → {a.db}', file=sys.stderr)
    for line in unread:
        print(f'  not read: {line}', file=sys.stderr)


if __name__ == '__main__':
    main()
