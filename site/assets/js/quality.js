'use strict';
(async()=>{
try{
 const q=await Lab.load('data/quality.json');
 Lab.text('quality-n',Lab.integer(q.observations));
 Lab.text('quality-p',Lab.integer(q.province_observations));
 Lab.text('quality-missing',Lab.integer(q.unmatched.length));
 Lab.text('quality-summary',`인구/재정 결측 집계: ${JSON.stringify(q.missing)} · 일치하지 않거나 검토가 필요한 기록: ${q.unmatched.length}개 · 일부 장애유형 결측 행: ${(q.partially_reported_types||[]).length}개 · 중복 기록: ${q.duplicate_records.length}개`);
 const all=[...q.unmatched.map(x=>({...x,cause:x.cause})),...(q.partially_reported_types||[]).map(x=>({...x,cause:'원본 장애유형 공란: '+x.missing_types.join(', ')})),...q.duplicate_records.map(x=>({year:'—',province:'원본 자료',district:'—',cause:x}))];
 const el=document.getElementById('issues');
 el.innerHTML=all.length?all.slice(0,150).map(r=>`<tr><td>${r.year}</td><td>${r.province}</td><td>${r.district}</td><td>${r.cause}</td></tr>`).join(''):'<tr><td colspan="4">해당 2014~2022 분석 데이터의 누락·중복 경고가 없습니다.</td></tr>';
}catch(e){Lab.showError(e);}
})();
