"""Reads the bullet table of the Styria Arms AERO price list (PDF, `pdftotext -layout`) into the local
component database: diameter, weight, overall length, tip length, hollow point, maximum seating depth,
G1 BC and the recommended twist, as published by the maker.

  pdftotext -layout "AERO Preisliste - kompl.pdf" aero.txt
  python3 tools/reference-data/parse_aero_pricelist.py aero.txt [--db fixtures/open-db/components.db]

Table bullet(maker, model, type, diameter_in, diameter_mm, weight_gr, mass_g, hollow, length_mm, tip_mm,
smax_mm, bc_g1, twist_note, source); rows of the same source are replaced on every run. The tail (boat tail)
dimensions are not in the price list.
"""
import argparse
import os
import re
import sqlite3
import sys

HOLLOW = re.compile(r'(\d+(?:,\d+)?)\s*/\s*(\d+(?:,\d+)?(?:-\d+(?:,\d+)?)?)')
TOKEN = re.compile(r'\d+(?:,\d+)?')
TYPE_WORD = re.compile(r'^\s*([A-Z][A-Za-z-]*(?:\s+[A-Za-z-]+)?)\s*$')
GRAIN_G = 0.06479891


def f(x):
    return float(x.replace(',', '.'))


def values_after_weight(text, din):
    """(mm, grain, gram, hollow, [length, tip, smax, bc], note) or None: the values in table order after the
    caliber; the weight pair is found by grain → gram, the hollow point (a / b) is optional."""
    toks = [(m.start(), m.end(), f(m[0])) for m in TOKEN.finditer(text)]
    pair = next((i for i in range(len(toks) - 1) if abs(toks[i + 1][2] - toks[i][2] * GRAIN_G) < 0.06), None)
    if pair is None:
        return None
    mm = toks[pair - 1][2] if pair > 0 and abs(toks[pair - 1][2] - din * 25.4) < 0.3 else round(din * 25.4, 2)
    pos = toks[pair + 1][1]
    hollow = re.match(r'\s*' + HOLLOW.pattern, text[pos:])
    if hollow:
        pos += hollow.end()
    rest = [(m.end(), f(m[0])) for m in TOKEN.finditer(text, pos)][:4]
    if len(rest) < 4:
        return None
    note = re.sub(r'\s+', ' ', re.sub(r'(\s+\d+){2}\s*$', '', text[rest[3][0]:])).strip()
    return mm, toks[pair][2], toks[pair + 1][2], f'{hollow[1]}/{hollow[2]}' if hollow else '', [v for _, v in rest], note


def parse(lines):
    """Rows start with "<no> AERO". The layout breaks some rows over several lines, so the following lines
    are added one by one until the row is complete."""
    out = []
    for k, line in enumerate(lines):
        head = re.match(r'^\s*(\d+)\s+AERO\b(.*)$', line)
        if not head:
            continue
        text, got = head[2], None
        for extra in range(4):
            cal = re.search(r'\b0,(\d{3})\b', text)
            if cal:
                got = values_after_weight(text[cal.end():], int(cal[1]) / 1000)
                if got:
                    break
            nxt = lines[k + 1 + extra] if k + 1 + extra < len(lines) else ''
            if re.match(r'^\s*\d+\s+AERO\b', nxt):
                break
            text += '  ' + nxt
        if not got:
            print(f'not read: {line.strip()}', file=sys.stderr)
            continue
        mm, gr, gram, hollow, (length, tip, smax, bc), note = got
        if not (smax < length and tip < length and 0 < bc < 1.2 and 5 < length < 80):
            print(f'implausible, left out: {line.strip()}', file=sys.stderr)
            continue
        btype = re.sub(r'\s+', ' ', head[2][:max(head[2].find('0,' + cal[1]), 0)]).strip()
        if not btype:
            # the type stands on the lines around, possibly broken ("SUB-I-" / "RO") and next to other text
            parts = [m[1] for l in (lines[k - 1], lines[k + 1]) if (m := re.match(r'^\s{5,}([A-Z][A-Za-z-]*)(?:\s{3,}|\s*$)', l))]
            btype = ''.join(p if p.endswith('-') else p + ' ' for p in parts).strip()
        out.append(dict(maker='Styria Arms', model='AERO', type=btype, diameter_in=int(cal[1]) / 1000,
                        diameter_mm=mm, weight_gr=gr, mass_g=gram, hollow=hollow, length_mm=length, tip_mm=tip,
                        smax_mm=smax, bc_g1=bc, twist_note=note))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('text')
    ap.add_argument('--db', default='fixtures/open-db/components.db')
    a = ap.parse_args()
    rows = parse(open(a.text, encoding='utf-8').read().split('\n'))
    os.makedirs(os.path.dirname(a.db), exist_ok=True)
    db = sqlite3.connect(a.db)
    db.execute('''create table if not exists bullet(maker text, model text, type text, diameter_in real,
      diameter_mm real, weight_gr real, mass_g real, hollow text, length_mm real, tip_mm real, smax_mm real,
      bc_g1 real, twist_note text, source text)''')
    source = 'Styria Arms AERO price list'
    db.execute('delete from bullet where source = ?', (source,))
    db.executemany('insert into bullet values (:maker,:model,:type,:diameter_in,:diameter_mm,:weight_gr,:mass_g,'
                   ':hollow,:length_mm,:tip_mm,:smax_mm,:bc_g1,:twist_note,:source)',
                   [dict(r, source=source) for r in rows])
    db.commit()
    db.close()
    print(f'{len(rows)} bullets → {a.db}', file=sys.stderr)


if __name__ == '__main__':
    main()
