"""Tests of the bullet master-data parsers on saved sample pages (testdata/):
python3 -m unittest discover tools/reference-data  (part of pnpm test:data)"""
import os
import sys
import unittest

HERE = os.path.dirname(__file__)
sys.path.insert(0, HERE)
import bullet_sources  # noqa: E402
import parse_berger_bullets  # noqa: E402
import parse_jbm_lengths  # noqa: E402
import parse_hornady_catalog  # noqa: E402
import parse_nosler_catalog  # noqa: E402


def sample(name):
    with open(os.path.join(HERE, 'testdata', name), encoding='utf-8') as f:
        return f.read()


class JbmLengths(unittest.TestCase):
    rows = parse_jbm_lengths.parse(sample('jbm_lengthlist_sample.html'))

    def test_index_rows_are_skipped_and_makers_assigned(self):
        self.assertEqual({r['maker'] for r in self.rows}, {'Hornady', 'Sierra'})
        self.assertEqual(sum(r['maker'] == 'Hornady' for r in self.rows), 7)
        self.assertEqual(sum(r['maker'] == 'Sierra' for r in self.rows), 3)

    def test_values(self):
        gmx = next(r for r in self.rows if r['description'] == 'GMX')
        self.assertEqual((gmx['diameter_in'], gmx['weight_gr'], gmx['length_in'], gmx['tip_in']), (0.224, 50.0, 0.751, None))

    def test_missing_length_is_kept_empty(self):
        cx = next(r for r in self.rows if r['description'] == 'CX')
        self.assertIsNone(cx['length_in'])

    def test_litz_measurement_and_tip(self):
        amax = next(r for r in self.rows if r['measured_by'])
        self.assertEqual((amax['measured_by'], amax['length_in'], amax['tip_in']), ('Litz', 0.8, 0.141))


class BergerReferenceChart(unittest.TestCase):
    rows = {r['part_number']: r for r in parse_berger_bullets.parse(sample('berger_reference_charts_sample.html'))}

    def test_header_is_skipped(self):
        self.assertEqual(set(self.rows), {'17308', '20304', '24407', '30417', '37379'})

    def test_boat_tail_bullet(self):
        r = self.rows['20304']
        self.assertEqual((r['diameter_in'], r['weight_gr'], r['length_in'], r['boattail_in'], r['nose_in'], r['ogive_in'],
                          r['bearing_in'], r['bc_g1'], r['bc_g7'], r['twist_min_in'], r['product_line']),
                         (0.204, 40.0, 0.680, 0.110, 0.411, 0.337, 0.159, 0.227, 0.116, 12.0, 'BT Varmint'))

    def test_flat_base_and_missing_g7(self):
        r = self.rows['17308']
        self.assertIsNone(r['boattail_in'])
        self.assertIsNone(r['bc_g7'])

    def test_weight_from_sectional_density(self):
        self.assertEqual((self.rows['30417']['weight_gr'], self.rows['30417']['note']), (200, 'weight_from_sd'))
        self.assertEqual(self.rows['30417']['product_line'], 'Hybrid Target')
        self.assertEqual(self.rows['24407']['weight_gr'], 64)

    def test_unicode_inch_mark_in_twist(self):
        self.assertEqual(self.rows['37379']['twist_min_in'], 8.0)


