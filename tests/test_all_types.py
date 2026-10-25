"""Additional tests for all disability types in fertility and multiple OLS."""
import math
import unittest
from build import TYPES, fit_birth_ols, fit_multivariate


class TestAllDisabilityTypes(unittest.TestCase):
    def setUp(self):
        self.rows = []
        for i in range(9):
            fiscal = .14 + .05*i + (i % 3)*.009
            birth = .55 + i*.08 + (i % 2)*.015
            self.rows.append({
                'after': fiscal, 'before': fiscal*.8, 'fertility': birth,
                'rates': {'자폐성': .03+.02*fiscal-.012*birth,
                          '지체': 2.2+.3*fiscal-.15*birth,
                          '청각·언어': .2+.1*fiscal+.08*birth if i<4 else None}
            })

    def test_all_source_types_are_exposed(self):
        self.assertIn('지체',TYPES)
        self.assertIn('자폐성',TYPES)
        self.assertIn('청각·언어',TYPES)
        self.assertIn('전체',TYPES)

    def test_birth_ols_type_selection(self):
        a=fit_birth_ols(self.rows,'municipal','전국',2022,[],'자폐성')
        b=fit_birth_ols(self.rows,'municipal','전국',2022,[],'지체')
        self.assertEqual(a['type'],'자폐성')
        self.assertEqual(b['type'],'지체')
        self.assertNotEqual(a['slope'],b['slope'])
        self.assertEqual(b['n'],9)

    def test_multivariate_type_selection(self):
        a=fit_multivariate(self.rows,'municipal','전국',2022,'after',[],'자폐성')
        b=fit_multivariate(self.rows,'municipal','전국',2022,'after',[],'지체')
        self.assertEqual(a['type'],'자폐성')
        self.assertEqual(b['type'],'지체')
        self.assertAlmostEqual(a['fiscal_coef'],.02,places=6)
        self.assertAlmostEqual(b['fiscal_coef'],.3,places=6)
        self.assertAlmostEqual(b['fertility_coef'],-.15,places=6)
        self.assertEqual(b['n'],9)

    def test_missing_type_stays_missing(self):
        a=fit_birth_ols(self.rows,'municipal','경기도',2015,[],'청각·언어')
        b=fit_multivariate(self.rows,'municipal','경기도',2015,'after',[],'청각·언어')
        self.assertEqual(a['n'],4)
        self.assertEqual(b['n'],4)
        self.assertEqual(a['type'],'청각·언어')
        self.assertFalse(math.isnan(b['fiscal_coef']))
        c=fit_birth_ols(self.rows,'municipal','경기도',2015,[],'뇌병변')
        self.assertEqual(c['n'],0)
        self.assertIsNone(c['slope'])
        self.assertTrue(c['warning'])

if __name__=='__main__': unittest.main()
