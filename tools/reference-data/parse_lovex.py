"""Reads the load tables of the Lovex reloading guide (Explosia) from OCR text (tools/reference-data/ocr_pdf.py)
into a local SQLite database: per load the recommended and maximum charge with velocity V5, the measured
pressure (C.I.P., bar) and the cartridge length, plus the test barrel, case, primer and bullet.

  python3 tools/reference-data/parse_lovex.py fixtures/reference/lovex/ocr [--db fixtures/reference/lovex/lovex.db]
  python3 tools/reference-data/parse_lovex.py <digital guide.pdf>   (2019 and later: text, no OCR needed)

OCR drops decimal points and adds stray characters, so a row is only taken when its values agree in both
units the guide prints: grams × 15.432 = grains (both charges), m/s × 3.281 = fps (both velocities) and
bar × 14.504 = psi. Missing decimal points are restored by that agreement; rows that do not agree are left out.

Tables:
  block(id, page, caliber, barrel_mm, twist_in, case_maker, primer, col_max_mm, pmax_cip_bar,
        bullet_type, bullet_g, bullet_gr, bullet_maker, bullet_no)   bullet weight only where g and grs agree
  charge(block_id, powder, rec_g, rec_ms, max_g, max_ms, pressure_bar, col_mm, page, line)
"""
import argparse
import os
import re
import sqlite3
import sys

GR_PER_G = 15.4324
FPS_PER_MS = 3.28084
PSI_PER_BAR = 14.5038
TOKEN = re.compile(r'\d+(?:[.,]\d+)?')


def candidates(tok):
    """Possible values of a token: as read, and with a lost decimal point restored."""
    t = tok.replace(',', '.')
    v = float(t)
    out = [v]
    if '.' not in t:
        out += [v / 10, v / 100, v / 1000]
    return out


def solve(tokens):
    """(rec_g, rec_ms, max_g, max_ms, bar) from the numeric tokens of a row, or None. The tokens are taken in
    order; up to two stray tokens may be skipped between the fields."""
    vals = [candidates(t) for t in tokens]
    n = len(vals)

    def pair(i, rel, tol, lo, hi):
        """(a, b, next index) of two tokens i<j (j ≤ i+3) with b ≈ a·rel and lo ≤ a ≤ hi."""
        for i2 in range(i, min(i + 3, n)):
            for j in range(i2 + 1, min(i2 + 3, n)):
                for a in vals[i2]:
                    if not lo <= a <= hi:
                        continue
                    for b in vals[j]:
                        if abs(b - a * rel) <= tol(a * rel):
                            yield a, b, j + 1

    for g1, _, k1 in pair(0, GR_PER_G, lambda x: 0.06 + 0.004 * x, 0.05, 12):
        for v1, _, k2 in pair(k1, FPS_PER_MS, lambda x: 4, 150, 1500):
            for g2, _, k3 in pair(k2, GR_PER_G, lambda x: 0.06 + 0.004 * x, g1, 12):
                for v2, _, k4 in pair(k3, FPS_PER_MS, lambda x: 4, v1, 1500):
                    for bar, _, k5 in pair(k4, PSI_PER_BAR, lambda x: 0.004 * x + 60, 500, 6500):
                        return g1, v1, g2, v2, bar, k5
    return None


