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
    
    let timeKey = sliderVal === 0 ? "ALL" : String(yearList[sliderVal - 1]);
    yearLabel.innerText = sliderVal === 0 ? "시점 전체 통합" : yearList[sliderVal - 1] + "년 고정";
    
    const node = rawDataset[selectedType]?.[calcType]?.[selectedSido] || { records: {}, stats: {}, trends: {} };
    const filteredRecords = node.records[timeKey] || [];
    const metrics = node.stats[timeKey] || { r2: "0.00000", slope: 0, slope_coef: "0.00000", intercept: 0, intercept_coef: "0.00000", p_value: "1.00000", n: 0 };
    const trends = node.trends || { slope: [], intercept: [], r2: [], p_value: [] };

    document.getElementById('top-slope').innerText = metrics.slope_coef;
    document.getElementById('top-intercept').innerText = metrics.intercept_coef;
    document.getElementById('top-r2').innerText = metrics.r2;
    document.getElementById('top-p').innerText = metrics.p_value;
    document.getElementById('top-n').innerText = metrics.n;
    document.getElementById('statsmodels-container').innerHTML = metrics.summary_html;

    const scatterPoints = filteredRecords.map(r => ({ x: r.fi_rate, y: r.disability_ratio, sido: r.sido, sigungu: r.sigungu, year: r.year }));
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

    const trendValues = trends[activeTrendMetric] || [];
    let metricLabel = '기울기 계수(Slope) 변동 추이';
    let lineColor = '#10b981';
    if(activeTrendMetric === 'intercept') { metricLabel = 'Y 절편(Intercept) 변동 추이'; lineColor = '#6366f1'; }
    if(activeTrendMetric === 'r2') { metricLabel = '결정계수(R²) 변동 추이'; lineColor = '#f59e0b'; }
    if(activeTrendMetric === 'p_value') { metricLabel = '유의확률(P-value) 변동 추이'; lineColor = '#ec4899'; }

    if (trendChart) trendChart.destroy();
    trendChart = new Chart(document.getElementById('trendChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: yearList,
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
