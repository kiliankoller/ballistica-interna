"""Tests of the master data pipeline:  python3 -m unittest discover tools/master-data  (pnpm test:data)"""
import csv
import json
import os
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import build_csv  # noqa: E402
import build_db  # noqa: E402
import merge_bullets  # noqa: E402

DATA = os.path.join(os.path.dirname(__file__), '..', '..', 'data')
# .308 Win. outline from the C.I.P. sheet
CAL_308 = dict(L1='39.62', L2='43.48', L3='51.18', P1='11.96', P2='11.53', H1='8.72', H2='8.72', G1='7.85')


class CapacityEstimate(unittest.TestCase):
    def test_308_within_five_percent_of_published_capacity(self):
        # Lapua gives 3.64 cm³ (56.2 grains of water) for its .308 Win. case
        self.assertAlmostEqual(build_csv.capacity_estimate(CAL_308), 56.2, delta=56.2 * 0.05)

    def test_straight_case(self):
        # .45 Auto: L3 22.81, P1 12.09, H2 12.01, G1 11.48; published capacities 25 … 28 grains
        v = build_csv.capacity_estimate(dict(L3='22.81', P1='12.09', H2='12.01', G1='11.48'))
        self.assertTrue(24 < v < 30, v)

    def test_missing_shoulder_is_inferred(self):
        r = dict(CAL_308, L1='', P2='')
        self.assertAlmostEqual(build_csv.capacity_estimate(r), build_csv.capacity_estimate(CAL_308), delta=4)

    def test_without_length_or_diameter_no_estimate(self):
        self.assertIsNone(build_csv.capacity_estimate(dict(P1='11.96', G1='7.85')))

    def test_factor_for_rifle_calibers_only(self):
        self.assertEqual(build_csv.capacity_factor(dict(tab='1')), build_csv.CAPACITY_FACTOR)
        self.assertEqual(build_csv.capacity_factor(dict(tab=4)), 1)
        with open(os.path.join(DATA, 'calibers.csv'), newline='') as f:
            for r in csv.DictReader(f):
                if r['V_source'] == 'estimate':
                    v = build_csv.capacity_estimate(r) * build_csv.capacity_factor(r)
                    self.assertEqual(float(r['V']), round(v, 1), r['cipname'])

    def test_missing_derived_capacities_stop_the_build(self):
        fix = build_csv.FIX
        try:
            with tempfile.TemporaryDirectory() as tmp:
                build_csv.FIX = tmp
                with self.assertRaises(SystemExit):
                    build_csv.reload_swiss_capacities()
        finally:
            build_csv.FIX = fix


# Derived capacities further than this from the outline estimate (before CAPACITY_FACTOR) are suspect.
DERIVED_TOLERANCE = 0.08
# Known open: 7 mm-08 is the .308 Win. case necked down (about 56 grains of water), the derived value is 51.1.
SUSPECT_DERIVED = {'7 mm - 08 Rem.'}


class DerivedCapacities(unittest.TestCase):
    def test_derived_capacities_agree_with_the_outline(self):
        with open(os.path.join(DATA, 'calibers.csv'), newline='') as f:
            rows = [r for r in csv.DictReader(f) if r['V_source'] == 'reload-swiss-fill']
        self.assertTrue(rows)
        off = {r['cipname'] for r in rows
               if abs(float(r['V']) / build_csv.capacity_estimate(r) - 1) > DERIVED_TOLERANCE}
        self.assertEqual(off, SUSPECT_DERIVED, 'fixed or new suspects: update SUSPECT_DERIVED')


class Checks(unittest.TestCase):
    def test_good_caliber_passes(self):
        self.assertEqual(build_db.check('caliber', dict(CAL_308, L6='71.12', Pmax='4150', V='57.8')), [])

    def test_bad_values_are_named(self):
        bad = build_db.check('caliber', dict(CAL_308, L6='71.12', Pmax='41500', G1='12.5'))
        self.assertTrue(any('Pmax' in b for b in bad), bad)
        self.assertTrue(any('G1' in b for b in bad), bad)

    def test_powder_shape(self):
        self.assertTrue(build_db.check('propellant', dict(Ba='0.5', Qex='3900', k='1.23', z1='0.8', z2='0.5', pcd='950')))

    def test_bullet_seating_depth(self):
        self.assertTrue(build_db.check('projectile', dict(gdia='7.82', gmass='150', glen='30', gdepthmax='31', g1bc='0.4')))


