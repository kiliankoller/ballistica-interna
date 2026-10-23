"""Reads the load data of Sax Munition (Übersicht Sax Ladedaten V1.0 open, 2014) into the load format of
parse_rs_guide.py, so that a measured set can be built from them
(fixtures/runs/<set>).

  python3 tools/reference-data/parse_sax.py [fixtures/sources/sax/sax_munition_ladedaten_2014.pdf]
      > fixtures/reference/sax.json

One row per load: caliber, bullet (g, gr, type, maker), primer, powder, cartridge length L6 (to the tip; a
second column for pointed tips), then the recommended, minimum and maximum charge, each with velocity and
pressure in bar, and the C.I.P. Pmax. Some minimum charges have velocity and pressure swapped in the source;
they are swapped back. The minimum and maximum charge are taken (the recommended one is mostly
the maximum). Sax gives no barrel length: the loads were measured to C.I.P., so the barrel of the C.I.P. test
barrel is taken from the Reload Swiss or Lovex data of the same caliber, else 600 mm (noted in "notes").
"""
import json
import os
import re
import subprocess
import sys

REF = os.path.join(os.path.dirname(__file__), '..', '..', 'fixtures', 'reference')
NUM = r'(\d+(?:,\d+)?)'
ROW = re.compile(
    r'^\s*(?P<cal>\S.*?)\s{2,}(?P<bg>\d+,\d+)\s+(?P<bgr>\d+,\d)\s+(?P<type>\S+)\s+(?P<maker>\S+)\s+'
    r'(?P<primer>\S.*?)\s{2,}(?P<powder>\S.*?)\s{2,}(?P<l6>\d+,\d+)(?:\s+(?P<l6b>\d+,\d+))?\s+'
    r'(?P<rg>\d+,\d+)\s+[\d,]+\s+(?P<rv>\d+)\s+\d+\s+(?P<rp>\d+)\s+'
    r'(?P<ng>\d+,\d+)\s+[\d,]+\s+(?P<nv>\d+)\s+(?P<np>\d+)\s+'
    r'(?P<xg>\d+,\d+)\s+[\d,]+\s+(?P<xv>\d+)\s+(?P<xp>\d+)\s+(?P<cip>\d+)\s*$')


def num(s):
    return float(s.replace(',', '.'))


def key(caliber):
    return re.sub(r'[^a-z0-9]', '', caliber.lower().replace('‐', '-'))


def test_barrels():
    """C.I.P. test barrel length per caliber from the Reload Swiss and Lovex loads (most frequent value)."""
    seen = {}
    for name in ('rs2025.json', 'lovex.json'):
        path = os.path.join(REF, name)
        if not os.path.exists(path):
            continue
        for load in json.load(open(path)):
            if load.get('barrel') and load['barrel'] >= 300:
                seen.setdefault(key(load['caliber']), []).append(load['barrel'])
    return {k: max(set(v), key=v.count) for k, v in seen.items()}


def powder_name(raw):
    """"Vihtavuori N530" → N530, "Norma 203B" → Norma 203B, "RS 60 / N EI-145" → RS 60."""
    raw = re.sub(r'\s+', ' ', raw.replace('‐', '-')).strip()
    raw = raw.split(' / ')[0]
    return re.sub(r'^Vihtavuori ', '', raw)


def main():
    pdf = sys.argv[1] if len(sys.argv) > 1 else 'fixtures/sources/sax/sax_munition_ladedaten_2014.pdf'
    text = subprocess.run(['pdftotext', '-layout', pdf, '-'], capture_output=True, text=True).stdout
    barrels = test_barrels()
    loads, skipped = [], 0
    for i, line in enumerate(text.splitlines()):
        m = ROW.match(line)
        if not m:
            if re.search(r'\sSax\s', line) and 'Übersicht' not in line:
                skipped += 1
            continue
        cal = m['cal'].replace('‐', '-').strip()
        barrel = barrels.get(key(cal))
        notes = [] if barrel else ['barrel: C.I.P. standard 600 mm assumed']
        nv, np_ = float(m['nv']), float(m['np'])
        if nv > 2000 > np_:
            # some minimum charges have velocity and pressure swapped in the source
            nv, np_ = np_, nv
            notes.append('minimum charge: velocity and pressure swapped in the source, corrected')
        loads.append(dict(
            caliber=cal, grains=num(m['bgr']), bulletMaker='Sax', bulletType=m['type'].replace('‐', '-'),
            caseMaker='', powder=powder_name(m['powder']),
            min=dict(g=num(m['ng']), v=nv, p=np_, fill=None),
            max=dict(g=num(m['xg']), v=float(m['xv']), p=float(m['xp']), fill=None),
            barrel=barrel or 600.0, twist=None, col=num(m['l6']), notes='; '.join(notes), line=i))
    json.dump(loads, sys.stdout, indent=1, ensure_ascii=False)
    print(f'{len(loads)} loads, {skipped} rows not read', file=sys.stderr)


if __name__ == '__main__':
    main()
