"""Tests of the helpers of the load data readers:  python3 -m unittest discover tools/reference-data  (pnpm test:data)"""
import io
import os
import sys
import unittest
import urllib.error
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import parse_lovex  # noqa: E402
import parse_rs_guide  # noqa: E402
import polite  # noqa: E402

KNOWN = {'S011', 'S053', 'S060', 'S065', 'S070', 'D036', 'D037', 'D037.1', 'D073', 'D073.4', 'D073.5', 'D073.6'}


class LovexPowderNames(unittest.TestCase):
    def test_ocr_spellings(self):
        cases = {'S011': 'S011', '$011': 'S011', '5065': 'S065', 'O073.5': 'D073.5', '0073.5': 'D073.5', '073': 'D073',
                 'D073,6': 'D073.6', 'DO73.4': 'D073.4', 'S0I1': 'S011', 'SO6O': 'S060', '|S070.': 'S070',
                 'd036': 'D036', 'D037.9': 'D037', '5O53': 'S053'}
        for raw, name in cases.items():
            self.assertEqual(parse_lovex.powder_name(raw, KNOWN), name, raw)

    def test_no_powder(self):
        for raw in ('', 'X073', 'D999', '0073'):
            self.assertIsNone(parse_lovex.powder_name(raw, KNOWN), raw)


class RsGuide(unittest.TestCase):
    ROW = ('22 Hornet         40         SP          Sierra         RWS         SR RWS 4033          RS30          0,50          '
           '7,7      620    1644          85             0,62         9,6        702        2219           105           639        '
           '600 (1:16")          43,7')

    def test_row_on_the_first_and_last_line(self):
        # the lines around a row are read for the bullet type; a row at the edge of the text has only one neighbour
        self.assertEqual(len(parse_rs_guide.parse([self.ROW])), 1)
        loads = parse_rs_guide.parse(['Hollow Point', self.ROW])
        self.assertEqual(len(loads), 1)
        self.assertIn('Hollow Point', loads[0]['bulletType'])
        # before, the line "before" the first row was the last line of the text, so it was read twice here
        self.assertEqual(parse_rs_guide.parse([self.ROW, 'Footer'])[0]['bulletType'].count('Footer'), 1)


class Robots(unittest.TestCase):
    def setUp(self):
        polite._robots.clear()

    def fail_with(self, error):
        return mock.patch('urllib.request.urlopen', side_effect=error)

    def http(self, code):
        return urllib.error.HTTPError('https://h/robots.txt', code, 'x', {}, io.BytesIO())

    def test_forbidden_robots_forbids_everything(self):
        with self.fail_with(self.http(403)):
            self.assertFalse(polite._rules('h').can_fetch('ClaudeBot', 'https://h/page'))

    def test_missing_robots_allows_everything(self):
        with self.fail_with(self.http(404)):
            self.assertTrue(polite._rules('h').can_fetch('ClaudeBot', 'https://h/page'))

    def test_unreachable_host_stops(self):
        with self.fail_with(urllib.error.URLError('offline')), self.assertRaises(SystemExit):
            polite._rules('h')


if __name__ == '__main__':
    unittest.main()