class CommittedData(unittest.TestCase):
    def test_csvs_build_without_errors(self):
        with tempfile.TemporaryDirectory() as tmp:
            r = subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), 'build_db.py'), '--out',
                                os.path.join(tmp, 'x.db')], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)

    def test_every_row_names_a_shipped_source(self):
        with open(os.path.join(DATA, 'sources.csv'), newline='') as f:
            ship = {r['id'] for r in csv.DictReader(f) if r['ship'] == 'yes'}
        for name in ('calibers.csv', 'bullets.csv', 'powders.csv'):
            with open(os.path.join(DATA, name), newline='') as f:
                for r in csv.DictReader(f):
                    for s in r['source'].split(';'):
                        self.assertIn(s.strip(), ship, f'{name}: {r}')


def maker_bullet(**kw):
    r = dict(maker='Sierra', product_line='MatchKing', name='30 CAL 168 GR HPBT MatchKing (SMK)', part_number='2200',
             diameter_in=0.308, weight_gr=168.0, length_in=None, bc_g1=0.462, bc_g7=0.218, nose_in=None,
             boattail_in=None, twist_min_in=None, note=None, url='https://example.org', retrieved='2026-10-20',
             source='sierra-product-pages')
    r.update(kw)
    return r


def jbm(desc, length, weight=168.0, dia=0.308, maker='Sierra', litz=None):
    return dict(maker=maker, diameter_in=dia, weight_gr=weight, description=desc, length_in=length, tip_in=None,
                measured_by=litz)


class MergeBullets(unittest.TestCase):
    def merge(self, makers, lengths):
        table = {}
        for j in lengths:
            table.setdefault(j['maker'], []).append(j)
        rows, conflicts = merge_bullets.merge(makers, table)
        return rows, conflicts

    def test_jbm_length_by_type_name(self):
        rows, _ = self.merge([maker_bullet()], [jbm('Hollow Point Boat Tail MatchKing', 1.215), jbm('GameKing SBT', 1.12)])
        self.assertEqual((rows[0]['glen_in'], rows[0]['length_source'], rows[0]['flags']), (1.215, 'jbm', ''))
        self.assertAlmostEqual(rows[0]['glen'], 30.86, places=2)
        self.assertIn('jbm-lengths', rows[0]['source'])

    def test_maker_length_wins_and_conflict_is_flagged(self):
        rows, conflicts = self.merge([maker_bullet(maker='Berger', name='30 Cal 168 gr VLD Hunting', length_in=1.26)],
                                     [jbm('VLD Hunting', 1.30, maker='Berger')])
        self.assertEqual((rows[0]['glen_in'], rows[0]['length_source']), (1.26, 'maker'))
        self.assertIn('length_conflict', rows[0]['flags'])
        self.assertEqual(conflicts[0][1:3], (1.26, 1.30))

    def test_ambiguous_match_gives_no_length(self):
        rows, _ = self.merge([maker_bullet()], [jbm('HPBT MatchKing', 1.215), jbm('HPBT MatchKing', 1.30)])
        self.assertIsNone(rows[0]['glen'])
        self.assertIn('length_ambiguous', rows[0]['flags'])

    def test_single_candidate_without_common_word_is_no_match(self):
        rows, _ = self.merge([maker_bullet()], [jbm('Spitzer Flat Base', 1.10)])
        self.assertIsNone(rows[0]['glen'])
        self.assertEqual(set(rows[0]['flags'].split()), {'jbm_no_match', 'length_missing'})

    def test_other_diameter_nose_or_line_is_no_match(self):
        rows, _ = self.merge([maker_bullet()], [jbm('HPBT MatchKing', 1.215, dia=0.311)])
        self.assertIn('length_missing', rows[0]['flags'])
        rows, _ = self.merge([maker_bullet(name='30 CAL 168 GR HPBT GameKing')], [jbm('Spitzer Boattail (GameKing)', 1.2)])
        self.assertIn('jbm_no_match', rows[0]['flags'])
        rows, _ = self.merge([maker_bullet(maker='Norma', name='Oryx .30 (.308) 10,9g Bonded SP')],
                             [jbm('Soft Point Alaska', 1.2, maker='Norma')])
        self.assertIn('jbm_no_match', rows[0]['flags'])

    def test_page_value_confirmed_by_jbm_is_kept(self):
        b = maker_bullet(maker='Barnes', name='0.264" 6.5MM TSX BT 120 gr', diameter_in=0.264, weight_gr=120.0,
                         length_in=1.145, note='50 ct; pages_disagree length_in 1.252')
        rows, _ = self.merge([b], [jbm('Triple-Shock X Boattail TSX', 1.247, weight=120.0, dia=0.264, maker='Barnes')])
        self.assertEqual(rows[0]['glen_in'], 1.252)
        self.assertIn('maker_pages_disagree', rows[0]['flags'])
        self.assertNotIn('length_conflict', rows[0]['flags'])

    def test_box_sizes_become_one_row(self):
        rows, _ = self.merge([maker_bullet(), maker_bullet(part_number='2200C')], [])
        self.assertEqual([r['part_number'] for r in rows], ['2200 / 2200C'])

    def test_plausibility(self):
        self.assertEqual(merge_bullets.plausibility(dict(diameter_in=0.308, weight_gr=168, length_in=1.215, bc_g1=0.462, bc_g7=0.218)), [])
        self.assertIn('implausible_length', merge_bullets.plausibility(dict(diameter_in=0.308, weight_gr=168, length_in=3.0)))
        self.assertIn('implausible_weight', merge_bullets.plausibility(dict(diameter_in=0.224, weight_gr=300)))
        self.assertIn('implausible_bc', merge_bullets.plausibility(dict(diameter_in=0.308, weight_gr=168, bc_g1=0.2, bc_g7=0.3)))

    def test_missing_length_only_when_flagged(self):
        row = dict(gdia='7.82', gmass='168', g1bc='0.462')
        self.assertTrue(build_db.check('projectile', dict(row, flags='')))
        self.assertEqual(build_db.check('projectile', dict(row, flags='length_missing')), [])


