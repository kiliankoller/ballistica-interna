"""Reads Berger's bullet reference chart (https://bergerbullets.com/information/lines-and-designs/bullet-reference-charts/,
one HTML table of all current bullets) into the local component database: part number, description, diameter,
overall length, boat tail length (empty for flat base), nose length, base to ogive, bearing surface, G1 and G7 BC
and minimum twist, all in inches as published. The weight is taken from the description; where it does not
give one ("6 mm BR COLUMN Target", "200.20x") it is computed from the published sectional density
(w = SD · d² · 7000) and marked in note.

  python3 tools/reference-data/parse_berger_bullets.py [page.html] [--db fixtures/open-db/components.db]

Without a page, the copy saved by hand in fixtures/sources/berger/ is read, or, if that is missing, the page is
fetched once (robots.txt allows it) and cached in fixtures/reference/berger/. Table maker_bullet (see
bullet_sources.py), Berger rows replaced on every run.
"""
import argparse
import os
import re
import sys

from bullet_sources import COMPONENTS_DB, FIX, MAKER_BULLET_COLUMNS, cached, clean_text, replace_rows

URL = 'https://bergerbullets.com/information/lines-and-designs/bullet-reference-charts/'
SAVED = os.path.join(FIX, 'sources', 'berger', 'Bullet Reference Charts _ Berger Bullets.html')
CACHE = os.path.join(FIX, 'reference', 'berger', 'bullet-reference-charts.html')
HEADER = ['Part #', 'Bullet Description', 'Cal (Dia)', 'OAL', 'Boat Tail', 'Nose Length', 'Base to Ogive',
          'Bearing Surface', 'Sectional Density', 'G1 BC', 'G7 BC', 'G7 Form Factor', 'Minimum Twist']


def _num(s):
    m = re.fullmatch(r'\s*(\d*\.?\d+)\s*', s or '')
    return float(m[1]) if m else None


def parse(text):
    """Bullets of the reference chart as dicts with the maker_bullet columns (without url, retrieved, source)
    and note."""
    out = []
    for tr in re.findall(r'<tr.*?</tr>', text, flags=re.S | re.I):
        cells = [clean_text(c) for c in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', tr, flags=re.S | re.I)]
        if len(cells) != len(HEADER) or cells[0] == HEADER[0] or not re.fullmatch(r'\d+', cells[0]):
            continue
        part, desc, cal, oal, bt, nose, ogive, bearing, sd, g1, g7, _ff, twist = cells
        dia = re.search(r'\((\d*\.\d+)\)', cal)
        dia = float(dia[1]) if dia else None
        w = re.search(r'(\d+(?:\.\d+)?)\s*gr\b', desc)
        weight, note = (float(w[1]), None) if w else (None, None)
        line = desc[w.end():].strip() if w else re.sub(r'^\d+(\.\d+)?\s*(cal|mm)\s*', '', desc, flags=re.I)
        if weight is None and dia and _num(sd):
            weight, note = round(_num(sd) * dia * dia * 7000), 'weight_from_sd'
            line = re.sub(r'^\d+\.\d+x\s*', '', line)  # "200.20x Hybrid Target": name, not weight
        t = re.search(r'1\s*:\s*(\d+(?:\.\d+)?)', twist)
        out.append(dict(maker='Berger', product_line=line, name=desc, part_number=part, diameter_in=dia,
                        weight_gr=weight, length_in=_num(oal), bc_g1=_num(g1), bc_g7=_num(g7), ogive_in=_num(ogive),
                        nose_in=_num(nose), bearing_in=_num(bearing), boattail_in=_num(bt),
                        twist_min_in=float(t[1]) if t else None, note=note))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('page', nargs='?', help='the reference chart page as saved (default: fixtures/sources/berger/…)')
    ap.add_argument('--db', default=COMPONENTS_DB)
    a = ap.parse_args()
    path = a.page or (SAVED if os.path.exists(SAVED) else None)
    if path:
        import datetime
        text = open(path, encoding='utf-8', errors='replace').read()
        retrieved = datetime.date.fromtimestamp(os.path.getmtime(path)).isoformat()
    else:
        data, retrieved = cached(URL, CACHE)
        text = data.decode('utf-8', 'replace')
    rows = parse(text)
    for r in rows:
        r.update(url=URL, retrieved=retrieved, source='berger-reference-charts')
    if not rows:
        sys.exit(f'no bullets found in {path or CACHE}: page layout changed?')
    replace_rows('maker_bullet', MAKER_BULLET_COLUMNS, rows, 'maker = ?', ('Berger',), db_path=a.db)
    print(f'maker_bullet: {len(rows)} Berger bullets ({sum(r["note"] == "weight_from_sd" for r in rows)} weights '
          f'from the sectional density), retrieved {retrieved} → {a.db}', file=sys.stderr)


if __name__ == '__main__':
    main()