def powder_name(raw, known):
    """OCR'd powder name → Lovex name (S011, D073.5, ...), or None."""
    s = raw.strip(" '‘’\"|([{.,;:_-~").upper()
    if not s:
        return None
    first = {'$': 'S', '5': 'S', 'S': 'S', 'D': 'D', '0': 'D', 'O': 'D'}.get(s[0])
    rest = s[1:] if first and s[0] in '$5SDO' or (first == 'D' and s[0] == '0' and len(s) > 4) else s
    if first == 'D' and s[0] == '0' and len(s) <= 4:  # "073" may be "D073" without the D
        rest = s
    body = rest.replace('O', '0').replace('I', '1').replace('L', '1')
    m = re.match(r'(\d{3})(?:[.,](\d))?', body)
    if not first or not m:
        return None
    name = f'{first}{m[1]}' + (f'.{m[2]}' if m[2] else '')
    if name in known:
        return name
    base = f'{first}{m[1]}'
    return base if base in known else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('ocr_dir')
    ap.add_argument('--db', default='fixtures/reference/lovex/lovex.db')
    a = ap.parse_args()
    # Lovex powder names of the guide (D073.4 … D073.6 and D037.1/2 are separate powders)
    known = {'S011', 'S015', 'S020', 'S030', 'S035', 'S040', 'S053', 'S060', 'S062', 'S065', 'S070', 'S071',
             'D013', 'D032', 'D036', 'D037.1', 'D037.2', 'D037', 'D060', 'D063', 'D073.1', 'D073.2', 'D073.3',
             'D073.4', 'D073.5', 'D073.6', 'D073', 'D100'}
    os.makedirs(os.path.dirname(a.db), exist_ok=True)
    db = sqlite3.connect(a.db)
    db.executescript('''
      drop table if exists block; drop table if exists charge;
      create table block(id integer primary key, page integer, caliber text, barrel_mm real, twist_in real,
        case_maker text, primer text, col_max_mm real, pmax_cip_bar real, bullet_type text, bullet_g real,
        bullet_gr real, bullet_maker text, bullet_no text);
      create table charge(block_id integer, powder text, rec_g real, rec_ms real, max_g real, max_ms real,
        pressure_bar real, col_mm real, page integer, line integer);
    ''')
    if a.ocr_dir.lower().endswith('.pdf'):
        import subprocess
        text = subprocess.run(['pdftotext', '-layout', a.ocr_dir, '-'], capture_output=True, text=True).stdout
        pages = [(i + 1, t) for i, t in enumerate(text.split('\f'))]
    else:
        pages = [(int(re.search(r'(\d+)', f)[1]), open(os.path.join(a.ocr_dir, f), encoding='utf-8').read())
                 for f in sorted(f for f in os.listdir(a.ocr_dir) if f.endswith('.txt'))]
    caliber = barrel = twist = case = primer = colmax = pmax = None
    rows = rejected = 0
    for page, text in pages:
        lines = text.split('\n')
        block = None
        btype = bgram = bgr = bmaker = bno = None
        for k, line in enumerate(lines):
            if (m := re.search(r'^\W*([0-9.,]+\s*(?:x|×)\s*[0-9.,]+.*?|\.\d{2,3}\s+\S.*?)\s*\(continued\)', line)):
                caliber = m[1].strip()
            if 'Barrel Length' in line:
                # the caliber name stands on the line before
                prev = next((l.strip(" |'‘_-—") for l in reversed(lines[max(k - 3, 0):k]) if l.strip(" |'‘_-—")), '')
                if prev and not re.search(r'Grams|Bar|PSI|Length$', prev):
                    caliber = re.sub(r'\s{2,}.*$', '', prev)
                barrel = float(m[1]) if (m := re.search(r'Barrel Length:?\s*(\d{2,4})\s*mm', line)) else None
                colmax = float(m[1]) if (m := re.search(r'Cartridge Length:?\s*(\d+[.,]\d+)', line)) else None
                case = m[1].strip() if (m := re.search(r'Case:?\s*(.+?)\s{2,}', line)) else None
                block = None
            if 'Twist' in line:
                twist = float(m[1]) if (m := re.search(r'Twist:?\s*(\d+[.,]\d+)', line)) else twist
                primer = m[1].strip() if (m := re.search(r'Primer:?\s*(.+?)\s{2,}', line)) else primer
                pmax = float(m[1].replace(' ', '')) if (m := re.search(r'CIP:?\s*(\d[\d ]{2,5})\s*Bar', line)) else pmax
            if re.search(r'Recommended Loads', line):
                block = None
                bm = re.search(r'(Sellier\s*&\s*Bellot|Hornady|Sierra|Lapua|Norma|Speer|Nosler|Barnes|Hirtenberger|RWS|Lovex|Fiocchi|Prvi|PPU|H\s*&\s*N)', ' '.join(lines[k:k + 2]), re.I)
                bmaker = bm[1] if bm else None
                bno = None
                btype = bgram = bgr = None
            if 'Powder' in line and 'Charge' in line:
                # every table has this header; a block whose bullet lines were lost must not inherit the last bullet
                block = None
                btype = bgram = bgr = None
            if bmaker and (m := re.search(r'No\.?\s*(\d{3,5})', line)):
                bno = m[1]
            if (m := re.search(r'^\W*([A-Z][A-Z\-/]{1,10})\s*\|?\s*Powder', line)):
                btype = m[1]
            is_row = re.match(r"^\W*([$5SsDdO0][^\s|]{2,6})\s", line) and powder_name(re.match(r"^\W*([$5SsDdO0][^\s|]{2,6})\s", line)[1], known)
            if block is None and not is_row and 'Grams' not in line and 'Length' not in line:
                # the bullet mass in g ("12.70", "3.24 q") stands between the table header and the first row
                for t in re.findall(r'(?<![\d.])(\d{1,2}[.,]\d{1,3})(?=\s*g\b|\s*$)', line):
                    if bgram is None and 1 < float(t.replace(',', '.')) < 50:
                        bgram = float(t.replace(',', '.'))
            if (m := re.search(r'(\d{2,3}(?:[.,]\d)?)\s*grs?\b', line)):
                bgr = float(m[1].replace(',', '.'))
            m = re.match(r"^\W*([$5SsDdO0][^\s|]{2,6})\s", line)
            if not m:
                continue
            name = powder_name(m[1], known)
            if not name:
                continue
            tokens = TOKEN.findall(line[m.end():])
            got = solve(tokens)
            if not got:
                rejected += 1
                continue
            g1, v1, g2, v2, bar, used = got
            col = None
            for t in tokens[used:]:
                c = float(t.replace(',', '.'))
                if colmax and 0.8 * colmax <= c <= colmax + 0.5:
                    col = c
            if block is None:
                # the bullet weight is printed in g and grs; OCR misreads one of them often: keep it only if they agree
                if not (bgram and bgr and abs(bgram * GR_PER_G / bgr - 1) < 0.015):
                    bgram = bgr = None
                block = db.execute('insert into block(page, caliber, barrel_mm, twist_in, case_maker, primer, col_max_mm, pmax_cip_bar, bullet_type, bullet_g, bullet_gr, bullet_maker, bullet_no) values (?,?,?,?,?,?,?,?,?,?,?,?,?)',
                                   (page, caliber, barrel, twist, case, primer, colmax, pmax, btype, bgram, bgr, bmaker, bno)).lastrowid
            db.execute('insert into charge values (?,?,?,?,?,?,?,?,?,?)', (block, name, g1, v1, g2, v2, bar, col, page, k + 1))
            rows += 1
    db.commit()
    print(f'{rows} rows read, {rejected} rows rejected (values disagree) → {a.db}', file=sys.stderr)


if __name__ == '__main__':
    main()
