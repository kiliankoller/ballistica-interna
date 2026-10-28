"""Builds the master data CSVs (data/calibers.csv, data/bullets.csv, data/powders.csv) from the local source data
in fixtures/ (see fixtures/README.md). Only sources marked ship=yes in data/sources.csv are used. Column names
follow the C.I.P. designations (and so the field names the app already reads); every row names its source.

  python3 tools/master-data/build_csv.py

Calibers: C.I.P. Tab I–IV (centre-fire rifle and handgun), cartridge maximum dimensions as L1 … H2, G1, chamber
minimum dimensions and barrel as c_*. The case capacity V (grains of water) is not part of the C.I.P. tables: derived
from the fill ratios of the Reload Swiss load data guide where it has enough loads, else estimated from the outline (V_source).
Bullets: maker data (Styria Arms AERO price list; Berger, Nosler, Hornady, Sierra, Barnes, Speer), lengths from
the maker or else from the JBM length list, checked and flagged by merge_bullets.py; the report goes to
logs/bullet-report.md.
Powders: datasheet values (Qex, bulk density) and own fitted burn values (the shipped fits of data/fits-shipped.json: Reload
Swiss, Lovex, Norma and Rottweil (Sax's loads), Hodgdon, IMR, Winchester and Ramshot with measured pressure,
Vihtavuori with its own velocities together with Sax's measured pressures). The measured sets are built from the
master data's components (local/scripts/make-set.ts), so the fit uses the case capacities the app uses. Makers without a datasheet: the
fitted Qex and a bulk density estimated from compressed loads (scripts/estimate-bulk-density.ts), marked in
fit_status. Rifle powders only (handgun powders are left out until the model is better for handguns).
"""
import argparse
import collections
import csv
import glob
import json
import os
import re
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(__file__))
import merge_bullets  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
DATA = os.path.join(ROOT, 'data')
FIX = os.path.join(ROOT, 'fixtures')

CALIBER_COLUMNS = ['cipname', 'altname', 'tab', 'country', 'cipdate', 'ciprevdate',
                   'L1', 'L2', 'L3', 'L6', 'L3G', 'R', 'R1', 'E', 'E1', 'P1', 'P2', 'alpha', 'H1', 'H2', 'G1',
                   'Pmax', 'PK', 'PE', 'EE', 'M',
                   'c_L3', 'c_P1', 'c_P2', 'c_H1', 'c_H2', 'c_G1', 'c_G', 'c_alpha1', 'c_F', 'c_Z', 'c_Q', 'c_N',
                   'c_b_', 'c_u_', 'V', 'V_source', 'source']
BULLET_COLUMNS = ['mname', 'pname', 'caliber', 'gdia', 'gmass', 'glen', 'gtip', 'gdepthmax', 'g1bc', 'g7bc',
                  'gtailtype', 'gtailh', 'gtaildiaA', 'gtaildiaB', 'note', 'source',
                  'part_number', 'product_line', 'gdia_in', 'glen_in', 'length_source', 'url', 'retrieved', 'flags']
POWDER_COLUMNS = ['mname', 'pname', 'Ba', 'Qex', 'k', 'a0', 'a1', 'z1', 'z2', 'pc', 'pcd', 'pt', 'tcc', 'tch',
                  'fit_status', 'fit_score', 'fit_loads', 'source']


def shipping():
    with open(os.path.join(DATA, 'sources.csv'), newline='', encoding='utf-8') as f:
        return {r['id'] for r in csv.DictReader(f) if r['ship'].strip().lower() == 'yes'}


def fmt(v):
    if v is None:
        return ''
    if isinstance(v, float):
        return f'{v:.6g}'
    return str(v)


def write(name, columns, rows):
    rows.sort(key=lambda r: [str(r.get(c, '')) for c in columns[:3]])
    with open(os.path.join(DATA, name), 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, columns, extrasaction='ignore', lineterminator='\n')
        w.writeheader()
        for r in rows:
            w.writerow({c: fmt(r.get(c)) for c in columns})
    print(f'{name}: {len(rows)} rows', file=sys.stderr)


