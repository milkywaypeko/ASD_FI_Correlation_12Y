"""Run: python -m unittest discover -s tests -v"""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build import clean_disability_type, clean_province, clean_district, read_rows, parse_disability, parse_population, parse_fiscal, parse_birth_rate, fit_multivariate, finite_probability

ROOT = Path(__file__).resolve().parents[1]


class TestDataIntegration(unittest.TestCase):
    def test_preserve_small_p_values(self):
        self.assertEqual(finite_probability(1e-46),1e-46)

    def test_disability_type_harmonization(self):
        self.assertEqual(clean_disability_type('지체장애'), '지체')
        self.assertEqual(clean_disability_type('지체'), '지체')
        for case in ('장루,요루', '장루, 요루장애', '장루요루', '장루·요루'):
            self.assertEqual(clean_disability_type(case), '장루·요루')
        self.assertEqual(clean_disability_type('청각·언어'), '청각·언어')

    def test_old_new_places(self):
        self.assertEqual(clean_province('강원도'), '강원특별자치도')
        self.assertEqual(clean_province('전라북도'), '전북특별자치도')
        self.assertEqual(clean_district('인천광역시','남구'), '미추홀구')
        self.assertEqual(clean_district('충청북도','충북 청원군'), '청원군')
        self.assertEqual(clean_district('제주특별자치도','제주시'), '제주특별자치도')

    def test_disability_2014_and_2018_gyeonggi(self):
        data,unknown,dup=parse_disability(ROOT/'Statistics'/'Disability')
        self.assertFalse(dup)
        old=data[(2014,'경기도','수원시')]
        new=data[(2018,'경기도','수원시')]
        self.assertIn('청각·언어',old)
        self.assertNotIn('청각',old)
        self.assertNotIn('언어',old)
        self.assertNotIn('청각·언어',new)
        self.assertIn('청각',new)
        self.assertIn('언어',new)

    def test_fiscal_normalization_is_non_destructive(self):
        filename=ROOT/'Statistics'/'Financial Independence.csv'
        before=filename.read_bytes()
        local, totals, _=parse_fiscal(filename)
        self.assertEqual(local[(2022,'서울특별시','종로구','after')],0.4751)
        self.assertEqual(local[(2022,'서울특별시','종로구','before')],0.5122)
        self.assertTrue(all(0 <= x <= 1 for x in list(local.values())+list(totals.values())))
        self.assertEqual(before,filename.read_bytes(), '재정 CSV 원본을 덮어쓰면 안 됩니다.')

    def test_birth_matching_and_special_province(self):
        local, totals, dup = parse_birth_rate(ROOT/'Statistics'/'Birth rate.csv')
        self.assertFalse(dup)
        disability, _, _=parse_disability(ROOT/'Statistics'/'Disability')
        self.assertEqual(len(set(disability).difference(local)),0)
        for year in range(2014,2023):
            for province in ('제주특별자치도','세종특별자치시'):
                self.assertEqual(local[(year,province,province)],totals[(year,province)])
        self.assertEqual(local[(2022,'서울특별시','종로구')],0.477)

    def test_multivariate_exact_coefficients_on_synthetic_data(self):
        samples=[]
        for i in range(1,9):
            fiscal=i/12
            fertility=(i*i%7+5)/7
            samples.append({'before':fiscal,'after':fiscal,'fertility':fertility,
                            'rates':{'자폐성':0.5+2*fiscal-0.4*fertility}})
        raw=[]
        model=fit_multivariate(samples,'municipal','전국',2022,'after',raw)
        self.assertAlmostEqual(model['intercept'],0.5,places=9)
        self.assertAlmostEqual(model['fiscal_coef'],2,places=9)
        self.assertAlmostEqual(model['fertility_coef'],-0.4,places=9)
        self.assertAlmostEqual(model['r2'],1,places=9)
        self.assertEqual(len(raw),1)

    def test_south_korea_population_join_and_special_units(self):
        population,totals,errors=parse_population(ROOT/'Statistics'/'Resident population.csv')
        self.assertFalse(errors)
        self.assertEqual(population[(2022,'제주특별자치도','제주특별자치도')],
                         totals[(2022,'제주특별자치도')])
        self.assertEqual(population[(2014,'충청북도','청주시')],831521)
        self.assertNotIn((2014,'충청북도','청원군'),population)
        fiscal,subtotals,errors=parse_fiscal(ROOT/'Statistics'/'Financial Independence.csv')
        self.assertFalse(errors)
        self.assertEqual(fiscal[(2022,'제주특별자치도','제주특별자치도','before')],
                         subtotals[(2022,'제주특별자치도','before')])
        self.assertEqual(fiscal[(2014,'충청북도','청주시','before')],0.3597)


if __name__ == '__main__':
    unittest.main()
