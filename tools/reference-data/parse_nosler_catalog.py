"""Reads the bullets of the Nosler product guide (catalogue PDF, saved by hand from the publicly offered file) into the
local component database: part number(s), calibre, diameter, weight, type, sectional density, G1 BC, overall
length and, where the card shows it, G1 and G7 BC boxes; the product line comes from the catalogue's table of
contents (page ranges).

  python3 tools/reference-data/parse_nosler_catalog.py [catalogue.pdf] [--db fixtures/open-db/components.db]

Each catalogue page (a PDF page is a spread of two) is read with `pdftotext -raw` (poppler), which keeps the order in which the page draws its text: every
bullet card is one block that starts with its line "SD. … BC. … OAL. …" and holds, in varying order, the calibre
("30 Cal", "6.5mm"), the diameter ("(.308”)"), one line per box size ("100 Ct. 58456"), the weight and type
("190 Gr. Spitzer") and optionally the G1 / G7 boxes; a G7 box is taken only if the G1 box beside it equals
the BC of the card. Twist notes are drawn at the end of the page, apart from their card: not read. Some cards exist twice in the PDF: an
old version covered by the visible one, which is drawn later (checked by rendering the page). So a part number
seen again replaces the earlier card; if the values differ the row is marked catalogue_layers in note.
A card with several box sizes gives one row per part number. Table maker_bullet (see bullet_sources.py), Nosler
rows replaced on every run.
"""
import argparse
import datetime
import glob
import os
import re
import subprocess
import sys

from bullet_sources import COMPONENTS_DB, FIX, MAKER_BULLET_COLUMNS, replace_rows

SOURCES = os.path.join(FIX, 'sources', 'nosler')
URL = 'https://www.nosler.com'

# a value may lack its "0." ("BC. 634" on one card): read as a fraction
SPEC = re.compile(r'SD\.\s*(\d*\.?\d+)\s*BC\.\s*(\d*\.?\d+)\s*OAL\.\s*(\d*\.\d+)\s*["”]?')
CAL = re.compile(r'^\s*(\d+(?:\.\d+)?)\s*(Cal|mm)\s*$', re.I)
DIA = re.compile(r'^\s*\((\d*\.\d+)\s*["”]\)\s*$')
PART = re.compile(r'(\d+)\s*Ct\.\s*(\d{5})')
WEIGHT = re.compile(r'^\s*(?:(\d+(?:\.\d+)?)\s*(?:Cal|mm)\s*)?(\d+(?:\.\d+)?)\s*Gr\.\s*(.*?)\s*$')
TOC = re.compile(r'^\s*(\d+)(?:-(\d+))?\s+(\S.*?)(?:\s{3,}|\s*$)')  # the next column after 3+ spaces
NUMBER = re.compile(r'^\s*(0?\.\d+)\s*$')


def table_of_contents(layout_text):
    """[(first, last catalogue page, title)] of the bullet sections in the table of contents (`pdftotext -layout`
    of the contents page: in -raw output numbers and titles are separate lists)."""
    out = []
    for line in layout_text.split('\n'):
        m = TOC.match(line)
        if m and re.search(r'Bullet|Muzzle Loader|RDF|Sporting Handgun', m[3]):
            title = re.sub(r'\s+', ' ', m[3].replace('®', ' ').replace('™', ' ')).strip()
            out.append((int(m[1]), int(m[2] or m[1]), re.sub(r'\s*Bullets?$', '', title)))
    return out




def card(block):
    """dict of one card block (list of lines, the first is the SD/BC/OAL line) or None."""
    m = SPEC.search(block[0])
    if not m:
        return None
    frac = lambda v: float(v) if '.' in v else float('0.' + v)  # noqa: E731
    r = dict(sd=frac(m[1]), bc_g1=frac(m[2]), length_in=float(m[3]), parts=[], caliber=None)
    numbers, labels = [], []
    for line in block[1:]:
        if SPEC.search(line):
            break
        if CAL.match(line):
            r['caliber'] = r['caliber'] or line.strip()
        elif DIA.match(line):
            r.setdefault('diameter_in', float(DIA.match(line)[1]))
        elif PART.search(line):
            r['parts'] += PART.findall(line)
        elif WEIGHT.match(line) and 'weight_gr' not in r:
            w = WEIGHT.match(line)
            r['weight_gr'] = float(w[2])
            t = re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', w[3])  # "SpitzerPoint" → "Spitzer Point"
            r['type'] = re.sub(r'\s*\(\s*', ' (', re.sub(r'\s*\)', ')', t)).strip()
            if w[1]:
                r['caliber'] = r['caliber'] or w[1]
        elif re.search(r'G[17]\s*Ballistic', line):
            labels.append('G7' if 'G7' in line else 'G1')
        elif NUMBER.match(line) and labels and len(numbers) < len(labels):
            numbers.append((labels[len(numbers)], float(NUMBER.match(line)[1])))
    boxes = dict(numbers)
    if 'G1' in boxes and abs(boxes['G1'] - r['bc_g1']) > 1e-9:
        r['g1_box'] = boxes['G1']  # the boxes may belong to another card: keep the spec line, no G7, say so
    elif 'G7' in boxes and 'G1' in boxes:
        r['bc_g7'] = boxes['G7']
    return r if r.get('diameter_in') and r.get('weight_gr') and r['parts'] else None


