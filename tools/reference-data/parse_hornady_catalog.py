"""Reads the component bullets of the Hornady International catalogue (German edition, PDF saved by hand from
the publicly offered file) into the local component database: item number(s), calibre, type, diameter, weight, G1 and G7
BC. Hornady publishes no bullet lengths; they come from JBM in the merge.

  python3 tools/reference-data/parse_hornady_catalog.py [catalogue.pdf] [--db fixtures/open-db/components.db]

The bullet tables are transposed: one column per bullet, one row per property, the row labels right-aligned on
the left:

     KALIBER/   22 Cal.        6.5mm      …
          TYP   ECX™           ECX™       …     (a second line may follow: "(45-70 GOVT)")
  Durchmesser   .224"          .264"      …
      Gewicht   3,2 g/50 gr.   9,1 g/140 gr.
  G1 Ballistik Koeff. .164     .301            (or "Ballistik Koeff.")
  G7 Ballistik Koeff. N.A.     N.A.
  Quers.-Bel.   .142           .287
     Art.-Nr.   224034         263364          (several: "2266/2266B")
           VE   50             50

The header rows are set in a narrower font, so plain text output does not keep them over their columns; the
PDF is therefore read as words with coordinates (`pdftotext -bbox`). A table is found by its "Durchmesser"
label; its columns are the diameter values; every word right of the labels (up to the next table on the page)
goes to the row whose label shares its line and to the nearest column. Tables without a diameter row (loaded
ammunition) are skipped. Table maker_bullet (see bullet_sources.py), Hornady rows replaced on every run.
"""
import argparse
import datetime
import glob
import html
import os
import re
import subprocess
import sys

from bullet_sources import COMPONENTS_DB, FIX, MAKER_BULLET_COLUMNS, replace_rows

SOURCES = os.path.join(FIX, 'sources', 'hornady')
URL = 'https://www.hornady.com'
WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>')
LABELS = {'KALIBER/': 'caliber', 'KALIBER/TYP': 'caliber_type', 'TYP': 'type', 'Durchmesser': 'diameter',
          'Gewicht': 'weight', 'Koeff.': 'bc', 'Quers.-Bel.': 'sd', 'Art.-Nr.': 'item', 'VE': 'box'}
TYPE_ROWS = ('type', 'caliber_type')


class W:
    """A word of the page with its box."""
    __slots__ = ('x0', 'y0', 'x1', 'y1', 't')

    def __init__(self, x0, y0, x1, y1, t):
        self.x0, self.y0, self.x1, self.y1, self.t = float(x0), float(y0), float(x1), float(y1), t

    @property
    def x(self):
        return (self.x0 + self.x1) / 2

    @property
    def y(self):
        return (self.y0 + self.y1) / 2


def pages(bbox_html):
    """[[W]] per page of `pdftotext -bbox` output."""
    return [[W(*m.groups()[:4], html.unescape(m[5])) for m in WORD.finditer(p)] for p in bbox_html.split('<page ')[1:]]


def _fraction(s):
    """'.585' → 0.585, '226' (dot lost) → 0.226, 'N.A.' / '—' → None"""
    m = re.fullmatch(r'0?[.,](\d+)|(\d{3})', (s or '').strip())
    return float('0.' + (m[1] or m[2])) if m else None


def page_tables(words):
    """[{row: [text per column]}] of the bullet tables on one page."""
    out = []
    anchors = [w for w in words if w.t == 'Durchmesser']
    for a in anchors:
        edge = a.x1  # the labels are right-aligned
        others = [b.x0 for b in anchors if b is not a and b.x0 > a.x1 and abs(b.y - a.y) < 80]
        x_end = min(others) if others else 1e9  # the next table to the right ends this one
        near = lambda w: -45 < w.y - a.y < 75  # noqa: E731
        inside = [w for w in words if edge + 1 < w.x0 and w.x1 < x_end and near(w)]
        cols = sorted(w.x for w in inside if abs(w.y - a.y) < 4 and re.fullmatch(r'\.\d{3}["”]?', w.t))
        if not cols:
            continue
        half = (cols[-1] - cols[0]) / (len(cols) - 1) / 2 if len(cols) > 1 else 30
        inside = [w for w in inside if cols[0] - half < w.x < cols[-1] + half]  # not the side tab, not text beside
        labels = {}
        for w in words:
            name = LABELS.get(w.t)
            if not (name and abs(w.x1 - edge) < 6 and near(w)):
                continue
            if name == 'bc':
                left = [v.t for v in words if abs(v.y - w.y) < 3 and v.x1 <= w.x0 + 1 and v.x0 > edge - 120]
                name = 'g7' if 'G7' in left else 'g1'
            if name not in labels or abs(w.y - a.y) < abs(labels[name] - a.y):
                labels[name] = w.y
        if 'item' not in labels:
            continue
        other_rows = [y for n, y in labels.items() if n not in TYPE_ROWS]
        table = {}
        for name, y in labels.items():
            # the type row reaches down to the diameter row (a second line with the cartridge)
            lo, hi = (y - 3, labels['diameter'] - 4) if name in TYPE_ROWS else (y - 4, y + 4)
            cells = [[] for _ in cols]
            for w in inside:
                if lo <= w.y <= hi and not (name in TYPE_ROWS and any(abs(w.y - o) < 3 for o in other_rows)):
                    cells[min(range(len(cols)), key=lambda k: abs(cols[k] - w.x))].append(w)
            table[name] = [' '.join(v.t for v in sorted(c, key=lambda v: (round(v.y0), v.x0))) for c in cells]
        out.append(table)
    return out


