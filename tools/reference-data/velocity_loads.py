"""Writes the velocity-only load data (Vihtavuori, Barnes, Sierra, Hornady basic data) in the load format of
parse_rs_guide.py, so that measured sets can be built from them (powder maker "*", powders found
through data/powder_aliases.csv). Units become g, m/s and mm. Sierra lists a charge per velocity column: only
the highest charge of each powder and table is kept, with the first bullet of the table.

  python3 tools/reference-data/velocity_loads.py   → fixtures/reference/{vihtavuori,barnes,sierra,hornady}.json
"""
import json
import os
import sqlite3
import sys
from contextlib import closing

REF = os.path.join(os.path.dirname(__file__), '..', '..', 'fixtures', 'reference')
G_PER_GR = 0.0647989
MS_PER_FPS = 0.3048


def load(caliber, grains, maker, btype, powder, mn, mx, barrel_mm, col_mm, line):
    return dict(caliber=caliber, grains=grains, bulletMaker=maker or '', bulletType=btype or '', caseMaker='',
                powder=powder, min=mn, max=mx, barrel=barrel_mm, twist=None, col=col_mm, notes='', line=line)


def charge(g, v):
    return dict(g=g, v=v, p=None, fill=None)


def vihtavuori():
    with closing(sqlite3.connect(os.path.join(REF, 'vihtavuori', 'vihtavuori.db'))) as db:
        for i, (cal, barrel, bg, maker, btype, col, powder, sg, sv, mg, mv) in enumerate(db.execute(
                'select c.name, c.barrel_mm, h.bullet_gr, h.bullet_maker, h.bullet_type, h.col_mm, h.powder, h.start_g, '
                'h.start_ms, h.max_g, h.max_ms from charge h join cartridge c on c.id = h.cartridge_id')):
            yield load(cal, bg, maker, btype, powder, charge(sg, sv), charge(mg, mv), barrel, col, i)


def barnes():
    with closing(sqlite3.connect(os.path.join(REF, 'barnes', 'barnes.db'))) as db:
        for i, (cal, barrel, bw, bname, coal, powder, ming, minv, maxg, maxv) in enumerate(db.execute(
                'select c.name, c.barrel_in, b.weight_gr, b.name, b.coal_in, h.powder, h.min_gr, h.min_fps, h.max_gr, h.max_fps '
                'from charge h join cartridge c on c.id = h.cartridge_id '
                'join bullet b on b.cartridge_id = h.cartridge_id and b.bullet_no = h.bullet_no')):
            if not (barrel and coal and maxv):
                continue
            yield load(cal, bw, 'Barnes', bname, powder, charge(ming * G_PER_GR, minv * MS_PER_FPS),
                       charge(maxg * G_PER_GR, maxv * MS_PER_FPS), barrel * 25.4, coal * 25.4, i)


def sierra():
    with closing(sqlite3.connect(os.path.join(REF, 'sierra', 'sierra.db'))) as db:
        rows = db.execute('''select c.name, c.barrel_in, h.table_no, h.powder, max(h.charge_gr), h.velocity_fps,
            (select weight_gr from bullet b where b.cartridge_id = h.cartridge_id and b.table_no = h.table_no order by rowid limit 1),
            (select type from bullet b where b.cartridge_id = h.cartridge_id and b.table_no = h.table_no order by rowid limit 1),
            (select coal_in from bullet b where b.cartridge_id = h.cartridge_id and b.table_no = h.table_no order by rowid limit 1)
            from charge h join cartridge c on c.id = h.cartridge_id group by h.cartridge_id, h.table_no, h.powder''')
        for i, (cal, barrel, table, powder, g, v, bw, btype, coal) in enumerate(rows):
            if not (barrel and coal and bw):
                continue
            # max(charge) picks the row of the highest charge; its velocity comes with it (SQLite bare column)
            yield load(cal, bw, 'Sierra', btype, powder, charge(None, None), charge(g * G_PER_GR, v * MS_PER_FPS),
                       barrel * 25.4, coal * 25.4, i)


def hornady():
    with closing(sqlite3.connect(os.path.join(REF, 'hornady', 'hornady.db'))) as db:
        for i, (cal, barrel, bw, bname, coal, powder, sg, sv, mg, mv) in enumerate(db.execute(
                'select cartridge, barrel_in, bullet_gr, bullet, coal_in, powder, start_gr, start_fps, max_gr, max_fps from basic_load')):
            if not (barrel and coal and mg and mv and sg and sv):
                continue
            yield load(cal, bw, 'Hornady', bname, powder, charge(sg * G_PER_GR, sv * MS_PER_FPS),
                       charge(mg * G_PER_GR, mv * MS_PER_FPS), barrel * 25.4, coal * 25.4, i)


def main():
    for name, gen in (('vihtavuori', vihtavuori), ('barnes', barnes), ('sierra', sierra), ('hornady', hornady)):
        loads = list(gen())
        with open(os.path.join(REF, f'{name}.json'), 'w', encoding='utf-8') as f:
            json.dump(loads, f)
        print(f'{name}: {len(loads)} loads', file=sys.stderr)


if __name__ == '__main__':
    main()