class NoslerCatalogue(unittest.TestCase):
    # synthetic pages in the layout of a product guide (invented names and numbers)
    rows = {r['part_number']: r for r in parse_nosler_catalog.parse(
        {7: sample('nosler_sample_p7.txt'), 9: sample('nosler_sample_p9.txt')}, sample('nosler_sample_contents.txt'))}

    def test_contents_give_the_product_line(self):
        toc = parse_nosler_catalog.table_of_contents(sample('nosler_sample_contents.txt'))
        self.assertIn((7, 8, 'Gamma Hunting'), toc)
        self.assertIn((9, 9, 'Delta Varmint'), toc)
        self.assertNotIn('Ammunition', ' '.join(t for _, _, t in toc))
        self.assertEqual(self.rows['90001']['product_line'], 'Gamma Hunting')

    def test_card(self):
        r = self.rows['90001']
        self.assertEqual((r['name'], r['diameter_in'], r['weight_gr'], r['length_in'], r['bc_g1'], r['bc_g7']),
                         ('6.5mm 120 gr Spitzer', 0.264, 120.0, 1.300, 0.500, 0.250))

    def test_covered_older_card_is_replaced_by_the_visible_one(self):
        r = self.rows['90002']
        self.assertEqual((r['length_in'], r['bc_g1']), (1.450, 0.590))
        self.assertIn('catalogue_layers', r['note'])

    def test_value_without_leading_zero_and_boxes_stay_with_their_card(self):
        self.assertEqual((self.rows['90003']['bc_g1'], self.rows['90003']['bc_g7']), (0.700, 0.350))
        self.assertEqual(self.rows['90004']['bc_g7'], 0.320)

    def test_spec_line_after_other_text(self):
        self.assertEqual((self.rows['90010']['diameter_in'], self.rows['90010']['length_in']), (0.366, 1.600))


class HornadyCatalogue(unittest.TestCase):
    # synthetic word boxes in the layout of the catalogue's transposed tables (invented names and numbers)
    rows = {r['part_number']: r for r in parse_hornady_catalog.parse(sample('hornady_sample_tables.bbox.html'))}

    def test_narrow_header_repeated_type_goes_to_every_column(self):
        alpha = [r for r in self.rows.values() if r['product_line'] == 'Alpha Match']
        self.assertEqual(len(alpha), 4)
        r = self.rows['90101']
        self.assertEqual((r['name'], r['diameter_in'], r['weight_gr'], r['bc_g1'], r['bc_g7']),
                         ('6.5mm 120 gr Alpha Match', 0.264, 120.0, 0.500, 0.250))

    def test_dash_is_no_value(self):
        self.assertIsNone(self.rows['90102']['bc_g7'])

    def test_two_tables_side_by_side_and_type_in_the_calibre_row(self):
        r = self.rows['90301']
        self.assertEqual((r['name'], r['product_line'], r['bc_g1'], r['note']),
                         ('30 Cal. 160 gr Gamma', 'Gamma', 0.33, 'for 30-30 TEST'))
        self.assertEqual(self.rows['90201']['name'], '22 Cal. 100 gr Beta')


class TypeKey(unittest.TestCase):
    def test_spellings_and_order_do_not_matter(self):
        k = bullet_sources.type_key
        self.assertEqual(k('Full Metal Jacket Boat Tail W/C'), k('FMJ BT with Cannelure'))
        self.assertEqual(k('30 Cal .308 168 gr HPBT MatchKing®'), k('MatchKing HP BT'))
        self.assertEqual(k('A-Max® (Litz)'), k('A-MAX'))
        self.assertEqual(k('30 CAL 150 GR SPT PRO-HUNTER'), k('Spitzer (Pro-Hunter)'))
        self.assertEqual(k('22 CAL 55 GR SBT GameKing (SGK)'), k('Spitzer Boattail (GameKing)'))
        self.assertEqual(k('VarmintKing 22 CAL 50 GR VarmintKing (SVK)'), k('Varminter'))
        self.assertEqual(k('6.5mm 100 gr ELD Match'), k('ELD M (Extremely Low Drag Match)'))
        self.assertEqual(k('Oryx 9,3mm (.366) 18,5g Bonded SP'), k('Bonded SP Oryx'))
        self.assertEqual(k('22 Cal. 55 gr SP', 'Hornady'), k('Spire Point', 'Hornady'))

    def test_different_types_differ(self):
        self.assertNotEqual(bullet_sources.type_key('ELD-X'), bullet_sources.type_key('ELD Match'))
        self.assertNotEqual(bullet_sources.type_key('JHC'), bullet_sources.type_key('Jacketed Hollow Point'))


if __name__ == '__main__':
    unittest.main()
