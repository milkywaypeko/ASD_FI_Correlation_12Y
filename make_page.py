import os
import glob
import json
import re
import pandas as pd
import numpy as np

def read_csv_with_encoding(filepath):
    encodings = ['utf-8', 'cp949', 'euc-kr', 'utf-16']
    for enc in encodings:
        try:
            return pd.read_csv(filepath, encoding=enc)
        except (UnicodeDecodeError, LookupError):
            continue
    raise UnicodeDecodeError(f"인코딩 호환 실패: {filepath}")

def clean_disability_type_string(text):
    if pd.isna(text):
        return ""
    text = str(text).strip().replace('"', '')
    # [🔥 핵심] 장루요루 명칭 완벽 통일화 정규식
    text = re.sub(r'장루\s*[·,./]?\s*요루|장루\s+요루', '장루요루', text)
    text = re.sub(r'(장애|유형|별|현황|정보|소계)$', '', text)
    return text.strip()

def clean_population_data(filepath):
    df = read_csv_with_encoding(filepath)
    if '총인구수' in str(df.iloc[0, 1]):
        df = df.iloc[1:]
    df = df.rename(columns={df.columns[0]: 'region'})
    melted = df.melt(id_vars=['region'], var_name='year', value_name='population')
    melted['year'] = pd.to_numeric(melted['year'], errors='coerce')
    melted['population'] = pd.to_numeric(melted['population'].astype(str).str.replace(',', ''), errors='coerce')
    melted['region'] = melted['region'].astype(str).str.replace('"', '').str.strip()
    return melted.dropna()

def clean_financial_data(filepath):
    df = read_csv_with_encoding(filepath)
    header1 = df.columns
    header2 = df.iloc[0]
    
    new_cols = []
    current_year = ""
    for c, h2 in zip(header1, header2):
        if not c.startswith('Unnamed') and '.' not in c and c not in ['행정구역별(1)', '행정구역별(2)']:
            current_year = c
        if '개편후' in str(h2):
            new_cols.append(f"{current_year}_개편후")
        elif '개편전' in str(h2):
            new_cols.append(f"{current_year}_개편전")
        else:
            new_cols.append(c)
            
    df.columns = new_cols
    df = df.iloc[1:]
    df = df.rename(columns={df.columns[0]: 'sido', df.columns[1]: 'sigungu'})
    df['sido'] = df['sido'].astype(str).str.replace('"', '').str.strip()
    df['sigungu'] = df['sigungu'].astype(str).str.replace('"', '').str.strip()
    
    df.loc[df['sido'] == '세종특별자치시', 'sigungu'] = '세종특별자치시'
    df.loc[df['sido'] == '제주특별자치도', 'sigungu'] = '합계'
    
    value_cols = [c for c in df.columns if '개편후' in c or '개편전' in c]
    melted = df.melt(id_vars=['sido', 'sigungu'], value_vars=value_cols, var_name='year_type', value_name='fi_rate')
    
    melted['year'] = melted['year_type'].str.split('_').str[0].astype(int)
    melted['calc_type'] = melted['year_type'].str.split('_').str[1]
    melted['fi_rate'] = pd.to_numeric(melted['fi_rate'], errors='coerce')
    
    return melted[['sido', 'sigungu', 'year', 'calc_type', 'fi_rate']].dropna()

