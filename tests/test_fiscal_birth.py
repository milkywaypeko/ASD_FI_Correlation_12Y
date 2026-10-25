"""Regression of total fertility rate against fiscal-independence ratio."""
import math
import unittest
from build import fit_fiscal_birth_ols, parse_fiscal, build_fiscal_birth_ols
from pathlib import Path
import tempfile
import json

class TestFiscalBirthOLS(unittest.TestCase):
    def setUp(self):
        self.rows=[{"before":.1+i*.04,"after":.2+i*.035,"fertility":.8+.13*(.2+i*.035)} for i in range(9)]

    def test_slope_and_intercept(self):
        fit=fit_fiscal_birth_ols(self.rows,"municipal","전국",2022,"after",[])
        self.assertEqual(fit["n"],9)
        self.assertAlmostEqual(fit["slope"],.13,places=9)
        self.assertAlmostEqual(fit["intercept"],.8,places=9)
        self.assertAlmostEqual(fit["r2"],1,places=8)
        self.assertIn("fiscal_independence_0to1",fit["raw"])

    def test_different_fiscal_modes(self):
        before=fit_fiscal_birth_ols(self.rows,"municipal","전국",2022,"before",[])
        after=fit_fiscal_birth_ols(self.rows,"municipal","전국",2022,"after",[])
        self.assertNotEqual(before["slope"],after["slope"])
        self.assertEqual(before["mode"],"before")

    def test_missing_values_excluded_and_no_imputation(self):
        rows=self.rows+[{'after':None,'fertility':.9},{'after':.4,'fertility':None}]
        fit=fit_fiscal_birth_ols(rows,"municipal","전국",2022,"after",[])
        self.assertEqual(fit["n"],len(self.rows))
        self.assertEqual(fit["r2"],1)

    def test_constant_x_and_single_observation(self):
        fit=fit_fiscal_birth_ols([{'after':.3,'fertility':.8}]*5,"municipal","전국",2022,"after",[])
        self.assertIsNone(fit["slope"])
        self.assertTrue(fit["warning"])
        fit=fit_fiscal_birth_ols([{'before':.3,'fertility':.8}],"municipal","전국",2022,"before",[])
        self.assertIsNone(fit["slope"])

    def test_real_csv_fiscal_remains_percent_in_source(self):
        filename=Path(__file__).resolve().parents[1]/'Statistics'/'Financial Independence.csv'
        initial=filename.read_bytes()
        local,totals,duplicates=parse_fiscal(filename)
        self.assertEqual(filename.read_bytes(),initial)
        self.assertTrue(all(0<=val<=1 for val in list(local.values())+list(totals.values())))

    def test_output_groups(self):
        district=[dict(self.rows[i],year=2014+i,province='서울특별시',district='중구') for i in range(9)]
        provincial=[dict(self.rows[i],year=2014+i,province='서울특별시',district='서울특별시') for i in range(9)]
        with tempfile.TemporaryDirectory() as root:
            out=Path(root);(out/'raw').mkdir();(out/'data').mkdir()
            audit=build_fiscal_birth_ols(out,district,provincial)
            self.assertEqual(audit['yearly_models'],9*2*19)
            self.assertEqual(len(json.loads((out/'data'/'fiscal_birth_models_pooled.json').read_text())),38)
            self.assertTrue((out/'raw'/'FISCAL_BIRTH_2022_after.txt').exists())

if __name__=='__main__':unittest.main()
