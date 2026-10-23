"""Builds the master database of the app (data/build/ballisticainterna.db) from the CSVs in data/ and checks every row.
Table and column names follow the field names the app reads (caliber, projectile, propellant); a row that fails
a check stops the build with the reason.

  python3 tools/master-data/build_db.py [--out data/build/ballisticainterna.db]
"""
import argparse
import csv
import os
import sqlite3
import sys

DATA = os.path.join(os.path.dirname(__file__), '..', '..', 'data')
TABLES = {'calibers.csv': 'caliber', 'bullets.csv': 'projectile', 'powders.csv': 'propellant'}
TEXT = {'cipname', 'altname', 'country', 'cipdate', 'ciprevdate', 'source', 'mname', 'pname', 'caliber', 'note',
        'fit_status', 'V_estimated', 'part_number', 'product_line', 'length_source', 'url', 'retrieved', 'flags'}


def num(r, k):
    try:
        return float(r[k])
    except (KeyError, ValueError):
        return None


def check(table, r):
    """Reasons why a row is implausible (empty list: fine)."""
    bad = []
    def need(cond, why):
        if not cond:
            bad.append(why)
    if table == 'caliber':
        L3, L6, G1, P1, pmax = (num(r, k) for k in ('L3', 'L6', 'G1', 'P1', 'Pmax'))
        # L6 < L3 is possible (7,62 Nagant: the bullet sits fully inside the case)
        need(L3 and L6 and 0 < L3 < 150 and 0.8 * L3 < L6 < 200, f'lengths L3 {L3} / L6 {L6}')
        need(G1 and 1.5 < G1 < 30, f'bullet diameter G1 {G1}')  # up to 4 bore (25.4 mm)
        # heeled bullets (10 x 22 T) are a little wider than the case body
        need(not P1 or not G1 or G1 < P1 + 0.5, f'G1 {G1} wider than P1 {P1}')
        need(pmax and 300 < pmax < 7000, f'Pmax {pmax}')
        V = num(r, 'V')
        need(V is None or 0.5 < V < 1200, f'case capacity V {V} grains')  # up to 4 bore
    elif table == 'projectile':
        d, m, l, depth, bc = (num(r, k) for k in ('gdia', 'gmass', 'glen', 'gdepthmax', 'g1bc'))
        need(d and 2 < d < 25, f'diameter {d}')
        need(m and 5 < m < 1500, f'mass {m} gr')
        # a length may be missing (offered, marked missing; decided 2026-10-20), but only when flagged so
        unknown = {'length_missing', 'length_ambiguous'} & set((r.get('flags') or '').split())
        need((l is None and unknown) or (l and d and d < l < 100), f'length {l}')
        need(depth is None or (l and depth < l), f'max. seating depth {depth} vs length {l}')
        need(bc is None or 0 < bc < 1.3, f'BC {bc}')
    elif table == 'propellant':
        ba, q, k, z1, z2, pcd = (num(r, x) for x in ('Ba', 'Qex', 'k', 'z1', 'z2', 'pcd'))
        need(ba and 0.05 < ba < 10, f'Ba {ba}')
        need(q and 2500 < q < 6000, f'Qex {q} kJ/kg')
        need(k and 1.1 < k < 1.4, f'k {k}')
        need(z1 is not None and z2 is not None and 0 < z1 <= z2 < 1, f'z1 {z1} / z2 {z2}')
        need(pcd and 250 < pcd < 1150, f'bulk density {pcd}')
    return bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(DATA, 'build', 'ballisticainterna.db'))
    a = ap.parse_args()
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    if os.path.exists(a.out):
        os.remove(a.out)
    db = sqlite3.connect(a.out)
    errors = 0
    for file, table in TABLES.items():
        with open(os.path.join(DATA, file), newline='') as f:
            rows = list(csv.DictReader(f))
            columns = list(rows[0].keys()) if rows else next(csv.reader(open(os.path.join(DATA, file))))
        cols = ', '.join(f'"{c}" {"text" if c in TEXT else "real"}' for c in columns)
        # id, geloescht and status as in the tables the app knows
        db.execute(f'create table {table} (id integer primary key, {cols}, geloescht integer default 0, status text default \'\')')
        for i, r in enumerate(rows, start=2):
            for why in check(table, r):
                print(f'{file}:{i} {r.get("cipname") or r.get("pname")}: {why}', file=sys.stderr)
                errors += 1
            db.execute(f'insert into {table} ({", ".join(f"{chr(34)}{c}{chr(34)}" for c in columns)}) values ({", ".join("?" * len(columns))})',
                       [None if v == '' else (v if c in TEXT else float(v)) for c, v in r.items()])
        print(f'{table}: {len(rows)} rows', file=sys.stderr)
    with open(os.path.join(DATA, 'sources.csv'), newline='') as f:
        src = list(csv.DictReader(f))
    db.execute('create table source (id text primary key, name text, url text, licence_note text, retrieved text, ship text)')
    db.executemany('insert into source values (:id, :name, :url, :licence_note, :retrieved, :ship)', src)
    db.commit()
    if errors:
        sys.exit(f'{errors} implausible values: {a.out} is not usable')
    print(f'→ {a.out}', file=sys.stderr)


if __name__ == '__main__':
    main()