def load_disabled_data(folder_path):
    all_files = glob.glob(os.path.join(folder_path, "*.csv"))
    if not all_files:
        return pd.DataFrame()
        
    combined_list = []
    for f in all_files:
        df = read_csv_with_encoding(f)
        if '계' in str(df.iloc[0, -1]):
            df = df.iloc[1:]
            
        col_names = list(df.columns)
        year_cols = [c for c in col_names if c.isdigit() or (c.replace('.','',1).isdigit() and len(c) >= 4)]
        id_cols = [c for c in col_names if c not in year_cols]
                
        melted = df.melt(id_vars=id_cols, value_vars=year_cols, var_name='year', value_name='count')
        melted['type_sub'] = melted[id_cols[1]].apply(clean_disability_type_string)
        
        file_hint = os.path.basename(f)
        sigungu_col = id_cols[-1]
        melted['sigungu'] = melted[sigungu_col].astype(str).str.replace('"', '').str.strip()
        
        if 'Sejong' in file_hint or '세종' in file_hint:
            melted['sigungu'] = '세종특별자치시'
        elif 'Jeju' in file_hint or '제주' in file_hint:
            melted['sigungu'] = '합계'
            
        melted['year'] = pd.to_numeric(melted['year'], errors='coerce')
        melted['count'] = pd.to_numeric(melted['count'].astype(str).str.replace(',', ''), errors='coerce')
        
        combined_list.append(melted[['type_sub', 'sigungu', 'year', 'count']])
        
    return pd.concat(combined_list, ignore_index=True).dropna()

