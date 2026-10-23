"""Reads the JBM bullet length list (https://jbmballistics.com/downloads/lengthlist.html) into the local component
database: per maker the diameter (in), weight (gr), description, overall length (in) and plastic tip length (in).
JBM gives no part numbers; the merge matches by maker, diameter, weight and normalised type name. Rows whose
description ends in "(Litz)" were measured by Bryan Litz (measured_by). Rows without a length are kept (the
bullet exists, its length is unknown).

  python3 tools/reference-data/parse_jbm_lengths.py [--refresh] [--db fixtures/open-db/components.db]

The page is cached in fixtures/reference/jbm/lengthlist.html and fetched only if missing (or --refresh);
JBM has no robots.txt and no terms on the page. Table jbm_length (see bullet_sources.py), replaced on every run.
"""
import argparse
import html.parser
import os
import sys

from bullet_sources import COMPONENTS_DB, FIX, JBM_COLUMNS, cached, clean_text, replace_rows

URL = 'https://jbmballistics.com/downloads/lengthlist.html'
CACHE = os.path.join(FIX, 'reference', 'jbm', 'lengthlist.html')


class _Table(html.parser.HTMLParser):
    """Collects [(section title, [cell texts])] of the rows of class bullet_length_row; the cells are not closed
    in the page, a new <td>/<tr>/<th> ends the one before."""

    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.rows, self.section, self.cells, self.cell, self.in_title = [], None, None, None, False

    def _end_cell(self):
        if self.cell is not None and self.cells is not None:
            self.cells.append(clean_text(''.join(self.cell)))
        self.cell = None

    def _end_row(self):
        self._end_cell()
        if self.cells is not None and self.section:
            self.rows.append((self.section, self.cells))
        self.cells = None

    def handle_starttag(self, tag, attrs):
        cls = dict(attrs).get('class', '')
        if tag in ('tr', 'td'):
            self.in_title = False
        if tag == 'tr':
            self._end_row()
            if cls == 'bullet_length_row':
                self.cells = []
        elif tag == 'th':
            self._end_row()
            self.in_title = cls == 'bullet_length_section_title'
            self.cell = [] if self.in_title else None
        elif tag == 'td':
            self._end_cell()
            if self.cells is not None:
                self.cell = []

    def handle_endtag(self, tag):
        if tag == 'table':
            self._end_row()

    def handle_data(self, data):
        if self.in_title and self.cell is not None:
            self.cell.append(data)
            self.section = clean_text(''.join(self.cell))
        elif self.cell is not None:
            self.cell.append(data)

    def handle_entityref(self, name):
        self.handle_data(f'&{name};')

    def handle_charref(self, name):
        self.handle_data(f'&#{name};')


def _num(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def parse(text):
    """Rows of the length list as dicts (maker, diameter_in, weight_gr, description, length_in, tip_in,
    measured_by); the index table at the top (maker / percent complete) is skipped."""
    p = _Table()
    p.feed(text)
    p.close()
    p._end_row()
    out = []
    for section, cells in p.rows:
        if len(cells) < 4 or _num(cells[0]) is None or _num(cells[1]) is None:
            continue  # index rows (name, percent) and anything else that is not a bullet
        desc = cells[2]
        out.append(dict(maker=section, diameter_in=_num(cells[0]), weight_gr=_num(cells[1]), description=desc,
                        length_in=_num(cells[3]), tip_in=_num(cells[4]) if len(cells) > 4 else None,
                        measured_by='Litz' if '(Litz)' in desc else None))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--refresh', action='store_true', help='fetch the page again')
    ap.add_argument('--db', default=COMPONENTS_DB)
    a = ap.parse_args()
    data, retrieved = cached(URL, CACHE, refresh=a.refresh)
    rows = parse(data.decode('utf-8', 'replace'))
    for r in rows:
        r.update(url=URL, retrieved=retrieved)
    replace_rows('jbm_length', JBM_COLUMNS, rows, '1 = 1', (), db_path=a.db)
    makers = {}
    for r in rows:
        n, l = makers.get(r['maker'], (0, 0))
        makers[r['maker']] = (n + 1, l + (r['length_in'] is not None))
    for m in ('Berger', 'Nosler', 'Sierra', 'Barnes', 'Speer', 'Hornady', 'Lapua'):
        n, l = makers.get(m, (0, 0))
        print(f'  {m:8} {n:4} bullets, {l:4} with length', file=sys.stderr)
    print(f'jbm_length: {len(rows)} rows from {len(makers)} makers (retrieved {retrieved}) → {a.db}', file=sys.stderr)


if __name__ == '__main__':
    main()
