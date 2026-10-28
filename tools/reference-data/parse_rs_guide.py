"""Reads the laboratory load tables of the Reload Swiss load data guide (text of the PDF, `pdftotext -layout`)
into JSON: one record per load with the minimum and maximum charge, their measured velocity and pressure.
The "customer reloading data" section at the end of the guide is not read (not laboratory measurements).

  pdftotext -layout guide.pdf guide.txt
  python3 tools/reference-data/parse_rs_guide.py guide.txt > fixtures/reference/rs.json
"""
import json
import re
import sys

NUM = r'(-|\d+(?:,\d+)?)'
ROW = re.compile(
    r'^\s*(?P<cal>\S.*?)\s{2,}(?P<gr>\d+(?:,\d+)?)\s{2,}(?P<mid>.*?)\s{2,}(?P<pw>RS\s?\d+)\s+'
    + r'\s+'.join([NUM] * 11)
    + r'\s+(?P<barrel>\d+|n\.a\.)\s*(?:\((?P<twist>[^)]*)\))?\s+(?P<col>\d+(?:,\d+)?|n\.a\.)\s*(?P<notes>.*)$')


def number(text):
    return None if text in ('-', 'n.a.') else float(text.replace(',', '.'))


def parse(lines):
    loads = []
    for k, line in enumerate(lines):
        if 'Kundenladedaten' in line and 'Customer Reloading Data' in line:  # customer data from here on
            break
        m = ROW.match(line)
        if not m:
            continue
        g = m.groups()
        v = [number(x) for x in g[4:15]]
        mid = re.split(r'\s{2,}', m['mid'].strip())
        # mid: [type ...] bullet maker, case maker, primer; the type may also stand on the lines around
        neighbours = lines[max(k - 1, 0):k] + lines[k + 1:k + 2]
        around = ' '.join(s.strip() for s in neighbours if s.strip() and not ROW.match(s))
        loads.append(dict(
            caliber=m['cal'].strip(), grains=number(m['gr']),
            bulletMaker=mid[-3] if len(mid) >= 3 else '', bulletType=' '.join(mid[:-3] + [around]).strip(),
            caseMaker=mid[-2] if len(mid) >= 2 else '', primer=mid[-1],
            powder=m['pw'].replace(' ', ''),
            min=dict(g=v[0], v=v[2], p=v[3], fill=v[4]), max=dict(g=v[5], v=v[7], p=v[8], fill=v[9]),
            barrel=number(m['barrel']), twist=m['twist'], col=number(m['col']), notes=m['notes'].strip(),
            line=k + 1))
    return loads


if __name__ == '__main__':
    loads = parse(open(sys.argv[1], encoding='utf-8').read().split('\n'))
    json.dump(loads, sys.stdout, indent=1, ensure_ascii=False)
    print(f'{len(loads)} loads', file=sys.stderr)