def main():
    print("1. 파일 데이터 병합 및 세척 전수 가동...")
    base_folder = './Statistics'
    disability_folder = os.path.join(base_folder, 'Disability')
    
    df_pop = clean_population_data(os.path.join(base_folder, 'Resident population.csv'))
    df_fi = clean_financial_data(os.path.join(base_folder, 'Financial Independence.csv'))
    df_dis = load_disabled_data(disability_folder)
    
    if df_dis.empty:
        print("❌ 분석 대상 소스 데이터 부족")
        return

    df_pop['match_key'] = df_pop['region'].str.replace(" ", "")
    df_fi['match_key'] = df_fi['sigungu'].str.replace(" ", "")
    df_dis['match_key'] = df_dis['sigungu'].str.replace(" ", "")
    
    df_pop.loc[df_pop['region'].str.contains('세종'), 'match_key'] = '세종특별자치시'
    df_pop.loc[df_pop['region'].str.contains('제주특별자치도$'), 'match_key'] = '합계'
    
    dis_fi = pd.merge(df_dis, df_fi, on=['match_key', 'year'], suffixes=('_dis', '_fi'))
    
    final_rows = []
    for idx, row in dis_fi.iterrows():
        if row['match_key'] == '세종특별자치시':
            pop_match = df_pop[df_pop['match_key'] == '세종특별자치시']
        elif row['match_key'] == '합계' and '제주' in str(row['sido']):
            pop_match = df_pop[df_pop['match_key'] == '합계']
        else:
            pop_match = df_pop[(df_pop['year'] == row['year']) & 
                               ((df_pop['match_key'] == row['match_key']) | (df_pop['match_key'].str.endswith(row['match_key'])))]
                               
        if not pop_match.empty:
            row_dict = row.to_dict()
            row_dict['population'] = pop_match.iloc[0]['population']
            final_rows.append(row_dict)
            
    final_data = pd.DataFrame(final_rows)
    final_data['disability_ratio'] = (final_data['count'] / final_data['population']) * 100
    final_data = final_data.dropna(subset=['disability_ratio', 'fi_rate'])
    final_data = final_data[~final_data['type_sub'].isin(['합계', '계', '소계', '등록장애인수', ''])]
    
    final_data.loc[final_data['sido'] == '세종특별자치시', 'sigungu'] = '세종시(단일)'
    final_data.loc[final_data['sido'] == '제주특별자치도', 'sigungu'] = '제주시/서귀포시 통합'
    
    available_years = sorted([int(y) for y in final_data['year'].unique()])
    available_sidos = sorted([str(s) for s in final_data['sido'].unique() if s != '전국'])
    
    frontend_dataset = {}
    unique_types = sorted(final_data['type_sub'].unique())
    for dis_type in unique_types:
        sub_df = final_data[final_data['type_sub'] == dis_type]
        frontend_dataset[dis_type] = sub_df[['year', 'sido', 'sigungu', 'calc_type', 'fi_rate', 'disability_ratio']].to_dict(orient='records')

    assets_dir = './web_dashboard'
    os.makedirs(assets_dir, exist_ok=True)
    
    data_js = f"const rawDataset = {json.dumps(frontend_dataset, ensure_ascii=False)};\nconst yearList = {json.dumps(available_years)};\nconst sidoList = {json.dumps(available_sidos, ensure_ascii=False)};"
    with open(os.path.join(assets_dir, 'data_package.js'), 'w', encoding='utf-8') as f:
        f.write(data_js)

    # 반응형 디자인 최적화 CSS
    css_content = """body { font-family: 'Malgun Gothic', sans-serif; margin: 20px; background-color: #f1f5f9; color: #1e293b; }
.container { max-width: 1550px; margin: 0 auto; background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
.header-banner { border-bottom: 3px solid #0284c7; padding-bottom: 15px; margin-bottom: 20px; }
.filter-box { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px; }
.f-group { display: flex; flex-direction: column; gap: 5px; }
select, input[type="range"] { padding: 8px; border-radius: 6px; border: 1px solid #cbd5e1; font-weight: bold; }
.metric-dashboard { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 20px; }
.m-card { background: #1e293b; color: #f8fafc; padding: 15px; border-radius: 8px; text-align: center; border-left: 5px solid #0ea5e9; }
.m-title { font-size: 11px; color: #94a3b8; margin-bottom: 5px; }
.m-value { font-size: 18px; font-weight: bold; color: #38bdf8; font-family: monospace; }
.view-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
.chart-panel { border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; background: #ffffff; height: 430px; position: relative; }
.table-panel { border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; background: #fafafa; max-height: 380px; overflow-y: auto; }
table { width: 100%; border-collapse: collapse; text-align: center; font-size: 12.5px; }
th { background: #334155; color: white; padding: 10px; position: sticky; top: 0; }
td { padding: 9px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-weight: 600; }
tr:hover { background: #f1f5f9; }
.tab-btn { background: #475569; color: white; padding: 6px 14px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; }
.tab-btn.active { background: #10b981; }
"""
    with open(os.path.join(assets_dir, 'dashboard.css'), 'w', encoding='utf-8') as f:
        f.write(css_content)

    # 대시보드 코어 제어 로직 (가변 OLS 스탯 연산 엔진 고도화 포함)
    js_content = """let scatterChart = null;
let trendChart = null;
let activeTrendMetric = 'slope';

document.addEventListener("DOMContentLoaded", () => {
    const typeSelect = document.getElementById('typeSelect');
    const sidoSelect = document.getElementById('sidoSelect');
    const yearSlider = document.getElementById('yearSlider');

    Object.keys(rawDataset).forEach(t => {
        let opt = document.createElement('option'); opt.value = t; opt.innerHTML = t;
        typeSelect.appendChild(opt);
    });
    sidoList.forEach(s => {
        let opt = document.createElement('option'); opt.value = s; opt.innerHTML = s;
        sidoSelect.appendChild(opt);
    });

    yearSlider.min = 0; yearSlider.max = yearList.length; yearSlider.value = 0;
    updateDashboard();
});

function calculateOLS(points) {
    const n = points.length;
    // [🔥 핵심 방어] 단일 지자체/소규모 관측 셋 분할 시 NaN 및 무한대 전파 원천 차단 가드 구문
    if (n < 3) return { r2: "0.00000", slope: 0, slope_coef: "0.00000", intercept: 0, intercept_coef: "0.00000", p_value: "1.00000", n: n };
    
    let sumX = 0, sumY = 0, sumXX = 0, sumYY = 0, sumXY = 0;
    points.forEach(p => { sumX += p.x; sumY += p.y; sumXX += p.x * p.x; sumYY += p.y * p.y; sumXY += p.x * p.y; });
    
    const denom = (n * sumXX - sumX * sumX);
    if(denom === 0) return { r2: "0.00000", slope: 0, slope_coef: "0.00000", intercept: 0, intercept_coef: "0.00000", p_value: "1.00000", n: n };
    
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    
    let ssTot = 0, ssRes = 0;
    const yMean = sumY / n;
    points.forEach(p => { 
        const pred = slope * p.x + intercept; 
        ssTot += Math.pow(p.y - yMean, 2); 
        ssRes += Math.pow(p.y - pred, 2); 
    });
    const r2 = ssTot === 0 ? 0 : 1 - (ssRes / ssTot);
    
    const dfRes = n - 2;
    const s2 = ssRes / dfRes;
    const seSlope = Math.sqrt(s2 / (sumXX - (sumX * sumX / n)));
    const tStat = seSlope === 0 ? 0 : slope / seSlope;
    let pValue = 2 * (1 - normalCDF(Math.abs(tStat)));
    if (isNaN(pValue)) pValue = 1.0;

    return { 
        r2: r2.toFixed(5), 
        slope: slope, 
        slope_coef: slope.toFixed(5), 
        intercept: intercept, 
        intercept_coef: intercept.toFixed(4),
        p_value: pValue < 0.00001 ? pValue.toExponential(4) : pValue.toFixed(5), 
        n: n 
    };
}

function normalCDF(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.39894228 * Math.exp(-x * x / 2);
    const prob = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return x >= 0 ? 1 - prob : prob;
}

function changeTrendMetric(metric) {
    activeTrendMetric = metric;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-' + metric).classList.add('active');
    updateDashboard();
}

function updateDashboard() {
    const selectedType = document.getElementById('typeSelect').value;
    const selectedSido = document.getElementById('sidoSelect').value;
    const calcType = document.querySelector('input[name="calcType"]:checked').value;
    const sliderVal = parseInt(document.getElementById('yearSlider').value);
    const yearLabel = document.getElementById('yearLabel');
    
    let targetYear = sliderVal === 0 ? null : yearList[sliderVal - 1];
    yearLabel.innerText = targetYear ? targetYear + "년 고정" : "시점 전체 통합";
    
    let baseRecords = rawDataset[selectedType] || [];
    baseRecords = baseRecords.filter(r => r.calc_type === calcType);
    if (selectedSido !== "ALL") {
        baseRecords = baseRecords.filter(r => r.sido.includes(selectedSido) || selectedSido.includes(r.sido));
    }
    
    let filteredRecords = targetYear ? baseRecords.filter(r => r.year === targetYear) : baseRecords;

    const scatterPoints = filteredRecords.map(r => ({ x: r.fi_rate, y: r.disability_ratio, sido: r.sido, sigungu: r.sigungu, year: r.year }));
    const metrics = calculateOLS(scatterPoints);

    document.getElementById('top-slope').innerText = metrics.slope_coef;
    document.getElementById('top-intercept').innerText = metrics.intercept_coef;
    document.getElementById('top-r2').innerText = metrics.r2;
    document.getElementById('top-p').innerText = metrics.p_value;
    document.getElementById('top-n').innerText = metrics.n;

    // [복구 완료] 가변 필터 실시간 연동 원본 레포트 명세 테이블 채우기
    const tableBody = document.getElementById('ols-table-body');
    tableBody.innerHTML = "";
    filteredRecords.forEach(r => {
        let tr = document.createElement('tr');
        tr.innerHTML = `<td><b>${r.year}년</b></td><td>${r.sido}</td><td>${r.sigungu}</td><td>${r.fi_rate}%</td><td style='color:#0284c7;'>${r.disability_ratio.toFixed(4)}%</td>`;
        tableBody.appendChild(tr);
    });

    // 1. 가변 OLS 산점도 시각화 엔진 빌드
    let linePoints = [];
    if (scatterPoints.length > 0) {
        const xValues = scatterPoints.map(p => p.x);
        const minX = Math.min(...xValues); const maxX = Math.max(...xValues);
        linePoints = [{ x: minX, y: metrics.slope * minX + metrics.intercept }, { x: maxX, y: metrics.slope * maxX + metrics.intercept }];
    }
    
    if (scatterChart) scatterChart.destroy();
    scatterChart = new Chart(document.getElementById('scatterChart').getContext('2d'), {
        type: 'scatter',
        data: {
            datasets: [
                { label: '지자체 매핑 좌표', data: scatterPoints, backgroundColor: 'rgba(2, 132, 199, 0.65)', borderColor: '#0284c7', pointRadius: 6 },
                { label: 'OLS 선형회귀선', data: linePoints, type: 'line', borderColor: '#ef4444', borderWidth: 2, pointRadius: 0, fill: false }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        // [🔥 요구사항 명시] 마우스 오버 시 광역지자체와 기초지자체명을 정밀 결합 출력
                        label: function(context) {
                            const raw = context.raw;
                            if (raw && raw.sido) {
                                return `📍 [${raw.sido} ${raw.sigungu}] 재정자립도: ${raw.x}%, 장애인 비율: ${raw.y.toFixed(4)}% (${raw.year}년)`;
                            }
                            return `X: ${context.parsed.x.toFixed(2)}, Y: ${context.parsed.y.toFixed(2)}`;
                        }
                    }
                }
            }
        }
    });

    // 2. [🔥 요구사항 명시] 통계 계수 추정 평면(기울기, 절편, 결정계수, P-value)의 연도별 변동 추이 꺾은선 구현
    const trendLabels = yearList;
    const trendValues = yearList.map(y => {
        const yrPoints = baseRecords.filter(r => r.year === y).map(r => ({ x: r.fi_rate, y: r.disability_ratio }));
        const yrMetrics = calculateOLS(yrPoints);
        
        if (activeTrendMetric === 'slope') return yrMetrics.slope;
        if (activeTrendMetric === 'intercept') return yrMetrics.intercept;
        if (activeTrendMetric === 'r2') return parseFloat(yrMetrics.r2);
        if (activeTrendMetric === 'p_value') return parseFloat(yrMetrics.p_value);
        return null;
    });

    let metricLabel = '기울기 계수(Slope) 변동 추이';
    let lineColor = '#10b981';
    if(activeTrendMetric === 'intercept') { metricLabel = 'Y 절편(Intercept) 변동 추이'; lineColor = '#6366f1'; }
    if(activeTrendMetric === 'r2') { metricLabel = '결정계수(R²) 변동 추이'; lineColor = '#f59e0b'; }
    if(activeTrendMetric === 'p_value') { metricLabel = '유의확률(P-value) 변동 추이'; lineColor = '#ec4899'; }

    if (trendChart) trendChart.destroy();
    trendChart = new Chart(document.getElementById('trendChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: trendLabels,
            datasets: [{
                label: `${selectedType} (${metricLabel})`,
                data: trendValues,
                borderColor: lineColor,
                backgroundColor: 'rgba(255,255,255,0)',
                borderWidth: 3,
                tension: 0.15,
                fill: false,
                spanGaps: true
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}
"""
    with open(os.path.join(assets_dir, 'dashboard.js'), 'w', encoding='utf-8') as f:
        f.write(js_content)

    # 3. 루트 디렉토리 최적화 단일 대시보드 구조 사출
    print("3. 루트 경로 고정 대시보드 뼈대 배치...")
    html_skeleton = """<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>재정자립도 대비 장애인 비율 통계 분석 시스템</title>
    <link rel="stylesheet" href="web_dashboard/dashboard.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="web_dashboard/data_package.js"></script>
    <script src="web_dashboard/dashboard.js"></script>
</head>
<body>
<div class="container">
    <div class="header-banner">
        <h1>📊 지자체 재정자립도 대비 장애인 비율 가변형 OLS 회귀분석 시스템</h1>
        <div style="font-size:12.5px; color:#64748b; margin-top:5px;">장루요루 명칭 통합 완료 • 다차원 OLS 통계치 선택형 꺾은선 차트 추적 아키텍처</div>
    </div>

    <div class="filter-box">
        <div class="f-group">
            <label><strong>1. 장애 유형 고정/선택</strong></label>
            <select id="typeSelect" onchange="updateDashboard()"></select>
        </div>
        <div class="f-group">
            <label><strong>2. 분석 대상 지역 범위</strong></label>
            <select id="sidoSelect" onchange="updateDashboard()">
                <option value="ALL">전국 지자체 전체 통합</option>
            </select>
        </div>
        <div class="f-group">
            <label><strong>3. 세입과목 분류 기준</strong></label>
            <div style="display:flex; gap:15px; margin-top:8px; font-weight:bold; font-size:13px;">
                <label><input type="radio" name="calcType" value="개편후" checked onchange="updateDashboard()"> 세입개편 후</label>
                <label><input type="radio" name="calcType" value="개편전" onchange="updateDashboard()"> 세입개편 전</label>
            </div>
        </div>
        <div class="f-group">
            <label><strong>4. 시점 제어 슬라이더 (<span id="yearLabel">전체 통합</span>)</strong></label>
            <input type="range" id="yearSlider" oninput="updateDashboard()">
        </div>
    </div>

    <div class="metric-dashboard">
        <div class="m-card"><div class="m-title">기울기 계수 (Slope)</div><div class="m-value" id="top-slope">-</div></div>
        <div class="m-card"><div class="m-title">Y 절편 (Intercept)</div><div class="m-value" id="top-intercept">-</div></div>
        <div class="m-card"><div class="m-title">결정계수 ($R^2$)</div><div class="m-value" id="top-r2">-</div></div>
        <div class="m-card"><div class="m-title">유의확률 (P-value)</div><div class="m-value" id="top-p">-</div></div>
        <div class="m-card"><div class="m-title">유효 관측 샘플수 (N)</div><div class="m-value" id="top-n">-</div></div>
    </div>

    <div class="view-grid">
        <div class="chart-panel">
            <h3 style="margin:0 0 10px 0; font-size:13.5px; color:#334155;">🎯 선택 조건별 실시간 가변 OLS 산점도 및 선형 예측선</h3>
            <canvas id="scatterChart"></canvas>
        </div>
        <div class="chart-panel">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <h3 style="margin:0; font-size:13.5px; color:#334155;">📈 OLS 추정치 시계열 추적 (연도별 지표 변동 꺾은선 차트)</h3>
                <div style="display:flex; gap:4px;">
                    <button id="btn-slope" class="tab-btn active" onclick="changeTrendMetric('slope')">Slope</button>
                    <button id="btn-intercept" class="tab-btn" onclick="changeTrendMetric('intercept')">Intercept</button>
                    <button id="btn-r2" class="tab-btn" onclick="changeTrendMetric('r2')">R²</button>
                    <button id="btn-p_value" class="tab-btn" onclick="changeTrendMetric('p_value')">P-value</button>
                </div>
            </div>
            <canvas id="trendChart"></canvas>
        </div>
    </div>

    <div class="table-panel">
        <h3 style="margin:0 0 10px 0; font-size:13.5px; color:#334155;">📋 조건별 필터링 연동 매핑 레포트 원본 명세 테이블</h3>
        <table>
            <thead>
                <tr>
                    <th>분석 기준연도</th>
                    <th>광역지자체명</th>
                    <th>기초지자체명</th>
                    <th>재정자립도(X)</th>
                    <th>장애인 인구 비율(Y)</th>
                </tr>
            </thead>
            <tbody id="ols-table-body">
                </tbody>
        </table>
    </div>
</div>
</body>
</html>
"""
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(html_skeleton)
        
    print("\n✨ 요구사항 역방향 복구 및 다차원 추이 트래킹 업그레이드 완료!")

if __name__ == '__main__':
    main()