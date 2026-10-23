"""Shared helpers of the bullet master-data importers (parse_jbm_lengths.py, parse_*_bullets.py): a cache for
fetched pages (each page is fetched once with polite.fetch and read from the cache afterwards), unit
conversion, the normalised type name used to match bullets between sources, and the tables in the local
component database (fixtures/open-db/components.db).

Tables (rows of one source are replaced on every run):
  maker_bullet(maker, product_line, name, part_number, diameter_in, weight_gr, length_in, bc_g1, bc_g7,
               ogive_in (base to ogive), nose_in, bearing_in, boattail_in, twist_min_in, note, url, retrieved, source)
      base data as published by the maker; length_in only where the maker publishes it
  jbm_length(maker, diameter_in, weight_gr, description, length_in, tip_in, measured_by, url, retrieved)
      JBM bullet length list
"""
import datetime
import html
import os
import re
import sqlite3

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
FIX = os.path.join(ROOT, 'fixtures')
COMPONENTS_DB = os.path.join(FIX, 'open-db', 'components.db')
GRAIN_G = 0.06479891
INCH_MM = 25.4

MAKER_BULLET_COLUMNS = ['maker', 'product_line', 'name', 'part_number', 'diameter_in', 'weight_gr', 'length_in',
                        'bc_g1', 'bc_g7', 'ogive_in', 'nose_in', 'bearing_in', 'boattail_in', 'twist_min_in', 'note', 'url',
                        'retrieved', 'source']
JBM_COLUMNS = ['maker', 'diameter_in', 'weight_gr', 'description', 'length_in', 'tip_in', 'measured_by', 'url',
               'retrieved']


def cached(url, path, refresh=False, delay=1.0):
    """(bytes, retrieval date YYYY-MM-DD) of url; fetched politely only if the cache file is missing (or
    refresh), the date is that of the cache file."""
    if refresh or not os.path.exists(path):
        from polite import fetch  # only when fetching: the parsers stay importable without network
        data = fetch(url, delay=delay)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'wb') as f:
            f.write(data)
    with open(path, 'rb') as f:
        data = f.read()
    return data, datetime.date.fromtimestamp(os.path.getmtime(path)).isoformat()


def clean_text(s):
    """Visible text of an HTML cell: entities decoded, ™ ® stripped, whitespace collapsed."""
    s = html.unescape(re.sub(r'<[^>]*>', ' ', s or ''))
    return re.sub(r'\s+', ' ', s.replace('™', '').replace('®', '')).strip()


# words of maker type names that say the same thing in different spellings (JBM vs. maker pages)
TYPE_WORDS = [
    (r'\(extremely low drag[^)]*\)', ' '), (r'\beld m\b', 'eld match'),
    (r'\bboat ?tail\b', 'bt'), (r'\bhollow ?point\b', 'hp'), (r'\bsoft ?point\b', 'sp'), (r'\bspitzer\b', 'spitzer'),
    (r'\bfull metal jacket\b', 'fmj'), (r'\bround ?nose\b', 'rn'), (r'\bflat ?point\b', 'fp'), (r'\bflat ?base\b', 'fb'),
    (r'\bpolymer ?tip(ped)?\b', 'tip'), (r'\bplastic ?tip(ped)?\b', 'tip'), (r'\bmatch ?king\b', 'matchking'),
    (r'\bgame ?king\b', 'gameking'), (r'\btipped ?matchking\b', 'tmk'), (r'\bpro ?hunter\b', 'prohunter'),
    (r'\bballistic ?tip\b', 'ballistictip'), (r'\baccu ?bond\b', 'accubond'), (r'\bpartition\b', 'partition'),
    (r'\b(hpbt|bthp)\b', 'hp bt'), (r'\b(spbt|btsp)\b', 'sp bt'), (r'\bfmjbt\b', 'fmj bt'), (r'\bhpfb\b', 'hp fb'),
    (r'\bw/ ?c\b', 'wc'), (r'\bwith cannelure\b', 'wc'), (r'\bcannelure\b', 'wc'),
    # Sierra's abbreviations and renamed lines (Varminter is now VarmintKing)
    (r'\bspt\b', 'spitzer'), (r'\bsbt\b', 'spitzer bt'), (r'\bjhp\b', 'jacketed hp'), (r'\bjsp\b', 'jacketed sp'),
    (r'\bjhc\b', 'jacketed hc'), (r'\bhollow cavity\b', 'hc'), (r'\bflat ?nose\b', 'fn'), (r'\bvarminter\b', 'varmintking'),
    (r'\bsports ?master\b', 'sportsmaster'), (r'\btournament ?master\b', 'tournamentmaster'), (r'\bformerly\b', ' '),
]
# per maker: Hornady's "SP" of rifle bullets is the spire point, JBM writes it out
MAKER_TYPE_WORDS = {'Hornady': [(r'\bspire ?point\b', 'sp')]}


def type_key(name, maker=None):
    """Normalised type name for matching: lower case, common spellings unified, punctuation, the weight, the
    calibre, the measurer's note ("(Litz)", "(CD)") and Sierra's line codes ("(SGK)") removed; the words sorted, so word
    order does not matter."""
    s = clean_text(name).lower()
    s = re.sub(r'\((litz|cd|.*rimfire.*|s[a-z]{1,3}k)\)', ' ', s)
    s = re.sub(r'\b\d+([.,]\d+)?\s*(gr|grain|g)s?\b', ' ', s)
    s = re.sub(r'\b\d+([.,]\d+)?\s*(x\s*\d+\s*)?mm\b', ' ', s)
    s = re.sub(r'(?<![\w.])\.?\d{2,3}\b(\s*(cal|caliber|calibre))?', ' ', s)
    s = s.replace('-', ' ')
    for pat, rep in MAKER_TYPE_WORDS.get(maker, []) + TYPE_WORDS:
        s = re.sub(pat, rep, s)
    words = re.findall(r'[a-z0-9]+', s)
    return ' '.join(sorted(set(words)))


def replace_rows(table, columns, rows, where_sql, where_args, db_path=COMPONENTS_DB):
    """Creates table if needed, deletes the rows matching where_sql and inserts rows (dicts)."""
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    db = sqlite3.connect(db_path)
    db.execute(f'create table if not exists {table} ({", ".join(columns)})')
    db.execute(f'delete from {table} where {where_sql}', where_args)
    db.executemany(f'insert into {table} ({", ".join(columns)}) values ({", ".join("?" * len(columns))})',
                   [[r.get(c) for c in columns] for r in rows])
    db.commit()
    db.close()