# Calibers whose derived capacity is not used: the guide's fill ratios do not follow the seating of the bullets.
# 7 mm-08 Rem.: every bullet gives the same combustion chamber of about 42 grains, although the seated volumes of
# the three bullets differ by 2.8 grains, so the derived capacity goes from 50.2 to 54.0 grains with the bullet
# (51.1 median; the case is the .308 Win. case necked down, 55.8 derived). Checked 2026-10-24 (#8).
REJECTED_DERIVED = {'7 mm - 08 Rem.'}


def reload_swiss_capacities():
    """{C.I.P. name: grains of water} derived from the fill ratios of the Reload Swiss load data guide 2025 (charge,
    bulk density, fill ratio and the seated bullet of the master data; local/scripts/derive-capacity.ts), calibers with
    at least 4 charges, without REJECTED_DERIVED. Without that file the build stops: falling back to the outline
    estimate would silently change the capacities of data/calibers.csv."""
    path = os.path.join(FIX, 'calibration', 'capacity-rs.json')
    if not os.path.exists(path):
        sys.exit(f'{path} missing: run local/scripts/derive-capacity.ts first (docs/MODEL.md#case-capacity)')
    with open(path, encoding='utf-8') as f:
        derived = json.load(f)
    return {k.split(' (')[0]: v['capacity_gr'] for k, v in derived.items()
            if v['charges'] >= 4 and k.split(' (')[0] not in REJECTED_DERIVED}


def calibers():
    db = sqlite3.connect(os.path.join(FIX, 'cip', 'cip.db'))
    rs_capacities = reload_swiss_capacities()
    rows, skipped = [], []
    for cid, tab, name, alt, country, created, revised, ptmax, pk, pe, ee, m in db.execute(
            'select id, tab, name, alt_names, country, created, revised, ptmax, pk, pe, ee, m from cartridge '
            'where tab in (1, 2, 3, 4) and text_ok = 1'):
        r = dict(cipname=name, altname=alt, tab=tab, country=country, cipdate=created, ciprevdate=revised,
                 Pmax=ptmax, PK=pk, PE=pe, EE=ee, M=m, source='cip-tdcc')
        for side, key, value, number in db.execute('select side, name, value, number from dimension where cartridge_id = ? and number is not null', (cid,)):
            col = key.replace('L3+G', 'L3G').replace(' ', '').replace('α', 'alpha').replace('β', 'beta').replace('δ', 'delta')
            col = col if side == 'cartridge' else ('c_' + col + ('_' if col in ('b', 'u') else ''))
            # the sheet layout sometimes puts an angle next to a dimension: angles only in angle columns
            if ('°' in value) != ('alpha' in col or 'beta' in col or 'delta' in col):
                continue
            if col in CALIBER_COLUMNS and col not in r:
                r[col] = number
        if all(r.get(k) for k in ('L3', 'L6', 'G1', 'Pmax')):
            derived = rs_capacities.get(name)
            if derived:
                r['V'], r['V_source'] = derived, 'reload-swiss-fill'
                r['source'] += '; reload-swiss-guide-2025'
            else:
                v = capacity_estimate(r)
                r['V'], r['V_source'] = (round(v * capacity_factor(r), 1), 'estimate') if v else (None, '')
            rows.append(r)
        else:
            skipped.append(name)
    db.close()
    print(f'calibers left out (sheet without L3, L6, G1 or Pmax): {len(skipped)}', file=sys.stderr)
    return rows


GRAINS_PER_CM3 = 1 / 0.0647989  # water
# The outline estimate is about 3.5 % larger than the capacities derived from Reload Swiss's fill ratios (35 rifle
# calibers); one factor removes that (leave-one-out over the calibers: rms 4.5 → 3.0 %; 2026-10-23). It is applied to
# rifle calibers only: for the handgun calibers (C.I.P. Tab. IV) no derived capacity checks it (decided 2026-10-24,
# docs/MODEL.md#case-capacity).
CAPACITY_FACTOR = 0.966
HANDGUN_TAB = '4'


def capacity_factor(r):
    """CAPACITY_FACTOR for rifle calibers, 1 for handgun calibers (C.I.P. Tab. IV)."""
    return 1 if str(r.get('tab')) == HANDGUN_TAB else CAPACITY_FACTOR


