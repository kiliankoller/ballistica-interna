"""Merges the maker bullet data (components.db maker_bullet) with the JBM length list (jbm_length) into rows of
data/bullets.csv, checks them and writes a report. Used by build_csv.py.

Rules:
- Key: maker + part number. Item numbers of the same bullet in other box sizes (Sierra 1744 / 1744C) become
  one row with all numbers.
- Length: the maker's own value wins (length_source=maker); otherwise the JBM length of the matching bullet
  (length_source=jbm, or jbm-litz for a Bryan Litz measurement); otherwise empty with flag length_missing.
  Never estimated.
- JBM match (JBM has no part numbers): same maker, diameter within 0.002", same weight, no other nose type
  (hollow point, soft point, FMJ, round or flat nose, spitzer, hollow cavity), no other line name (names sharing
  only generic words, each with a word of its own: Oryx against Alaska), then the normalised type name
  (bullet_sources.type_key) decides. Several equally good candidates with lengths more than 3 % apart:
  flag length_ambiguous, no length. Candidates whose names share no word with the maker's: no match
  (jbm_no_match), not even a single one.
- Maker and JBM both give a length and differ by more than 3 %: flag length_conflict, both values in the
  report. Barnes pages that state two lengths for one item (pages_disagree): the one JBM confirms is kept,
  flag maker_pages_disagree; without confirmation the specsJson value is kept and length_conflict is set.
- Plausibility: length / diameter (rifle and handgun 0.9 … 6.5), sectional density 0.07 … 0.50, G1 BC
  0.03 … 1.2 and G7 below G1; outliers flagged, not removed.
"""
import os
import re
import sqlite3
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'reference-data'))
from bullet_sources import INCH_MM, type_key  # noqa: E402

DIA_TOLERANCE = 0.002  # JBM rounds (.355 / .356); .355 and .357, .308 and .311 are different bullets
# words naming the nose of a bullet (after type_key)
NOSE_TYPES = {'hp', 'sp', 'fmj', 'rn', 'fn', 'fp', 'spitzer', 'hc'}
# words every maker uses; two names sharing only these, each with a line name of its own (Oryx against Alaska,
# V-Crown against Sports Master), name different bullets
GENERIC = NOSE_TYPES | {'bt', 'fb', 'jacketed', 'wc', 'tip', 'bonded', 'match', 'point', 'nose', 'hollow', 'soft'}
# diameters JBM gives rounded
JBM_DIAMETER = {0.2: 0.204}
CONFLICT = 0.03  # accepted deviation between sources (decided 2026-10-20)


def _rel(a, b):
    return abs(a - b) / max(a, b)


def score(name, description, maker=None):
    """Word overlap (Jaccard) of the normalised type names."""
    a, b = set(type_key(name, maker).split()), set(type_key(description, maker).split())
    return len(a & b) / len(a | b) if a | b else 0.0


def jbm_match(bullet, jbm):
    """(length_in, source, flags, candidates) of the JBM bullet matching a maker bullet."""
    cands = [j for j in jbm.get(bullet['maker'], ()) if abs(j['diameter_in'] - bullet['diameter_in']) <= DIA_TOLERANCE
             and abs(j['weight_gr'] - bullet['weight_gr']) < 0.51]
    if not cands:
        return None, None, [], []
    name = f'{bullet.get("product_line") or ""} {bullet.get("name") or ""}'
    # a candidate of another nose type (hollow point against soft point, spitzer against round nose) is another bullet
    mine = NOSE_TYPES & set(type_key(name, bullet['maker']).split())
    cands = [j for j in cands if not (mine and (other := NOSE_TYPES & set(type_key(j['description'], bullet['maker']).split()))
                                      and not mine & other)]
    words = set(type_key(name, bullet['maker']).split())
    cands = [j for j in cands if (words & (w := set(type_key(j['description'], bullet['maker']).split()))) - GENERIC
             or not (words - GENERIC and w - GENERIC)]
    if not cands:
        return None, None, ['jbm_no_match'], []
    scored = sorted(((score(name, j['description'], bullet['maker']), j) for j in cands), key=lambda s: -s[0])
    best = scored[0][0]
    top = [j for s, j in scored if s == best]
    with_length = [j for j in top if j['length_in']]
    flags = []
    if best == 0:  # no common word: even a single candidate may be another bullet of that weight
        return None, None, ['jbm_no_match'], cands
    if not with_length:
        return None, None, flags, top
    lengths = [j['length_in'] for j in with_length]
    if max(lengths) / min(lengths) - 1 > CONFLICT:
        return None, None, flags + ['length_ambiguous'], with_length
    j = next((j for j in with_length if not j['measured_by']), with_length[0])  # the maker figure before Litz
    return j['length_in'], 'jbm-litz' if j['measured_by'] else 'jbm', flags, with_length


def plausibility(r):
    flags = []
    d, w, l, g1, g7 = r['diameter_in'], r['weight_gr'], r.get('length_in'), r.get('bc_g1'), r.get('bc_g7')
    if l and not 0.9 <= l / d <= 6.5:
        flags.append('implausible_length')
    if not 0.07 <= w / 7000 / (d * d) <= 0.50:
        flags.append('implausible_weight')
    if g1 is not None and not 0.03 <= g1 <= 1.2:
        flags.append('implausible_bc')
    if g1 and g7 and g7 >= g1:
        flags.append('implausible_bc')
    return flags


