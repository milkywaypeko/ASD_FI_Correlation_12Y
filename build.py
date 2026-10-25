#!/usr/bin/env python3
"""Korean municipal disability/fiscal OLS static GitHub Pages builder (2014-2022)."""
from __future__ import annotations
import argparse
import csv
import json
import math
import re
import warnings
import shutil
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import statsmodels.api as sm

YEARS = tuple(range(2014, 2023))
MODES = ("before", "after")
TYPES = ["전체", "지체", "뇌병변", "시각", "청각", "언어", "청각·언어", "지적", "자폐성", "정신", "신장", "심장", "호흡기", "간", "안면", "장루·요루", "뇌전증"]
FILE_TO_PROVINCE = {
    "Seoul": "서울특별시", "Busan": "부산광역시", "Daegu": "대구광역시", "Incheon": "인천광역시",
    "Gwangju": "광주광역시", "Daejeon": "대전광역시", "Ulsan": "울산광역시", "Sejong": "세종특별자치시",
    "Gyeonggi-do": "경기도", "Gangwon-do": "강원특별자치도", "Chungcheongbuk-do": "충청북도",
    "Chungcheongnam-do": "충청남도", "Jeollabuk-do": "전북특별자치도", "Jeollanam-do": "전라남도",
    "Gyeongsangbuk-do": "경상북도", "Gyeongsangnam-do": "경상남도", "Jeju": "제주특별자치도",
}
SPECIAL = {"세종특별자치시", "제주특별자치도"}
PROVINCES = list(FILE_TO_PROVINCE.values())
PROVINCE_ALIASES = {"강원도": "강원특별자치도", "전라북도": "전북특별자치도"}


def read_rows(path: Path) -> list[list[str]]:
    for encoding in ("utf-8-sig", "cp949", "euc-kr"):
        try:
            with path.open("r", encoding=encoding, newline="") as f:
                return list(csv.reader(f))
        except UnicodeDecodeError:
            continue
    raise ValueError(f"인코딩을 읽을 수 없습니다: {path}")


def num(v: str) -> float | None:
    v = (v or "").strip().replace(",", "")
    if v in ("", "-", "…", "X", "x", "N/A"):
        return None
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except ValueError:
        return None


def clean_province(s: str) -> str:
    return PROVINCE_ALIASES.get(s.strip(), s.strip())


def clean_district(province: str, district: str) -> str:
    district = district.strip()
    if province in SPECIAL:
        return province
    if district.startswith("충북 "):
        district = district.removeprefix("충북 ")
    if district.startswith("경기 "):
        district = district.removeprefix("경기 ")
    if province == "인천광역시" and district == "남구":
        district = "미추홀구"
    return district


def clean_disability_type(name: str) -> str:
    name = re.sub(r"\s+", "", name.strip()).replace("장애", "")
    if "장루" in name and "요루" in name:
        return "장루·요루"
    name = name.replace("청각,언어", "청각·언어")
    return name


def parse_population(path: Path):
    rows = read_rows(path)
    year_cols = [(i, int(h)) for i, h in enumerate(rows[0]) if h.isdigit() and int(h) in YEARS]
    province = None
    local = {}
    total = {}
    errors = []
    for row in rows[2:]:
        if not row or not row[0].strip() or row[0] == "전국":
            continue
        name = clean_province(row[0])
        if name in PROVINCES:
            province = name
            for i, y in year_cols:
                value = num(row[i])
                if value is not None and value > 0:
                    total[(y, province)] = int(value)
            continue
        if province is None:
            continue
        if province in SPECIAL:
            # The province total is already present. Jeju has two administrative
            # cities and Sejong repeats a city total: do not treat child rows as
            # separate values or flag their expected differences as duplicates.
            continue
        district = clean_district(province, row[0])
        # Skip child administrative districts / field offices because the source also
        # provides a parent city total. Only merge keys that exist in the disability source.
        for i, y in year_cols:
            value = num(row[i])
            if value is not None and value > 0:
                key = (y, province, district)
                if key in local and local[key] != int(value):
                    errors.append(f"인구 중복: {key} {local[key]} vs {value}")
                local[key] = int(value)
    for (y, province), value in total.items():
        if province in SPECIAL:
            local[(y, province, province)] = value
    return local, total, errors