def capacity_estimate(r):
    """Case capacity in grains of water from the C.I.P. cartridge outline, or None. Outline: P1 at the head,
    P2 at the shoulder (L1), H1 at the neck (L2), H2 at the mouth (L3); a straight case runs from P1 to H2.
    Inside: a solid head of 9 % of the case length for bottleneck cases (2 … 5.5 mm) and 20 % for straight
    (handgun) cases (2 … 5 mm), and a wall that thins from 0.6 mm (bottleneck) or 0.5 mm (straight) above the
    head to the neck wall (H2 − G1) / 2 at the mouth. Typical values of brass cases, not fitted to any database;
    the result is marked as an estimate."""
    f = lambda k: float(r[k]) if r.get(k) not in (None, '') else None  # noqa: E731
    L1, L2, L3, P1, P2, H1, H2, G1 = (f(k) for k in ('L1', 'L2', 'L3', 'P1', 'P2', 'H1', 'H2', 'G1'))
    if not (L3 and P1 and G1):
        return None
    H2 = H2 or H1 or P1
    if not (L1 and P2) and L2 and H1 and H1 < P1 - 1 and L2 < L3:
        # some old sheets give the neck but not the shoulder: shoulder 3 mm before the neck, slight body taper
        L1, P2 = L2 - 3.0, P1 - 0.3
    bottleneck = bool(L1 and L2 and P2 and H1 and L1 < L2 < L3)
    outline = [(0.0, P1), (L1, P2), (L2, H1), (L3, H2)] if bottleneck else [(0.0, P1), (L3, H2)]
    web = min(max(0.09 * L3, 2.0), 5.5) if bottleneck else min(max(0.20 * L3, 2.0), 5.0)
    t_base, t_mouth = (0.6 if bottleneck else 0.5), max((H2 - G1) / 2, 0.15)
    def outside(x):
        for (x0, d0), (x1, d1) in zip(outline, outline[1:]):
            if x0 <= x <= x1:
                return d0 + (d1 - d0) * (x - x0) / (x1 - x0)
        return outline[-1][1]
    steps, vol = 400, 0.0
    dx = (L3 - web) / steps
    for i in range(steps):
        x = web + (i + 0.5) * dx
        t = t_base + (t_mouth - t_base) * (x - web) / (L3 - web)
        d = outside(x) - 2 * t
        if d > 0:
            vol += 3.141592653589793 / 4 * d * d * dx
    return round(vol / 1000 * GRAINS_PER_CM3, 1)


def bullets():
    db = sqlite3.connect(os.path.join(FIX, 'open-db', 'components.db'))
    rows = []
    styria = list(db.execute(
            'select maker, model, type, diameter_in, diameter_mm, weight_gr, length_mm, tip_mm, smax_mm, bc_g1, twist_note, hollow '
            "from bullet where source = 'Styria Arms AERO price list'"))
    db.close()
    # the price list has some bullets twice under the same model, type and weight: the SB with a hollow point of
    # 1.5 or 2 mm diameter, the SOLR with a short (magazine) or long tip; the name says which
    same = collections.Counter((r[1], r[2], r[4], r[5]) for r in styria)
    for mname, model, btype, din, dmm, gr, length, tip, smax, bc, note, hollow in styria:
        pname = f'{model} {btype} {gr:g} gr'.replace('  ', ' ')
        if same[(model, btype, dmm, gr)] > 1:
            pname += f" HP {hollow.split('/')[1].replace(',', '.')}" if hollow else f' tip {tip:.1f}'
        rows.append(dict(mname=mname, pname=pname, caliber=f'.{round(din * 1000):03d}',
                         gdia=dmm, gmass=gr, glen=length, gtip=tip, gdepthmax=smax, g1bc=bc, gtailtype=0,
                         note=re.sub(r'(\s*\b\d+\b)+\s*$', '', note or '').strip(), source='styria-arms-aero',
                         gdia_in=din, glen_in=round(length / 25.4, 3) if length else None,
                         length_source='maker' if length else None, retrieved='2026-10-19', flags=''))
    makers, jbm = merge_bullets.load(os.path.join(FIX, 'open-db', 'components.db'))
    merged, conflicts = merge_bullets.merge(makers, jbm)
    correct_bullets(merged)
    tell_apart(merged)
    for line in merge_bullets.report(merged, conflicts, os.path.join(ROOT, 'logs', 'bullet-report.md')):
        print(line, file=sys.stderr)
    return rows + merged


