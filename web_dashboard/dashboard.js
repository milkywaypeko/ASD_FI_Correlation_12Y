let scatterChart = null;
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