def parse_fiscal(path: Path):
    rows = read_rows(path)
    columns = [(i, int(y), "after" if "개편후" in rows[1][i] else "before")
               for i, y in enumerate(rows[0]) if y.isdigit() and int(y) in YEARS]
    local = {}
    totals = {}
    duplicates = []
    for row in rows[2:]:
        if len(row) < 2:
            continue
        province, district = clean_province(row[0]), row[1].strip()
        if province not in PROVINCES:
            continue
        for i, year, mode in columns:
            value = num(row[i])
            if value is None:
                continue
            if district == "소계":
                totals[(year, province, mode)] = value
            else:
                district = clean_district(province, row[1])
                key = (year, province, district, mode)
                if key in local and local[key] != value:
                    duplicates.append(f"재정자립도 중복: {key}: {local[key]} vs {value}")
                local[key] = value
    for (year, prov, mode), value in totals.items():
        if prov in SPECIAL:
            local[(year, prov, prov, mode)] = value
    return local, totals, duplicates


def parse_disability(folder: Path):
    records = defaultdict(dict)
    unknown = Counter()
    duplicated = []
    for file in sorted(folder.glob("Population of the disabled in *.csv")):
        name = file.stem[len("Population of the disabled in "):]
        if name not in FILE_TO_PROVINCE:
            raise ValueError(f"알 수 없는 광역시도 파일: {file.name}")
        prov = FILE_TO_PROVINCE[name]
        rows = read_rows(file)
        year_cols = [(i, int(h)) for i, h in enumerate(rows[0]) if h.isdigit() and int(h) in YEARS]
        if not year_cols:
            raise ValueError(f"2014-2022 연도를 발견하지 못했습니다: {file.name}")
        year_start = min(i for i, _ in year_cols)
        # Gyeonggi: '남부/북부' then city; Seoul: '서울시' then gu.
        # All others use their third field. Jeju/Sejong use a single '합계' row.
        district_col = 3 if name in ("Gyeonggi-do", "Seoul") else 2
        data_start = 2 if name == "Seoul" else 1
        for row in rows[data_start:]:
            if len(row) <= max(i for i, _ in year_cols):
                continue
            dtype = clean_disability_type(row[1])
            if dtype not in TYPES:
                unknown[(name, dtype)] += 1
                continue
            district = clean_district(prov, row[district_col])
            if district in ("소계", "합계", "총계") and prov not in SPECIAL:
                continue
            if prov in SPECIAL:
                district = prov
            for idx, year in year_cols:
                val = num(row[idx])
                if val is None:
                    continue
                key = (year, prov, district)
                if dtype in records[key] and records[key][dtype] != int(val):
                    duplicated.append(f"장애유형 중복: {key} {dtype}")
                records[key][dtype] = int(val)
    return records, dict(unknown), duplicated


def finite(value):
    if value is None:
        return None
    value = float(value)
    return round(value, 12) if math.isfinite(value) else None


def finite_probability(value):
    """Preserve small p-values: rounding to 12 decimal places would turn 1e-40 into 0."""
    v = float(value)
    return v if math.isfinite(v) else None