def load(db_path):
    db = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row
    makers = [dict(r) for r in db.execute('select * from maker_bullet order by maker, part_number')]
    jbm = {}
    for r in db.execute('select * from jbm_length'):
        r = dict(r)
        r['diameter_in'] = JBM_DIAMETER.get(r['diameter_in'], r['diameter_in'])
        jbm.setdefault(r['maker'], []).append(r)
    return makers, jbm


def collapse(rows):
    """One row per bullet: item numbers that differ only in box size are joined."""
    out = {}
    for r in rows:
        k = (r['maker'], r['name'], r['diameter_in'], r['weight_gr'], r['length_in'], r['bc_g1'], r['bc_g7'])
        if k in out:
            out[k]['part_number'] += ' / ' + r['part_number']
        else:
            out[k] = dict(r)
    return list(out.values())


def merge(makers, jbm):
    """(csv rows, report dict)"""
    rows, conflicts = [], []
    for b in collapse(makers):
        flags, note = [], b.get('note') or ''
        j_len, j_src, j_flags, cands = jbm_match(b, jbm)
        length, source = b['length_in'], 'maker' if b['length_in'] else None
        alt = re.search(r'pages_disagree length_in ([\d.]+)', note)
        if length and alt and j_len:
            other = float(alt[1])
            if _rel(other, j_len) <= CONFLICT < _rel(length, j_len):
                length = other
            flags.append('maker_pages_disagree')
        if length and j_len and _rel(length, j_len) > CONFLICT:
            flags.append('length_conflict')
            conflicts.append((b, length, j_len, j_src))
        elif length and alt and not j_len:
            flags.append('length_conflict')
            conflicts.append((b, length, float(alt[1]), 'maker page'))
        if not length:
            flags += j_flags
            if j_len:
                length, source = j_len, j_src
            elif 'length_ambiguous' not in flags:
                flags.append('length_missing')
        if b.get('note') and 'weight_from_sd' in b['note']:
            flags.append('weight_from_sd')
        b2 = dict(b, length_in=length)
        flags += plausibility(b2)
        d = b['diameter_in']
        rows.append(dict(
            mname=b['maker'], pname=b['name'], caliber=f'.{round(d * 1000):03d}', gdia=round(d * INCH_MM, 3),
            gmass=b['weight_gr'], glen=round(length * INCH_MM, 2) if length else None,
            gtip=round(b['nose_in'] * INCH_MM, 2) if b.get('nose_in') else None,
            g1bc=b['bc_g1'], g7bc=b['bc_g7'],
            gtailh=round(b['boattail_in'] * INCH_MM, 2) if b.get('boattail_in') else None,
            note=twist_note(b), source=b['source'] + ('; jbm-lengths' if source and source.startswith('jbm') else ''),
            part_number=b['part_number'], product_line=b.get('product_line'), gdia_in=d, glen_in=length,
            length_source=source, url=b['url'], retrieved=b['retrieved'], flags=' '.join(sorted(set(flags)))))
    return rows, conflicts


def twist_note(b):
    return f'min. twist 1:{b["twist_min_in"]:g}"' if b.get('twist_min_in') else None


def report(rows, conflicts, path):
    """Writes the report (Markdown) and returns its summary lines."""
    makers = sorted({r['mname'] for r in rows if r.get('part_number')})
    lines = ['# Bullet master data report', '', f'{sum(1 for r in rows if r.get("part_number"))} maker bullets '
             f'({sum(1 for r in rows if not r.get("part_number"))} other rows)', '',
             '| maker | bullets | length: maker | length: JBM | missing | ambiguous | conflicts | implausible |',
             '|---|---|---|---|---|---|---|---|']
    for m in makers:
        rs = [r for r in rows if r['mname'] == m]
        f = lambda flag: sum(flag in r['flags'].split() for r in rs)  # noqa: E731
        lines.append(f'| {m} | {len(rs)} | {sum(r["length_source"] == "maker" for r in rs)} | '
                     f'{sum((r["length_source"] or "").startswith("jbm") for r in rs)} | {f("length_missing")} | '
                     f'{f("length_ambiguous")} | {f("length_conflict")} | '
                     f'{sum(any(x.startswith("implausible") for x in r["flags"].split()) for r in rs)} |')
    summary = lines[2:]
    lines += ['', '## Length conflicts (> 3 %)', '', '| maker | part number | bullet | kept (in) | other (in) | other source |',
              '|---|---|---|---|---|---|']
    for b, kept, other, src in conflicts:
        lines.append(f'| {b["maker"]} | {b["part_number"]} | {b["name"]} | {kept} | {other} | {src} |')
    for title, flag in (('Missing lengths', 'length_missing'), ('Ambiguous JBM matches', 'length_ambiguous'),
                        ('Implausible values', 'implausible')):
        lines += ['', f'## {title}', '', '| maker | part number | bullet | flags |', '|---|---|---|---|']
        lines += [f'| {r["mname"]} | {r["part_number"]} | {r["pname"]} | {r["flags"]} |' for r in rows
                  if any(x.startswith(flag) for x in r['flags'].split())]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        f.write('\n'.join(lines) + '\n')
    return summary