def tell_apart(rows):
    """Bullets of one maker that share name and diameter (Nosler's "30 Cal 150 gr Spitzer" is a Partition, an
    AccuBond and an E-Tip of different lengths): the name gets the product line where that differs, else the part
    number."""
    same = collections.defaultdict(list)
    for r in rows:
        same[(r['mname'], r['pname'], r['gdia'])].append(r)
    for group in same.values():
        if len(group) < 2:
            continue
        lines = {r.get('product_line') or '' for r in group}
        for r in group:
            line = r.get('product_line') or ''
            if len(lines) == len(group) and line and line.lower() not in r['pname'].lower():
                r['pname'] = f"{r['pname']} {line}"
            elif r.get('part_number'):
                r['pname'] = f"{r['pname']} #{r['part_number'].split(' / ')[0]}"


def correct_bullets(rows):
    """Applies data/bullet_corrections.csv: errors of a maker's page, checked against other sources (each line names
    its evidence). A corrected row gets the flag `corrected`; its implausible_* flags are checked again."""
    with open(os.path.join(DATA, 'bullet_corrections.csv'), newline='', encoding='utf-8') as f:
        fixes = list(csv.DictReader(f))
    for r in rows:
        mine = [x for x in fixes if x['maker'] == r['mname'] and x['part_number'] == str(r.get('part_number') or '')]
        if not mine:
            continue
        for x in mine:
            r[x['field']] = float(x['value']) if x['field'] in ('gmass', 'glen', 'gdia', 'g1bc', 'g7bc') else x['value']
        flags = [fl for fl in str(r.get('flags') or '').split() if not fl.startswith('implausible')]
        check = dict(diameter_in=r['gdia_in'], weight_gr=r['gmass'], length_in=r.get('glen_in'), bc_g1=r.get('g1bc') or None,
                     bc_g7=r.get('g7bc') or None)
        r['flags'] = ' '.join(flags + merge_bullets.plausibility(check) + ['corrected'])


# measured set → maker → (what the fit rests on, datasheet source, load data source)
FIT_SETS = {
    'rs': {'ReloadSwiss': ('pressure and velocity measured', 'reload-swiss-products', None),
           'Reload Swiss': ('pressure and velocity measured', 'reload-swiss-products', None)},
    # Vihtavuori's velocities together with Sax's measured pressures (decision 2026-10-23)
    'v-vihtavuori+sax': {'Vihtavuori': ('velocity measured (Vihtavuori), pressure and velocity measured (Sax)',
                                        'vihtavuori-guide-2026', 'sax-load-data-2014')},
    # Lovex: pressure of the maximum loads only; no Qex published, so it is fitted (decision 2026-10-25)
    'lovex': {'Lovex': ('pressure and velocity measured (maximum loads), Qex fitted', 'explosia-catalogue-2023',
                        'lovex-guide-2019')},
    'sax': {'Norma': ('pressure and velocity measured (Sax)', 'norma-products', 'sax-load-data-2014'),
            'RWS-Rottweil': ('pressure and velocity measured (Sax)', None, 'sax-load-data-2014'),
            'Rottweil': ('pressure and velocity measured (Sax)', None, 'sax-load-data-2014')},
}
# Hodgdon, IMR, Winchester and Ramshot are fitted locally as a check only: their terms forbid using the load data
# in apps or derived works (decided 2026-10-20), so they are not listed here.
# datasheet documents (powder_datasheet.source) other than the set's own → source id
SHEET_DOCUMENTS = {'Vihtavuori industrial powders brochure 2022': 'vihtavuori-ip-brochure-2022',
                   'Explosia propellants catalogue 2023': 'explosia-catalogue-2023'}
# makers of the sets fitted before the fits named their maker
LEGACY_MAKER = {'rs': 'Reload Swiss', 'v-vihtavuori': 'Vihtavuori', 'lovex': 'Lovex'}
# makers without a datasheet: the fit's own Qex; the bulk density estimated from compressed loads, else a typical
# value (it sets the fill ratio only), both marked in fit_status
NO_DATASHEET_MAKERS = {'RWS-Rottweil', 'Rottweil'}
TYPICAL_BULK_DENSITY = 950
# maker names as the master data shows them (the measured sets use the component database's spelling)
DISPLAY_MAKER = {'RWS-Rottweil': 'Rottweil', 'ReloadSwiss': 'Reload Swiss'}