def fit_model(obs: list[dict], scope: str, region: str, year: str | int,
              dtype: str, mode: str, raw_group: list[str]):
    valid = []
    for r in obs:
        x = r.get(mode)
        y = r.get("rates", {}).get(dtype)
        if x is not None and y is not None and math.isfinite(x) and math.isfinite(y):
            valid.append((float(x), float(y)))
    n = len(valid)
    result = {"scope": scope, "region": region, "year": year, "type": dtype,
              "mode": mode, "n": n, "slope": None, "intercept": None,
              "r2": None, "p": None, "warning": None, "raw": None}
    if n < 3:
        result["warning"] = "유효 관측치가 3개 미만입니다."
        return result
    xs, ys = np.array(valid, dtype=float).T
    if np.ptp(xs) < 1e-12:
        result["warning"] = "재정자립도 값이 모두 같아 회귀할 수 없습니다."
        return result
    X = sm.add_constant(xs, has_constant="add")
    model = sm.OLS(ys, X).fit()
    result.update(intercept=finite(model.params[0]), slope=finite(model.params[1]),
                  r2=finite(model.rsquared), p=finite_probability(model.pvalues[1]))
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        result["raw"] = str(model.summary())
    raw_group.append(f"\n{'=' * 78}\nscope={scope}, region={region}, year={year}, type={dtype}, mode={mode}, n={n}\n" + result["raw"] + "\n")
    return result


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def build(base: Path, out: Path):
    stats = base / "Statistics"
    pop, pop_totals, pe = parse_population(stats / "Resident population.csv")
    fisc, fiscal_totals, fe = parse_fiscal(stats / "Financial Independence.csv")
    disabilities, unknown, de = parse_disability(stats / "Disability")

    detail = []
    unmatched = []
    missing_types_report = []
    missing_count = Counter()
    for (year, province, district), counts in sorted(disabilities.items()):
        denom = pop.get((year, province, district))
        before = fisc.get((year, province, district, "before"))
        after = fisc.get((year, province, district, "after"))
        if denom is None:
            unmatched.append({"year": year, "province": province, "district": district,
                              "cause": "인구자료 없음", "disability": sum(counts.values())})
            missing_count["population"] += 1
            continue
        if before is None and after is None:
            unmatched.append({"year": year, "province": province, "district": district,
                              "cause": "재정자립도 개편 전/후 모두 없음", "disability": sum(counts.values())})
            missing_count["fiscal_both"] += 1
        if before is None: missing_count["fiscal_before"] += 1
        if after is None: missing_count["fiscal_after"] += 1
        # Mutually exclusive source categories: separate 2014-17 Gyeonggi hearing/language
        # combined records must not be split or copied into two individual categories.
        expected_types = set(TYPES) - {"전체", "청각·언어"}
        if province == "경기도" and year <= 2017:
            expected_types -= {"청각", "언어"}
            expected_types.add("청각·언어")
        missing_types = sorted(expected_types - set(counts))
        if missing_types:
            missing_types_report.append({"year": year, "province": province, "district": district,
                                         "missing_types": missing_types})
        total_disabled = sum(counts.values())
        if total_disabled > denom:
            unmatched.append({"year": year, "province": province, "district": district,
                              "cause": "유형 합계가 주민등록인구보다 큼", "disability": total_disabled, "population": denom})
            missing_count["over_population"] += 1
        ratios = {t: round(cnt / denom * 100, 10) for t, cnt in counts.items()}
        ratios["전체"] = round(total_disabled / denom * 100, 10)
        detail.append({"year": year, "province": province, "district": district,
                       "population": denom, "disabled": total_disabled,
                       "counts": counts, "rates": ratios, "before": before, "after": after,
                       "missing_types": missing_types})

    # Use published metropolitan total population, sum published municipality disabled
    # counts. Province 'before/after' is its official subtotal, never a mean of counties.
    by_province = defaultdict(list)
    for r in detail: by_province[(r["year"], r["province"])].append(r)
    province_rows = []
    for (year, province), rows in sorted(by_province.items()):
        population = pop_totals.get((year, province))
        if not population:
            continue
        counts = defaultdict(int)
        for r in rows:
            for t, n in r["counts"].items(): counts[t] += n
        disabled = sum(counts.values())
        rates = {t: round(n / population * 100, 10) for t, n in counts.items()}
        rates["전체"] = round(disabled / population * 100, 10)
        province_rows.append({"year": year, "province": province, "district": province,
                              "population": population, "disabled": disabled,
                              "counts": dict(counts), "rates": rates,
                              "before": fiscal_totals.get((year, province, "before")),
                              "after": fiscal_totals.get((year, province, "after"))})

    out.mkdir(parents=True, exist_ok=True)
    template = Path(__file__).resolve().parent / "site"
    if out.resolve() != template.resolve():
        # --output must produce a complete deployable site, not only JSON files.
        shutil.copytree(template, out, dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns("data", "raw"))
    (out / "raw").mkdir(exist_ok=True)
    # Models are grouped into separate data files so a basic dashboard only needs its
    # selected year's model file. Text dumps are additionally saved by block.
    for year in YEARS:
        year_data = [r for r in detail if r["year"] == year]
        prov_data = [r for r in province_rows if r["year"] == year]
        for mode in MODES:
            models = []
            dumps = []
            for dtype in TYPES:
                models.append(fit_model(year_data, "municipal", "전국", year, dtype, mode, dumps))
                for province in PROVINCES:
                    relevant = [r for r in year_data if r["province"] == province]
                    models.append(fit_model(relevant, "municipal", province, year, dtype, mode, dumps))
                models.append(fit_model(prov_data, "provincial", "전국", year, dtype, mode, dumps))
            write_json(out / "data" / f"models_{year}_{mode}.json", models)
            (out / "raw" / f"OLS_{year}_{mode}.txt").write_text("".join(dumps), encoding="utf-8")
            print(f"  {year} {mode}: {len(models)} models / {len(dumps)} fits", flush=True)

    all_models = []
    hist_models = []
    for mode in MODES:
        dumps = []
        for dtype in TYPES:
            all_models.append(fit_model(detail, "municipal", "전국", "전기간", dtype, mode, dumps))
            for province in PROVINCES:
                relevant = [r for r in detail if r["province"] == province]
                all_models.append(fit_model(relevant, "municipal", province, "전기간", dtype, mode, dumps))
            all_models.append(fit_model(province_rows, "provincial", "전국", "전기간", dtype, mode, dumps))
        (out / "raw" / f"OLS_pooled_{mode}.txt").write_text("".join(dumps), encoding="utf-8")
        dumps = []
        grouping = defaultdict(list)
        for r in detail: grouping[(r["province"], r["district"])].append(r)
        for (province, district), records in sorted(grouping.items()):
            for dtype in TYPES:
                hist_models.append(fit_model(records, "local_history", province + "|" + district,
                                             "전기간", dtype, mode, dumps))
        (out / "raw" / f"OLS_local_history_{mode}.txt").write_text("".join(dumps), encoding="utf-8")
        print(f"  pooled {mode}: {len(all_models)}; local history {len(hist_models)}", flush=True)
    write_json(out / "data" / "models_pooled.json", all_models)
    write_json(out / "data" / "models_local_history.json", hist_models)
    write_json(out / "data" / "municipalities.json", detail)
    write_json(out / "data" / "provinces.json", province_rows)

    regions = {p: sorted({r["district"] for r in detail if r["province"] == p}) for p in PROVINCES}
    meta = {"years": list(YEARS), "types": TYPES, "provinces": PROVINCES,
            "districts": regions, "modes": {"before": "세입과목 개편 전", "after": "세입과목 개편 후"},
            "units": {"fiscal": "%p", "disability": "%p"}}
    write_json(out / "data" / "meta.json", meta)
    quality = {"observations": len(detail), "province_observations": len(province_rows),
               "partially_reported_types": missing_types_report,
               "unmatched": unmatched, "missing": dict(missing_count),
               "unknown_types": {str(k): v for k, v in unknown.items()},
               "duplicate_records": pe + fe + de,
               "type_note": "경기도 2014-2017 청각·언어는 통합 유형이며 청각/언어로 강제 분리하지 않음. 일부 지역-연도의 특정 유형은 원본 공란이므로 전체 등록인원 합계는 제공된 유형의 합산값이며 소폭 과소계상 가능.",
               "special_note": "세종/제주는 광역합계 관측치를 기초 단일 관측치로 사용. 다른 시군구와 완전히 동일한 행정계층은 아님.",
               "method_note": "단순 OLS(상수항 포함); 연도 통합분석은 반복 측정과 연도 교란을 보정하지 않으므로 인과관계로 해석하지 말 것."}
    write_json(out / "data" / "quality.json", quality)
    print("완료:", len(detail), "기초-연도 관측치,", len(province_rows), "광역-연도 관측치")
    print("누락:", dict(missing_count), "분석 제외 목록:", len(unmatched),
          "장애유형 일부 결측:", len(missing_types_report), "중복:", len(pe + fe + de))
    if unmatched: print("예시:", unmatched[:10])
    return quality


def main():
    parser = argparse.ArgumentParser(description="2014~2022 장애유형별 비율 × 재정자립도 OLS/Chart.js 정적 사이트 생성")
    parser.add_argument("--input", type=Path, default=Path(__file__).resolve().parent,
                        help="Statistics/ (Disability/ 포함)을 가진 프로젝트 디렉터리")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parent / "site",
                        help="GitHub Pages 출력 폴더 (기본값: ./site)")
    args = parser.parse_args()
    build(args.input.resolve(), args.output.resolve())

if __name__ == "__main__":
    main()