def clean(s):
    return re.sub(r'\s+', ' ', (s or '').replace('™', ' ').replace('®', ' ')).strip()


def parse(bbox_html):
    """maker_bullet dicts (without url, retrieved, source) of the catalogue (`pdftotext -bbox` output)."""
    rows = []
    for words in pages(bbox_html):
        for t in page_tables(words):
            for i, dia in enumerate(t['diameter']):
                cell = lambda name: t[name][i] if name in t else ''  # noqa: E731
                w = re.search(r'(\d+(?:[.,]\d+)?)\s*gr', cell('weight'))
                d = re.search(r'\.\d{3}', dia)
                if not (w and d):
                    continue
                caliber, typ = clean(cell('caliber')), clean(cell('type'))
                if 'caliber_type' in t:
                    m = re.match(r'(\d+(?:\.\d+)?\s*(?:Cal\.|mm))\s*(.*)', clean(cell('caliber_type')))
                    caliber, typ = (m[1], m[2]) if m else ('', clean(cell('caliber_type')))
                use = re.findall(r'\(([^)]*)\)\*?', typ)  # "(45-70 GOVT)": the cartridge it is made for
                typ = re.sub(r'\s*\([^)]*\)\*?|\s*\*', '', typ).strip()
                # some tables put the type into the calibre row ("30 Cal. FTX") or a calibre into the type row
                caliber = re.sub(r'C\s+al\.', 'Cal.', caliber)
                m = re.fullmatch(r'(.*?(?:Cal\.|mm)/?)\s*(.*)', caliber)
                if m and m[2]:
                    caliber, typ = m[1], (typ or m[2])
                m = re.fullmatch(r'(\d+\s*Cal\.)\s*(.*)', typ)
                if m:
                    caliber, typ = f'{caliber} {m[1]}'.strip(), m[2]
                weight = float(w[1].replace(',', '.'))
                for item in re.split(r'\s*/\s*', cell('item')):
                    if not re.fullmatch(r'\d{4,6}[A-Z]?', item):
                        continue
                    note = [f'for {u}' for u in use]
                    if cell('sd') and _fraction(cell('sd')) is None:
                        note.append(f'SD {cell("sd")}')
                    rows.append(dict(maker='Hornady', product_line=typ or None, part_number=item,
                                     name=re.sub(r'\s+', ' ', f'{caliber} {weight:g} gr {typ}').strip(),
                                     diameter_in=float(d[0]), weight_gr=weight, bc_g1=_fraction(cell('g1')),
                                     bc_g7=_fraction(cell('g7')), note='; '.join(note) or None))
    seen = {}
    for r in rows:  # an item on two pages (new products, main table): the one with more values
        old = seen.get(r['part_number'])
        if not old or sum(v is not None for v in r.values()) > sum(v is not None for v in old.values()):
            seen[r['part_number']] = r
    return list(seen.values())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf', nargs='?', help='catalogue PDF (default: the newest *Catalog*.pdf in fixtures/sources/hornady)')
    ap.add_argument('--db', default=COMPONENTS_DB)
    a = ap.parse_args()
    pdf = a.pdf or max(glob.glob(os.path.join(SOURCES, '*Catalog*.pdf')), key=os.path.getmtime)
    bbox = subprocess.run(['pdftotext', '-bbox', pdf, '-'], capture_output=True, text=True, encoding='utf-8', check=True).stdout
    rows = parse(bbox)
    retrieved = datetime.date.fromtimestamp(os.path.getmtime(pdf)).isoformat()
    for r in rows:
        r.update(url=f'{URL} ({os.path.basename(pdf)})', retrieved=retrieved, source='hornady-catalogue-2023')
    if not rows:
        sys.exit(f'no bullets found in {pdf}')
    replace_rows('maker_bullet', MAKER_BULLET_COLUMNS, rows, 'maker = ?', ('Hornady',), db_path=a.db)
    print(f'maker_bullet: {len(rows)} Hornady item numbers, {sum(r["bc_g7"] is not None for r in rows)} with G7 '
          f'→ {a.db}', file=sys.stderr)


if __name__ == '__main__':
    main()