def parse(pages, contents):
    """Bullets of the catalogue as maker_bullet dicts: pages is {catalogue page number: `pdftotext -raw` text of
    that page}, contents the `pdftotext -layout` output of the contents page."""
    toc = table_of_contents(contents)

    def line_of(page_no):
        return next((title for first, last, title in toc if first <= page_no <= last), None)

    by_part = {}
    for no, page in sorted(pages.items()):
        lines = page.split('\n')
        starts = [i for i, l in enumerate(lines) if SPEC.search(l)]
        for a, b in zip(starts, starts[1:] + [len(lines)]):
            c = card(lines[a:b])
            if not c:
                continue
            for count, part in c['parts']:
                row = dict(maker='Nosler', product_line=line_of(no), part_number=part, diameter_in=c['diameter_in'],
                           weight_gr=c['weight_gr'], length_in=c['length_in'], bc_g1=c['bc_g1'], bc_g7=c.get('bc_g7'),
                           name=f'{c["caliber"] or ""} {c["weight_gr"]:g} gr {c["type"]}'.strip(),
                           note='; '.join(x for x in (f'{count} ct', c.get('g1_box') and f'G1 box {c["g1_box"]}') if x))
                old = by_part.get(part)
                if old and any(old[k] != row[k] for k in ('length_in', 'bc_g1', 'weight_gr', 'diameter_in')):
                    row['note'] += f'; catalogue_layers (covered card: OAL {old["length_in"]}, BC {old["bc_g1"]})'
                if old and old['product_line'] and not row['product_line']:
                    row['product_line'] = old['product_line']
                by_part[part] = row
    return list(by_part.values())


def catalogue_pages(pdf):
    """{catalogue page number: `pdftotext -raw` text}: the cover is a single page, every further PDF page a spread
    of two catalogue pages, read as left and right half."""
    info = subprocess.run(['pdfinfo', pdf], capture_output=True, text=True, encoding='utf-8', check=True).stdout
    count = int(re.search(r'Pages:\s+(\d+)', info)[1])
    out = {}
    for p in range(1, count + 1):
        size = subprocess.run(['pdfinfo', '-f', str(p), '-l', str(p), pdf], capture_output=True, text=True, encoding='utf-8', check=True).stdout
        w, h = (float(x) for x in re.search(r'Page\s+\d+ size:\s+([\d.]+) x ([\d.]+)', size).groups())
        halves = [(0, w)] if w < h else [(0, w / 2), (w / 2, w / 2)]
        for i, (x, width) in enumerate(halves):
            no = 1 if p == 1 else 2 * p - 3 + i
            out[no] = subprocess.run(['pdftotext', '-raw', '-f', str(p), '-l', str(p), '-x', str(int(x)), '-y', '0',
                                      '-W', str(int(width)), '-H', str(int(h)), pdf, '-'],
                                     capture_output=True, text=True, encoding='utf-8', check=True).stdout
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf', nargs='?', help='the catalogue PDF (default: the newest in fixtures/sources/nosler)')
    ap.add_argument('--db', default=COMPONENTS_DB)
    a = ap.parse_args()
    pdf = a.pdf or max(glob.glob(os.path.join(SOURCES, '*.pdf')), key=os.path.getmtime)
    pages = catalogue_pages(pdf)
    contents = subprocess.run(['pdftotext', '-layout', '-f', '2', '-l', '2', pdf, '-'], capture_output=True, text=True, encoding='utf-8',
                              check=True).stdout
    rows = parse(pages, contents)
    retrieved = datetime.date.fromtimestamp(os.path.getmtime(pdf)).isoformat()
    for r in rows:
        r.update(url=f'{URL} ({os.path.basename(pdf)})', retrieved=retrieved, source='nosler-catalogue-2025')
    if not rows:
        sys.exit(f'no bullets found in {pdf}')
    replace_rows('maker_bullet', MAKER_BULLET_COLUMNS, rows, 'maker = ?', ('Nosler',), db_path=a.db)
    layers = sum('catalogue_layers' in (r['note'] or '') for r in rows)
    print(f'maker_bullet: {len(rows)} Nosler part numbers ({layers} with a covered older card that differs), '
          f'{sum(r["bc_g7"] is not None for r in rows)} with G7 → {a.db}', file=sys.stderr)


if __name__ == '__main__':
    main()
