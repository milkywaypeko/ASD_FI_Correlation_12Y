"""Checks for the added univariate fertility × autism OLS and root entry."""
import math
import tempfile
import unittest
from pathlib import Path

from build import fit_birth_ols, write_project_root_entrypoint


class TestFertilityAutismOLS(unittest.TestCase):
    def test_known_straight_line(self):
        rows = [
            {"fertility": 0.6 + i / 10,
             "rates": {"자폐성": 0.12 + 0.025 * (0.6 + i / 10)}}
            for i in range(9)
        ]
        result = fit_birth_ols(rows, "municipal", "전국", 2022, [])
        self.assertEqual(result["n"], 9)
        self.assertTrue(math.isclose(result["slope"], 0.025, abs_tol=1e-9))
        self.assertTrue(math.isclose(result["intercept"], 0.12, abs_tol=1e-9))
        self.assertTrue(math.isclose(result["r2"], 1, abs_tol=1e-9))
        self.assertIn('total_fertility_rate', result["raw"])

    def test_missing_values_are_dropped(self):
        rows = [
            {"fertility": 0.8, "rates": {"자폐성": 0.14}},
            {"fertility": 0.9, "rates": {"자폐성": 0.15}},
            {"fertility": 1.0, "rates": {"자폐성": 0.16}},
            {"fertility": 1.1, "rates": {}},
            {"fertility": None, "rates": {"자폐성": 0.18}},
        ]
        result = fit_birth_ols(rows, "municipal", "전국", 2022, [])
        self.assertEqual(result["n"], 3)
        self.assertAlmostEqual(result["slope"], 0.1)

    def test_single_observation_not_fit(self):
        result = fit_birth_ols([{"fertility":0.5, "rates":{"자폐성":0.1}}],
                               "municipal", "제주특별자치도", 2022, [])
        self.assertIsNone(result['slope'])
        self.assertIsNotNone(result['warning'])

    def test_root_index_uses_site_base(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            (root/'site').mkdir()
            (root/'site'/'index.html').write_text('<!doctype html><html><head><title>sample</title></head><body><a href="birth-ols.html">OLS</a></body></html>',encoding='utf-8')
            write_project_root_entrypoint(root,root/'site')
            result=(root/'index.html').read_text(encoding='utf-8')
            self.assertIn('<base href="./site/">',result)
            self.assertIn('href="birth-ols.html"',result)
            self.assertTrue((root/'.nojekyll').exists())


if __name__=='__main__':
    unittest.main()