def newest_fits():
    """{set: {powder: fitted values}}: the shipped fits, read from data/fits-shipped.json. Written by hand from a
    fit in fixtures/calibration (its file name is kept in `source`), so a test run never reaches the master data.
    Refit: run fit-powders, then copy the fitted values of the approved fit into that file and rebuild."""
    with open(os.path.join(ROOT, 'data', 'fits-shipped.json'), encoding='utf-8') as f:
        return json.load(f)['fits']


def estimated_bulk():
    """{(maker, name): kg/m³} of the reliable estimates of scripts/estimate-bulk-density.ts."""
    path = os.path.join(FIX, 'calibration', 'bulk-density.json')
    if not os.path.exists(path):
        return {}
    with open(path, encoding='utf-8') as f:
        estimates = json.load(f)
    return {(v['maker'], v['name'].replace(' ', '')): v['bulkDensity'] for v in estimates.values() if v.get('reliable')}


def powders():
    db = sqlite3.connect(os.path.join(FIX, 'open-db', 'components.db'))
    sheet = {(m.replace(' ', ''), n): (q, b, kind) for m, n, q, b, kind in db.execute('select maker, name, qex_j_g, bulk_density_g_l, kind from powder_datasheet')}
    sheet_doc = {(m.replace(' ', ''), n): src for m, n, src in db.execute('select maker, name, source from powder_datasheet')}
    db.close()
    estimated = estimated_bulk()
    rows = []
    for set_, fitted in newest_fits().items():
        for name, v in sorted(fitted.items()):
            maker = v.get('maker') or LEGACY_MAKER[set_]
            if maker not in FIT_SETS[set_]:
                continue  # another maker's powder in the set (e.g. Vihtavuori in Sax's data): checked only
            basis, sheet_source, load_source = FIT_SETS[set_][maker]
            q, bulk, kind = sheet.get((maker.replace(' ', ''), name), (None, None, ''))
            notes = [v['note']] if v.get('note') else []  # a remark on the fit kept in the manifest
            if not kind:
                kind = 'rifle' if v.get('handgun_share', 1) < 0.5 else 'handgun'
            if kind not in ('langwaffen', 'rifle'):
                continue  # handgun powders: not yet
            if not bulk and (maker, name) in estimated:
                bulk = estimated[(maker, name)]
                notes.append('bulk density estimated from compressed loads')
            if not bulk and maker in NO_DATASHEET_MAKERS:
                bulk = TYPICAL_BULK_DENSITY
                notes.append(f'bulk density not published: typical value {TYPICAL_BULK_DENSITY} kg/m³, fill ratio uncertain')
            if not bulk:
                continue  # the bulk density is needed for the fill ratio
            # a powder whose characteristics come from another document of the maker than the set's datasheet
            sheet_source = SHEET_DOCUMENTS.get(sheet_doc.get((maker.replace(' ', ''), name)), sheet_source)
            sources = [s for s in (sheet_source, load_source, 'ballisticainterna-fit') if s]
            rows.append(dict(mname=DISPLAY_MAKER.get(maker, maker), pname=name, Ba=v['Ba'], Qex=(q or v['Qex'] / 1e3), k=v['kappa'], a0=v['a0'], a1=0,
                             z1=v['z1'], z2=v['z2'], pc=v['materialDensity'], pcd=bulk, pt=21, tcc=0, tch=0,
                             fit_status='; '.join([f'fitted: {basis}'] + notes), fit_score=v['score_check'],
                             fit_loads=v['loads_fit'] + v['loads_check'], source='; '.join(sources)))
    return rows


def main():
    argparse.ArgumentParser(description=__doc__.split('\n')[0]).parse_args()
    ship = shipping()
    for name, columns, rows in (('calibers.csv', CALIBER_COLUMNS, calibers()),
                                ('bullets.csv', BULLET_COLUMNS, bullets()),
                                ('powders.csv', POWDER_COLUMNS, powders())):
        rows = [r for r in rows if all(s.strip() in ship for s in r['source'].split(';'))]
        write(name, columns, rows)


if __name__ == '__main__':
    main()
