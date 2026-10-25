# 장애인 등록률 × 재정자립도 (2014–2022)

`./Statistics` 디렉터리의 주민등록인구·재정자립도·장애인 등록현황 CSV를 이용해 `statsmodels.OLS`를 수행하고 **GitHub Pages용 정적 웹사이트**를 출력하는 Python 프로젝트입니다. 제공된 실제 19개 CSV를 포함합니다.

## 폴더 구조

```text
disability-fiscal-dashboard/
├── build.py                        # 데이터 정규화 + 장애유형별 등록률 + OLS + JSON/Raw 출력
├── requirements.txt
├── Statistics/
│   ├── Financial Independence.csv
│   ├── Resident population.csv
│   └── Disability/
│       ├── Population of the disabled in Seoul.csv
│       ├── Population of the disabled in Jeju.csv
│       └── ... (시도별 총 17개 CSV)
└── site/                           # 완성된 정적 페이지. 바로 배포 가능
    ├── index.html                  # 산점도/회귀식/계수 요약/연도 슬라이더/관측치
    ├── results.html                # 연도×지역 통합 모형 표 및 계수 변화 그래프
    ├── quality.html                # 자료 결합 방법 및 누락 감사
    ├── .nojekyll
    ├── assets/
    │   ├── css/style.css
    │   └── js/{common,dashboard,results,quality}.js
    ├── data/
    │   ├── meta.json
    │   ├── municipalities.json
    │   ├── provinces.json
    │   ├── models_2014_before.json  # 연도·개편 전후별 모형 (2014~2022)
    │   ├── models_2022_after.json
    │   ├── models_pooled.json       # 전 시점 통합 OLS
    │   ├── models_local_history.json# 개별 기초지자체 2014~2022 시계열 OLS
    │   └── quality.json
    └── raw/                         # statsmodels .summary() 원문 텍스트 덤프
        ├── OLS_2014_before.txt
        ├── ...
        ├── OLS_pooled_before.txt
        └── OLS_local_history_after.txt
```

## 실행하기

```bash
cd disability-fiscal-dashboard
python -m pip install -r requirements.txt
python build.py
python -m http.server 8000 --directory site
```

브라우저에서 `http://localhost:8000`을 엽니다. 재현 실행 시 기존 `site/data/`와 `site/raw/`의 계산 결과를 덮어씁니다. 다른 경로를 쓰려면:

```bash
python build.py --input /path/to/project --output /path/to/public
```

`--input` 아래에 `Statistics/Financial Independence.csv`, `Statistics/Resident population.csv`, `Statistics/Disability/Population of the disabled in *.csv`가 있어야 합니다. 다른 시도 파일을 추가할 경우 `build.py`의 `FILE_TO_PROVINCE` 항목에 등록하세요.

## GitHub Pages 배포

1. 원하는 GitHub 저장소를 만든 뒤 `site/` 폴더의 **내용물**(`index.html`, `results.html`, `assets`, `data`, `raw` 등)을 저장소 **루트**에 업로드합니다. 
2. 저장소 `Settings → Pages → Build and deployment`에서 **Deploy from a branch → main / (root)** 를 선택합니다.
3. 공개되는 URL 예시: `https://<사용자명>.github.io/<저장소명>/`.

`site/` 폴더를 통째로 저장소에 유지하고 싶다면 `site`를 `docs`로 변경하거나 `site` 내용물을 `docs/`로 복사한 후 Pages 배포 소스를 `/docs`로 설정해도 됩니다. GitHub Pages의 브랜치 배포에서 기본 지원되는 위치는 `/(root)` 혹은 `/docs`입니다. 페이지 파일을 `file://`로 더블클릭하면 JSON `fetch()`가 차단될 수 있으므로 HTTP 서버 또는 GitHub Pages에서 열어야 합니다. Chart.js 및 글꼴은 CDN을 사용하므로 차트 표시에는 인터넷 연결이 필요합니다. GitHub Pages에서는 Python이 실행되지 않으며, Python은 배포 **전에** 사전 계산을 수행합니다.

## 기능

- **메인 대시보드:** 회귀 단위(기초 간·광역 간·개별 기초 시계열), 광역 필터, 기초 필터, 장애유형, 재정자립도 개편 전후, 단일 연도 슬라이더, 9개년 통합 선택. 산점도 툴팁에 광역·기초 지자체명 및 연도·수치를 표시합니다. 회귀선, 기울기, 절편, R², p-값과 표본 수가 그래프 위 카드에 나타납니다. 각 연도별 4개 계수 추이도 제공합니다. 원자료 표 필터·페이지 넘김·CSV 내려받기와 statsmodels 원문 펼치기가 가능합니다.
- **통합 결과:** 개별 연도×전국/광역 필터로 산출한 모형 목록, 단위·유형·개편 전후·지역별 검색 및 정렬, 4개 계수 시계열 그래프, 각 모델 원문과 산점도 연결, CSV 내보내기. 기초지자체 9개년 시계열 모형도 조회할 수 있습니다.
- **데이터 품질:** 지자체 및 장애유형 정규화 방법, 조인 검사, 부적합 행 처리, 분석 가정을 기록합니다.

## 장애인 등록률과 지역 매칭

