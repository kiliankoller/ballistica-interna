"""Builds data/powder_aliases.csv: every powder name spelling found in the local load data (Sierra, Barnes,
Hornady, Vihtavuori, Sax, Hodgdon, Ramshot) mapped to maker and product name as powder databases use them
("A 2520" → Accurate 2520, "RE 15" → Alliant Reloder 15, "IMR 4451 End." → IMR 4451, "VIHT N-140" →
Vihtavuori N140). Product names only, no powder values.

  python3 tools/master-data/powder_aliases.py --names <database with a propellant(mname, pname) table>

rule: exact (same name), name (same after removing maker words and punctuation), maker (maker prefix such as
"IMR", "A", "RE", "Win", "VIHT" resolved), similar (a variant with the same burn rate class, e.g. "H4831sc" →
H4831; to be confirmed).
"""
import argparse
import collections
import csv
import json
import os
import re
import sqlite3
import sys

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SOURCES = [
    ('sierra', 'fixtures/reference/sierra/sierra.db', 'select powder from charge'),
    ('barnes', 'fixtures/reference/barnes/barnes.db', 'select powder from charge'),
    ('hornady', 'fixtures/reference/hornady/hornady.db', 'select powder from charge union all select powder from basic_load'),
    ('vihtavuori', 'fixtures/reference/vihtavuori/vihtavuori.db', 'select powder from charge'),
    # load files in the format of parse_rs_guide.py: the "powder" of every load
    ('sax', 'fixtures/reference/sax.json', None),
    ('hodgdon', 'fixtures/reference/hodgdon.json', None),
    ('ramshot', 'fixtures/reference/ramshot.json', None),
]
# maker prefixes in load data → maker name
PREFIX = [(r'^(imr)\s*', 'IMR'), (r'^(aa|a|acc|accurate)\s*#?\s*(?=\d|no|lt|nitro|solo)', 'Accurate'),
          (r'^(re|rl|r|reloder)\s*-?\s*(?=\d|ts)', 'Alliant:Reloder '), (r'^(win|w)\s*(?=\d)', 'Winchester'),
          (r'^(viht|vv|vihtavuori)\s*', 'Vihtavuori'), (r'^(norma)\s*', 'Norma'), (r'^(hodgdon)\s*', 'Hodgdon'),
          (r'^(ramshot)\s*', 'Ramshot'), (r'^(alliant)\s*', 'Alliant'),
          (r'^(rottweil|rws)\s*', 'RWS-Rottweil'), (r'^(?=rs\s*\d)', 'ReloadSwiss')]


# spellings no rule can resolve (checked by hand against the makers' product names)
MANUAL = {
    'a2': ('Accurate', 'No 2'), 'a5': ('Accurate', 'No 5'), 'a7': ('Accurate', 'No 7'), 'a9': ('Accurate', 'No 9'),
    'univclays': ('Hodgdon', 'Universal'), 'universalclays': ('Hodgdon', 'Universal'),
    'exterminator': ('Ramshot', 'X-Terminator'), 'xterminator': ('Ramshot', 'X-Terminator'),
    'powerpro2000mr': ('Alliant', '2000-MR'), 'powerprovarmint': ('Alliant', 'Varmint'),
    'leverevolution': ('Hodgdon', 'LeverEvolution'), 'blc2': ('Hodgdon', 'BL-C2'),
    'lvr': ('Hodgdon', 'LeverEvolution'), 'suprform': ('Hodgdon', 'Superformance'),
    'swprecision': ('Shooters World', 'Precision (S062-02)'), 'swmatch': ('Shooters World', 'Match Rifle (D073-06)'),
    'swtacticalrifle': ('Shooters World', 'Tactical Rifle (D073-08)'), 'swlongrifle': ('Shooters World', 'Long Rifle (S065-01)'),
    'sw4350': ('Shooters World', 'SW4350 (S070-02)'), 'swarplus': ('Shooters World', 'AR Plus (D073-04)'),
    'staball65': ('Winchester', 'StaBall 6.5'), 'rsmagnum': ('Ramshot', 'Magnum'),
}