if __name__ == '__main__':
    unittest.main()


class ShippedFitsTest(unittest.TestCase):
    """A test fit in fixtures/calibration must not change the shipped powder values."""

    def test_newest_fits_come_from_the_manifest(self):
        before = build_csv.newest_fits()
        with tempfile.TemporaryDirectory() as tmp:
            os.makedirs(os.path.join(tmp, 'calibration'))
            # a single-powder test fit, newer than all others, with a deliberately wrong value
            fake = {'set': 'rs', 'class': None, 'params': {}, 'datasheet': True, 'fitted': {'RS50': {'Ba': 99.0}}}
            with open(os.path.join(tmp, 'calibration', 'powders-2099-01-01T00-00-00-000Z.json'), 'w') as f:
                json.dump(fake, f)
            saved = build_csv.FIX
            build_csv.FIX = tmp
            try:
                after = build_csv.newest_fits()
            finally:
                build_csv.FIX = saved
        self.assertEqual(before, after)
        self.assertNotEqual(after['rs']['RS50']['Ba'], 99.0)

    def test_manifest_note_reaches_fit_status(self):
        with open(os.path.join(build_csv.ROOT, 'data', 'fits-shipped.json'), encoding='utf-8') as f:
            notes = {n: v['note'] for fitted in json.load(f)['fits'].values() for n, v in fitted.items() if v.get('note')}
        self.assertIn('24N41', notes)
        with open(os.path.join(DATA, 'powders.csv'), newline='') as f:
            status = {r['pname']: r['fit_status'] for r in csv.DictReader(f)}
        for name, note in notes.items():
            self.assertIn(note, status[name])

    def test_manifest_covers_every_powder_with_its_source(self):
        with open(os.path.join(build_csv.ROOT, 'data', 'fits-shipped.json'), encoding='utf-8') as f:
            manifest = json.load(f)
        for set_, fitted in manifest['fits'].items():
            for name in fitted:
                self.assertIn(name, manifest['source'][set_], f'{set_} {name} has no source fit')