```
유형별 장애인 등록률(%) = 해당 유형 장애등록인원 ÷ 해당 연도 주민등록인구 × 100
전체 장애인 등록률(%) = 합계(장애유형별 등록인원) ÷ 주민등록인구 × 100
```

- 지역명은 **(연도, 광역지자체, 기초지자체)** 키를 이용하며, 동일 이름인 `중구`, `서구`, `남구` 등은 서로 다른 광역의 자료와 섞이지 않습니다.
- 장애유형 이름 끝의 `장애`를 제거하고 `장루, 요루`, `장루요루`, `장루·요루`를 통일합니다. `'기타'`는 원본 데이터가 빈 칸인 비공식 유형이라 표준 15유형에서 제외합니다.
- 경기도의 **2014~2017년 `청각·언어` 통합항목은 별개의 항목**입니다. 개별 `청각`, `언어`의 과거 값으로 복제하지 않으며, 전체 인원 합계에는 한 번만 포함합니다. 시도별 유형별 등록률을 비교할 때 통합/분리 구간에 유의하세요.
- 충북은 **2014년 청주시 통합 인구·장애등록인원을 사용**합니다. 재정 원본에서 이름이 ‘충북 청주시’로 적힌 2014년 값을 해당 통합 청주시의 재정자립도로 결합합니다. 재정자료의 당시 ‘충북 청원군’ 항목은 2014년 주민등록인구·장애등록인원 자료가 없으므로 분석에서 제외합니다. 인천 `남구 → 미추홀구`, 강원 `강원도 → 강원특별자치도`, 전북 `전라북도 → 전북특별자치도`로 표준화합니다. 대구 편입 이전인 **군위군 2014~2022년은 경북 관측치**만 사용합니다.
- **세종·제주를 광역 하나이자 기초 하나**로 처리합니다. 제주 주민등록인구는 `제주시`·`서귀포시`를 합산하지 않고 **제주특별자치도 공식 합계**를 사용합니다. 이 두 곳은 예외적 행정단위임을 설명합니다.
- 광역 시도 등록인원은 하위 분석대상 기초단위 등록인원 합계, 광역 주민등록인구는 그 해의 시도 공식 합계, 광역 재정자립도는 시도 공식 소계입니다. 기초 시계열과 광역 시계열은 완전히 다른 분석 단위입니다.
- **결측치 처리:** 원자료 빈 문자열·`-`는 결측 처리. 회귀분석에는 X와 Y 모두 존재하는 관측치만 포함하며 보간하거나 0으로 바꾸지 않습니다. 일부 지자체·연도에서 매우 드문 장애유형의 원본 수치가 비어 있으므로 `전체` 유형의 인원 합계는 **수치가 제공된 유형들의 합**이며 실제보다 소폭 작을 수 있습니다. 해당 지역·연도와 공란 유형을 `quality.json`의 `partially_reported_types`에 저장하고, 산점도 툴팁과 데이터 품질 페이지에서 확인할 수 있습니다.

## 회귀모형의 정의 및 한계

`statsmodels.api.OLS(Y, add_constant(X)).fit()`을 이용하여 장애인 등록률 Y(%)와 재정자립도 X(%)의 **단순 선형회귀(절편 포함)** 를 계산합니다. 모형별 `n`, 기울기 `β₁`, 절편 `β₀`, 결정계수 `R²`, 기울기 양측 p-값, `fit().summary()` Raw 문자열을 JSON 및 원문 텍스트에 저장합니다. 표본이 3개 미만이거나 X 분산이 0이면 계수를 계산하지 않고 사유를 저장합니다.

- 단일 연도 + 기초 단위 = 그 해의 전국 또는 특정 광역 산하 기초지자체 간 회귀.
- 단일 연도 + 광역 단위 = 그 해 전국 17개 광역지자체 간 회귀.
- 전체 연도 통합 + 기초 단위 = (기초지자체, 연도) 관측치를 합쳐 회귀.
- 전체 연도 통합 + 광역 단위 = (광역지자체, 연도) 관측치를 합쳐 회귀.
- 개별 기초지자체 시계열 = 해당 단위의 2014~2022 9개 데이터로 회귀.

**주의:** 연도 통합 분석에서 각 지자체의 연도별 관측치는 독립적이지 않을 수 있습니다. 인구 구조/장애등록 기준 변화/재정 정책 등 공변량을 통제하지 않았으므로 계수와 p-값을 인과관계나 정책효과로 해석해서는 안 됩니다. 소수 표본(세종·제주)은 당해년도 기초 간 횡단면 회귀를 구할 수 없으므로 기초지자체별 시계열 분석을 사용하세요. 장애인 등록률은 전체 인구 대비 등록률이며 등록인원 구성비와 다릅니다.

## 개발·배포 확인

- 종속 라이브러리: NumPy, statsmodels. SciPy·pandas는 statsmodels 의존성으로 설치될 수 있습니다.
- 구현된 차트: [Chart.js v4](https://www.chartjs.org/docs/latest/) (CDN)
- 라이선스: 작성된 Python 및 프런트엔드 코드를 사용·변형할 수 있습니다. **원본 CSV의 2차 사용 및 출처 표기는 해당 데이터 제공기관 이용조건을 확인하세요.**

테스트: `python -m unittest discover -s tests -v`
