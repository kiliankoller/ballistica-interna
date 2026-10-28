"""Writes the Lovex loads (fixtures/reference/lovex/lovex.db, parse_lovex.py) in the load format of
parse_rs_guide.py, so that a measured set can be built from them
(fixtures/runs/<set>). Lovex gives the pressure of
the maximum charge only; the recommended charge carries its velocity alone.

  python3 tools/reference-data/lovex_to_loads.py [fixtures/reference/lovex/lovex.db] > fixtures/reference/lovex.json
"""
import json
import sqlite3
import sys

def main():
    db = sqlite3.connect(sys.argv[1] if len(sys.argv) > 1 else 'fixtures/reference/lovex/lovex.db')
    loads = []
    for (caliber, barrel, colmax, btype, bgr, bmaker, powder, rec_g, rec_ms, max_g, max_ms, bar, col, page, line) in db.execute(
            'select b.caliber, b.barrel_mm, b.col_max_mm, b.bullet_type, b.bullet_gr, b.bullet_maker, c.powder, c.rec_g, '
            'c.rec_ms, c.max_g, c.max_ms, c.pressure_bar, c.col_mm, c.page, c.line from charge c join block b on b.id = c.block_id'):
        if not bgr:
            continue  # bullet unknown
        loads.append(dict(caliber=caliber, grains=bgr, bulletMaker=bmaker or 'Sellier & Bellot', bulletType=btype or '',
                          caseMaker='Sellier & Bellot', powder=powder,
                          min=dict(g=rec_g, v=rec_ms, p=None, fill=None), max=dict(g=max_g, v=max_ms, p=bar, fill=None),
                          barrel=barrel, twist=None, col=col or colmax, notes='', line=(page or 0) * 1000 + (line or 0)))
    json.dump(loads, sys.stdout, indent=1)
    print(f'{len(loads)} loads', file=sys.stderr)


if __name__ == '__main__':
    main()
