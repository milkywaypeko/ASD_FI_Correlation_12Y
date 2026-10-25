'use strict';
/* Precomputed statsmodels OLS: no fitting or statistical inference is performed in JS. */
(async () => {
  const E = id => document.getElementById(id);
  const fmt = (n,k=6) => Lab.numeric(n,k);
  const pFmt = n => Lab.pvalue(n);
  const years = Array.from({length:9},(_,i)=>2014+i);
  const state = {scope:'municipal', province:'전국', district:'', mode:'after',
                 year:2022, dtype:'자폐성', allYears:false, tableAll:false, allTypes:false, search:'', page:0};
  let current=null, visibleRows=[], allTable=[], displayedTable=[], selectedRaw=null;
  let meta, municipalities, provinces, yearModels, pooledModels, historyModels;
  const modelFile = (y, mode) => `data/multi_models_${y}_${mode}.json`;
  const keyOf = x => `${x.scope}~${x.region}~${x.year}~${x.mode}~${x.type}`;
  function selectModel(items,scope,region,year,mode,dtype=state.dtype) {
    return items?.find(m=>m.scope===scope&&m.region===region&&String(m.year)===String(year)&&m.mode===mode&&m.type===dtype) || null;
  }
  function currentRegion() {
    return state.scope==='provincial'?'전국':state.scope==='local_history'?
      `${state.province}|${state.district}`:state.province;
  }
  function actualPeriod() {return state.allYears||state.scope==='local_history'?'전기간':state.year;}
  function roundModel(m) {return m && m.fiscal_coef!=null;}
  function label(m) {return m.scope==='local_history'?m.region.replace('|',' · '):m.region;}
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function setDistrict(){
    const sel=E('multi-district');sel.replaceChildren();
    const names=meta.districts[state.province]||[];
    names.forEach(d=>Lab.opt(sel,d,d));
    if(names.includes(state.district))sel.value=state.district;
    state.district=sel.value;
  }
  function sync(){
    const history=state.scope==='local_history';
    E('multi-province').disabled=state.scope==='provincial';
    E('multi-district-wrap').hidden=!history;
    E('multi-year').disabled=state.allYears||history;
    E('multi-all-years').disabled=history;
    E('multi-all-years').checked=history||state.allYears;
    E('multi-year-caption').textContent=history?'기초지자체 2014~2022 시계열':state.allYears?'2014~2022 전체 시점 통합':`${state.year}년 단일 시점`;
    E('multi-table-all').disabled=state.scope==='provincial';
    if(history){E('multi-province').value=state.province;}
  }
  function getData(){
    const rows=state.scope==='provincial'?provinces:municipalities;
    return rows.filter(r=>{
      if(state.scope==='municipal' && state.province!=='전국' && r.province!==state.province)return false;
      if(state.scope==='local_history' && !(r.province===state.province&&r.district===state.district))return false;
      if(!state.allYears&&state.scope!=='local_history'&&r.year!==state.year)return false;
      return r[state.mode]!=null && r.fertility!=null && r.rates?.[state.dtype]!=null;
    });
  }
  function obtainCurrent(){
    const region=currentRegion(),period=actualPeriod(),scope=state.scope,mode=state.mode;
    return selectModel(scope==='local_history'?historyModels:period==='전기간'?pooledModels:yearModels.get(period),scope,region,period,mode);
  }
  function prediction(row, m=current){
    return roundModel(m)?m.intercept+m.fiscal_coef*row[state.mode]+m.fertility_coef*row.fertility:null;
  }
  function describe(){
    const period=actualPeriod()==='전기간'?'2014~2022':`${state.year}년`;
    return `${state.dtype} · ${period} · ${state.scope==='municipal'?'기초 간':state.scope==='provincial'?'광역 간':'기초 시계열'} · ${label(current||{scope:state.scope,region:currentRegion()})} · 개편 ${state.mode==='after'?'후':'전'}`;
  }
  function stats(){
    Lab.text('multi-caption',describe());
    Lab.text('multi-chosen-type',state.dtype);
    Lab.text('multi-fiscal-title',`재정자립도 ↔ ${state.dtype} 등록률`);
    Lab.text('multi-birth-title',`합계출산율 ↔ ${state.dtype} 등록률`);
    Lab.text('multi-k-fiscal',fmt(current?.fiscal_coef,6));
    Lab.text('multi-k-birth',fmt(current?.fertility_coef,6));
    Lab.text('multi-k-intercept',fmt(current?.intercept,6));
    Lab.text('multi-k-r2',fmt(current?.r2,5));
    Lab.text('multi-k-adjr2',fmt(current?.adj_r2,5));
    Lab.text('multi-k-n',Lab.integer(current?.n||0));
    Lab.text('multi-p-fiscal',`p-값: ${pFmt(current?.p_fiscal)}`);
    Lab.text('multi-p-birth',`p-값: ${pFmt(current?.p_fertility)}`);
    Lab.text('multi-vif',`두 독립변수의 VIF: ${fmt(current?.vif,3)}`);
    Lab.text('multi-formula',roundModel(current)?
      `${state.dtype} 등록률(%) = ${fmt(current.intercept)} + (${fmt(current.fiscal_coef)}) × 재정자립도(0~1) + (${fmt(current.fertility_coef)}) × 합계출산율`:
      '선택된 관측치로 유효한 다중선형회귀 모형을 적합할 수 없습니다.');
    const ci=x=>x?`[${fmt(x[0],6)}, ${fmt(x[1],6)}]`:'—';
    Lab.text('multi-ci-fiscal',ci(current?.fiscal_ci));
    Lab.text('multi-ci-birth',ci(current?.fertility_ci));
    Lab.text('multi-model-p',pFmt(current?.p_model));
    const w=[];
    if(current?.warning)w.push(current.warning);
    if(current?.vif>5)w.push('두 설명변수의 VIF가 5를 넘습니다. 다중공선성에 주의하세요.');
    if(state.scope==='local_history')w.push('이 지자체의 반복 관측 9개를 사용하므로 표본이 작고 시간추세를 통제하지 않습니다.');
    if(state.allYears)w.push('연도 통합 OLS는 지역별 반복관측과 연도·지역 고정효과를 통제하지 않습니다.');
    w.push('이 회귀는 동시기 지역 상관관계입니다. 합계출산율은 전체 연령의 장애등록인원에 대한 출생 코호트 변수가 아닙니다. 인과관계로 해석하지 마세요.');
    Lab.text('multi-warning',w.join(' '));
  }
  function scatter(key,chartId){
    const isFiscal=key==='fiscal';
    const value=r=>isFiscal?r[state.mode]:r.fertility;
    const other=r=>isFiscal?r.fertility:r[state.mode];
    const otherCoef=roundModel(current)?(isFiscal?current.fertility_coef:current.fiscal_coef):0;
    const mean=visibleRows.reduce((s,r)=>s+other(r),0)/(visibleRows.length||1);
    const pts=visibleRows.map(r=>{
      const y=r.rates[state.dtype];return {x:value(r),y:y-otherCoef*(other(r)-mean),
        original:y,predicted:prediction(r),province:r.province,district:r.district,year:r.year,
        fiscal:r[state.mode],fertility:r.fertility};
    });
    const xs=pts.map(r=>r.x);
    const xmin=xs.length?Math.min(...xs):0,xmax=xs.length?Math.max(...xs):1;
    const line=roundModel(current)?[
      {x:xmin,y:current.intercept+(isFiscal?current.fertility_coef:current.fiscal_coef)*mean+
        (isFiscal?current.fiscal_coef:current.fertility_coef)*xmin},
      {x:xmax,y:current.intercept+(isFiscal?current.fertility_coef:current.fiscal_coef)*mean+
        (isFiscal?current.fiscal_coef:current.fertility_coef)*xmax}
    ]:[];
    Lab.setChart(chartId,{type:'scatter',data:{datasets:[
      {label:'관측치 (다른 독립변수 보정)',data:pts,pointRadius:state.allYears?3:4,
       pointHoverRadius:7,pointBackgroundColor:'rgba(33,140,136,.58)',backgroundColor:'rgba(33,140,136,.58)',borderColor:'#fff',pointBorderWidth:.5},
      {type:'line',label:'조건부 예측선',data:line,pointRadius:0,borderWidth:2.8,
       borderColor:'#e59a5c',backgroundColor:'#e59a5c',order:0}
    ]},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{intersect:true,mode:'nearest'},
      plugins:{legend:{display:false},tooltip:{callbacks:{
        title:items=>items[0]?.raw?.province?`${items[0].raw.province} · ${items[0].raw.district}`:'모형 조건부 예측선',
        label:ctx=>{const r=ctx.raw;if(!r?.province)return `조건부 예측 등록률: ${fmt(ctx.parsed.y,6)}%`;
          return [`${r.year}년 · ${state.dtype} 장애유형`,
            `원래 등록률: ${fmt(r.original,6)}%`,`보정 등록률: ${fmt(r.y,6)}%`,
            `재정자립도: ${fmt(r.fiscal,4)} (0~1)`,`합계출산율: ${fmt(r.fertility,3)}명`,
            `다중회귀 예측값: ${fmt(r.predicted,6)}%`];}
      }}},
      scales:{x:{type:'linear',title:{display:true,text:isFiscal?'재정자립도 (0~1)':'합계출산율 (명/여성)',color:'#637386'},grid:{color:'#edf0f4'},ticks:{color:'#8091a3'}},
              y:{title:{display:true,text:'보정 장애유형별 등록률 (%)',color:'#637386'},grid:{color:'#edf0f4'},ticks:{color:'#8091a3'}}}}
    });
  }
  function trends(){
    if(state.scope==='local_history'){
      for(const k of ['fiscal_coef','fertility_coef','intercept','r2','p_fiscal','p_fertility'])
        Lab.trend(`multi-trend-${k}`,Array(9).fill(null),k,k);
      Lab.text('multi-trend-note','개별 기초지자체는 연도당 한 관측치이므로 해당 지역 자체의 연도별 횡단면 다중회귀를 계산할 수 없습니다. 상단 모형은 9개년 시계열 OLS입니다.');
      return;
    }
    const group=years.map(y=>selectModel(yearModels.get(y),state.scope,currentRegion(),y,state.mode));
    for(const [key,title] of [['fiscal_coef','재정자립도 계수 β₁'],['fertility_coef','출산율 계수 β₂'],
      ['intercept','절편 β₀'],['r2','결정계수 R²'],['p_fiscal','재정자립도 p-값'],['p_fertility','출산율 p-값']]){
      Lab.trend(`multi-trend-${key}`,group,key,title);
    }
    Lab.text('multi-trend-note','각 연도는 해당 연도의 동일 단위 관측치만으로 재적합한 모형입니다. 3개 이상의 설명계수(절편 포함) 추정에 필요한 유효 표본이 4개 미만이면 추이는 공란입니다.');
  }
  function tableModels(){
    if(state.scope==='local_history'){
      return historyModels.filter(m=>(state.allTypes || m.type===state.dtype) && m.mode===state.mode &&
        (state.tableAll || m.region===currentRegion()) &&
        (state.tableAll && state.province!=='전국'?m.region.startsWith(state.province+'|'):true));
    }
    const source=state.allYears?[...years.flatMap(y=>yearModels.get(y)),...pooledModels]:yearModels.get(state.year);
    return source.filter(m=>(state.allTypes || m.type===state.dtype) && m.mode===state.mode && m.scope===state.scope &&
      (state.tableAll || m.region===currentRegion()));
  }
  function buildTable(){
    allTable=tableModels();
    displayedTable=allTable.filter(m=>(`${m.type} ${m.region} ${m.year} ${m.scope} ${m.warning||''}`).toLowerCase().includes(state.search));
    const chunk=displayedTable.slice(state.page*20,(state.page+1)*20);
    const totalPages=Math.max(1,Math.ceil(displayedTable.length/20));
    if(state.page>=totalPages){state.page=totalPages-1;return buildTable();}
    const rows=chunk.map(m=>{
      const usable=roundModel(m);
      return `<tr title="${esc(m.type)} · ${esc(label(m))} · ${esc(m.year)} · ${esc(m.warning||'다중회귀 결과')}">
       <td>${esc(m.year)}</td><td>${esc(m.type)}</td><td>${m.scope==='municipal'?'기초 간':m.scope==='provincial'?'광역 간':'기초 시계열'}</td>
       <td>${esc(label(m))}</td><td class="num">${m.n}</td>
       <td class="num">${fmt(m.fiscal_coef)}</td><td class="num">${pFmt(m.p_fiscal)}</td>
       <td class="num">${fmt(m.fertility_coef)}</td><td class="num">${pFmt(m.p_fertility)}</td>
       <td class="num">${fmt(m.intercept)}</td><td class="num">${fmt(m.r2,5)}</td><td class="num">${fmt(m.adj_r2,5)}</td>
       <td><button class="model-link" data-model="${esc(keyOf(m))}">${usable?'Raw 열기':'불가 사유'}</button></td></tr>`;
    });
    E('multi-model-rows').innerHTML=rows.join('')||'<tr><td colspan="13">표시할 모형이 없습니다.</td></tr>';
    Lab.text('multi-table-count',`${displayedTable.length.toLocaleString()}개 모형 (유효 ${displayedTable.filter(roundModel).length.toLocaleString()}개)`);
    Lab.text('multi-table-summary',`${state.allYears?'연도별 + 시점 통합':`${state.year}년`} · 개편 ${state.mode==='after'?'후':'전'}`);
    Lab.text('multi-page',`${state.page+1} / ${totalPages}`);
    E('multi-prev').disabled=state.page===0;E('multi-next').disabled=state.page+1>=totalPages;
    E('multi-model-rows').querySelectorAll('button[data-model]').forEach(btn=>btn.addEventListener('click',()=>{
      const m=chunk.find(m=>keyOf(m)===btn.dataset.model);if(m)showRaw(m,true);
    }));
  }
  function observationCsvRows(){
    return visibleRows.map(r=>{
      const pred=prediction(r);return [r.year,r.province,r.district,r.population,r.counts?.[state.dtype]??'',
        r.rates[state.dtype],r[state.mode],r.fertility,pred,pred==null?null:r.rates[state.dtype]-pred];
    });
  }
  const obsHeader=()=>['연도','광역지자체','기초지자체','인구',`${state.dtype} 등록인원`,`${state.dtype} 등록률(%)`,
                    '재정자립도(0~1)','합계출산율(명/여성)','모형 예측 등록률(%)','잔차(%p)'];
  function observations(){
    const src=observationCsvRows();
    const tr=src.slice(0,50).map(r=>`<tr title="${esc(r[1])} · ${esc(r[2])}"><td>${r[0]}</td>
       <td>${esc(r[1])}</td><td>${esc(r[2])}</td><td class="num">${Lab.integer(r[3])}</td>
       <td class="num">${Lab.integer(r[4])}</td><td class="num">${fmt(r[5])}</td>
       <td class="num">${fmt(r[6],3)}</td><td class="num">${fmt(r[7],3)}</td>
       <td class="num">${fmt(r[8])}</td><td class="num">${fmt(r[9])}</td></tr>`);
    E('multi-observation-rows').innerHTML=tr.join('')||'<tr><td colspan="10">회귀에 사용할 수 있는 관측치가 없습니다.</td></tr>';
    Lab.text('multi-data-count',`${visibleRows.length.toLocaleString()}개 유효 관측치 표시 · 앞에서 최대 50개`);
  }
  function rawFilename(m){
    return `raw/MULTI_${m.scope==='local_history'?`local_history_${m.mode}`:m.year==='전기간'?`pooled_${m.mode}`:`${m.year}_${m.mode}`}.txt`;
  }
  function showRaw(m,expanded){
    selectedRaw=m;
    Lab.text('multi-raw-title',`${m.type} · ${label(m)} / ${m.year} / 개편 ${m.mode==='after'?'후':'전'} — statsmodels Raw`);
    Lab.text('multi-raw-hint',m.warning||'statsmodels.OLS 결과의 원문 summary()를 그대로 보존했습니다.');
    E('multi-raw').textContent=m.raw||m.warning||'원문 결과가 없습니다.';
    E('multi-raw').hidden=!expanded;
    E('multi-toggle-raw').textContent=expanded?'Raw 출력 접기':'Raw 출력 펼치기';
    Lab.text('multi-raw-file',m.raw?`전체 Raw 텍스트: ${rawFilename(m)}`:'이 모형은 원본 Raw가 생성되지 않았습니다.');
    if(expanded)E('multi-raw').scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  function refresh(){
    visibleRows=getData();current=obtainCurrent();
    stats();scatter('fiscal','multi-fiscal-scatter');scatter('birth','multi-birth-scatter');
    trends();buildTable();observations();showRaw(current||{scope:state.scope,region:currentRegion(),year:actualPeriod(),mode:state.mode,type:state.dtype,warning:'모형이 없습니다.'},false);
  }
  try{
    [meta,municipalities,provinces]=await Promise.all([
      Lab.load('data/meta.json'),Lab.load('data/municipalities.json'),Lab.load('data/provinces.json')]);
    const available=meta.provinces;
    Lab.fill('multi-type',meta.types);E('multi-type').value=state.dtype;
    Lab.fill('multi-province',available,['전국','전국']);
    state.province='전국';
    const yearly=await Promise.all(years.flatMap(y=>['before','after'].map(mode=>Lab.load(modelFile(y,mode)))));
    yearModels=new Map();
    years.forEach((y,i)=>['before','after'].forEach((mode,j)=>yearModels.set(`${y}_${mode}`,yearly[i*2+j])));
    // convenience map with selected reform when the selector changes
    let fullYear=yearModels;
    yearModels={get:y=>fullYear.get(`${y}_${state.mode}`)};
    [pooledModels,historyModels]=await Promise.all([Lab.load('data/multi_models_pooled.json'),Lab.load('data/multi_models_local_history.json')]);
    function updateScope(){
      if(state.scope==='local_history'&&state.province==='전국'){
        state.province=available[0];E('multi-province').value=state.province;
      }
      setDistrict();sync();state.page=0;refresh();
    }
    E('multi-type').addEventListener('change',()=>{state.dtype=E('multi-type').value;state.page=0;refresh();});
    E('multi-types-all').addEventListener('change',()=>{state.allTypes=E('multi-types-all').checked;state.page=0;buildTable();});
    E('multi-scope').addEventListener('change',()=>{state.scope=E('multi-scope').value;updateScope();});
    E('multi-province').addEventListener('change',()=>{
      state.province=E('multi-province').value;setDistrict();state.page=0;refresh();
    });
    E('multi-district').addEventListener('change',()=>{state.district=E('multi-district').value;state.page=0;refresh();});
    E('multi-mode').addEventListener('change',()=>{state.mode=E('multi-mode').value;state.page=0;refresh();});
    E('multi-year').addEventListener('input',()=>{state.year=Number(E('multi-year').value);state.page=0;sync();refresh();});
    E('multi-all-years').addEventListener('change',()=>{state.allYears=E('multi-all-years').checked;state.page=0;sync();refresh();});
    E('multi-table-all').addEventListener('change',()=>{state.tableAll=E('multi-table-all').checked;state.page=0;buildTable();});
    E('multi-search').addEventListener('input',()=>{state.search=E('multi-search').value.trim().toLowerCase();state.page=0;buildTable();});
    E('multi-prev').addEventListener('click',()=>{state.page=Math.max(0,state.page-1);buildTable();});
    E('multi-next').addEventListener('click',()=>{state.page++;buildTable();});
    E('multi-toggle-raw').addEventListener('click',()=>{
      const pre=E('multi-raw');pre.hidden=!pre.hidden;
      E('multi-toggle-raw').textContent=pre.hidden?'Raw 출력 펼치기':'Raw 출력 접기';
    });
    E('multi-export').addEventListener('click',()=>Lab.exportCsv(`disability_${state.dtype}_multivariate_models.csv`,
      ['연도','장애유형','분석단위','광역 또는 광역|기초','재정자립도기준','n','재정계수','재정p','출산율계수','출산율p','절편','R²','수정R²','전체모형p','VIF','불가사유'],
      displayedTable.map(m=>[m.year,m.type,m.scope,m.region,m.mode,m.n,m.fiscal_coef,m.p_fiscal,m.fertility_coef,m.p_fertility,m.intercept,m.r2,m.adj_r2,m.p_model,m.vif,m.warning])));
    E('multi-data-export').addEventListener('click',()=>Lab.exportCsv(`disability_${state.dtype}_multivariate_observations.csv`,obsHeader(),observationCsvRows()));
    setDistrict();sync();refresh();
  }catch(error){Lab.showError(error);}
})();