def norm(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())


def clean(name):
    """Name without maker in parentheses, recommendation marks and the Enduron suffix."""
    s = re.sub(r'\(.*?\)', ' ', name)
    s = re.sub(r'[*♦]', ' ', s)
    s = re.sub(r'\b(end\.?|enduron)\s*$', ' ', s, flags=re.I)
    return re.sub(r'\s+', ' ', s).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--names', required=True, help='database with a propellant(mname, pname) table')
    ap.add_argument('--out', default=os.path.join(ROOT, 'data', 'powder_aliases.csv'))
    a = ap.parse_args()
    db = sqlite3.connect(f'file:{a.names}?mode=ro', uri=True)
    known = sorted({(m, re.sub(r'\s*\(approx\.\)\s*$', '', p)) for m, p in db.execute('select mname, pname from propellant where coalesce(geloescht, 0) = 0')})
    known_set = set(known)
    by_name = collections.defaultdict(set)
    for m, p in known:
        by_name[norm(p)].add((m, p))
        by_name[norm(m + p)].add((m, p))
        if m == 'Accurate' and p.startswith('No '):
            by_name[norm('A No ' + p[3:])].add((m, p))
    counts = collections.Counter()
    seen_in = collections.defaultdict(set)
    for src, path, sql in SOURCES:
        full = os.path.join(ROOT, path)
        if not os.path.exists(full):
            continue
        names = [l['powder'] for l in json.load(open(full, encoding='utf-8'))] if sql is None else [p for (p,) in sqlite3.connect(full).execute(sql)]
        for p in names:
            counts[p] += 1
            seen_in[p].add(src)
    rows, missing = [], collections.Counter()
    for alias, n in counts.items():
        c = clean(alias)
        hit, rule = None, ''
        if (manual := MANUAL.get(norm(c))) and manual in known_set:
            hit, rule = manual, 'manual'
        elif (cand := by_name.get(norm(alias))) and len(cand) == 1:
            hit, rule = next(iter(cand)), 'exact'
        elif (cand := by_name.get(norm(c))) and len(cand) == 1:
            hit, rule = next(iter(cand)), 'name'
        else:
            for pat, maker in PREFIX:
                m = re.match(pat, c, re.I)
                if not m:
                    continue
                rest = c[m.end():]
                maker, _, prefix = maker.partition(':')
                options = [(mk, p) for mk, p in known if mk == maker and norm(p) in (norm(prefix + rest), norm(rest))]
                if len(options) == 1:
                    hit, rule = options[0], 'maker'
                break
        if not hit and (m := re.match(r'^(.*?\d)\s*s?sc$', c, re.I)):
            # short-cut variants (H4831sc, IMR 7828ssc): same powder in shorter grains
            if (cand := by_name.get(norm(m[1]))) and len(cand) == 1:
                hit, rule = next(iter(cand)), 'similar'
        if hit:
            rows.append(dict(alias=alias, mname=hit[0], pname=hit[1], rule=rule, uses=n, sources=' '.join(sorted(seen_in[alias]))))
        else:
            missing[alias] = n
    rows.sort(key=lambda r: (r['mname'], r['pname'], r['alias']))
    with open(a.out, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, ['alias', 'mname', 'pname', 'rule', 'uses', 'sources'], lineterminator='\n')
        w.writeheader()
        w.writerows(rows)
    total = sum(counts.values())
    mapped = sum(r['uses'] for r in rows)
    print(f'{len(rows)} of {len(counts)} spellings mapped, {mapped} of {total} charges ({mapped / total:.0%})', file=sys.stderr)
    print('most used unmapped:', missing.most_common(25), file=sys.stderr)


if __name__ == '__main__':
    main()
