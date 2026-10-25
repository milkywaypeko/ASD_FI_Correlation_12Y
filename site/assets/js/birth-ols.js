'use strict';
/* The browser visualizes precomputed statsmodels OLS results. No fitting is done in JS. */
(async () => {
  const $ = id => document.getElementById(id);
  const num = (x, n=6) => Lab.numeric(x, n);
  const prob = x => Lab.pvalue(x);
  const years = Array.from({length:9},(_,i)=>2014+i);
  const st = {scope:'municipal', province:'전국', district:'', year:2022,
              dtype:'자폐성', allYears:false, tableAll:false, allTypes:false, search:'', page:0};
  let meta, municipal, provincial, yearly=new Map(), pooled=[], histories=[];
  let points=[], current=null, modelRows=[], selectedRows=[];
  const fmtRegion = m => m?.scope==='local_history'?m.region.replace('|',' · '):m?.region||'전국';
  const keyRegion = () => st.scope==='provincial'?'전국':st.scope==='local_history'?`${st.province}|${st.district}`:st.province;
  const period = () => st.allYears||st.scope==='local_history'?'전기간':st.year;
  const modelFor = (rows, scope, region, year) => rows?.find(m=>m.scope===scope&&m.region===region&&String(m.year)===String(year)&&m.type===st.dtype)||null;
  const hasFit = m => m?.slope!==null&&m?.slope!==undefined;
  const escape = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const scopeName = v => ({municipal:'기초 간',provincial:'광역 간',local_history:'기초 시계열'}[v]||v);

  function setDistrict(){
    const selector=$('birth-district');
    selector.replaceChildren();
    (meta.districts[st.province]||[]).forEach(d=>Lab.opt(selector,d,d));
    if([...selector.options].some(o=>o.value===st.district))selector.value=st.district;
    st.district=selector.value;
  }
  function synchronize(){
    const h=st.scope==='local_history';
    $('birth-province').disabled=st.scope==='provincial';
    $('birth-district-wrap').hidden=!h;
    $('birth-all-years').checked=st.allYears||h;
    $('birth-all-years').disabled=h;
    $('birth-year').disabled=st.allYears||h;
    Lab.text('birth-year-caption',h?'2014~2022 기초 시계열':st.allYears?'2014~2022 전체 기간 통합':`${st.year}년 단일 시점`);
    $('birth-table-all').disabled=st.scope==='provincial';
  }
  function getRows(){
    return (st.scope==='provincial'?provincial:municipal).filter(r=>{
      if(st.scope==='municipal'&&st.province!=='전국'&&r.province!==st.province)return false;
      if(st.scope==='local_history'&&(r.province!==st.province||r.district!==st.district))return false;
      if(!st.allYears&&st.scope!=='local_history'&&r.year!==st.year)return false;
      return r.fertility!==null&&r.fertility!==undefined&&r.rates?.[st.dtype]!==null&&r.rates?.[st.dtype]!==undefined;
    });
  }
  function getModel(){
    return modelFor(st.scope==='local_history'?histories:period()==='전기간'?pooled:yearly.get(st.year),
      st.scope,keyRegion(),period());
  }
  function predict(r,m=current){return hasFit(m)?m.intercept+m.slope*r.fertility:null;}
  function updateStats(){
    const label=period()==='전기간'?'2014~2022':`${st.year}년`;
    Lab.text('birth-chosen-type',st.dtype);
    Lab.text('birth-plot-title',`합계출산율과 ${st.dtype} 장애 등록률`);
    Lab.text('birth-caption',`${st.dtype} · ${label} · ${scopeName(st.scope)} · ${fmtRegion(current||{region:keyRegion(),scope:st.scope})}`);
    Lab.text('birth-k-slope',num(current?.slope));
    Lab.text('birth-k-intercept',num(current?.intercept));
    Lab.text('birth-k-r2',num(current?.r2,5));
    Lab.text('birth-adj-r2',`수정 결정계수: ${num(current?.adj_r2,5)}`);
    Lab.text('birth-k-p',prob(current?.p));
    Lab.text('birth-k-n',`유효 관측치: ${Lab.integer(current?.n||0)}`);
    Lab.text('birth-formula',hasFit(current)?`${st.dtype} 장애 등록률(%) = ${num(current.intercept)} + (${num(current.slope)}) × 합계출산율`:'이 선택 조건에는 추정 가능한 단순 OLS 모형이 없습니다.');
    Lab.text('birth-ci',current?.slope_ci?`[${num(current.slope_ci[0])}, ${num(current.slope_ci[1])}]`:'—');
    const notes=[];
    if(current?.warning)notes.push(current.warning);
    if(st.scope==='local_history')notes.push('단일 기초지자체 9개년 시계열이므로 표본 수와 공통 시간 추세에 주의하세요.');
    if(st.allYears)notes.push('9개년 통합 OLS는 지역별 반복관측 및 연도 효과를 보정하지 않습니다.');
    notes.push('합계출산율은 동일 연도 전체 연령대 장애등록자의 출생 코호트를 직접 나타내지 않습니다. 인과관계로 해석하지 마세요.');
    Lab.text('birth-warning',notes.join(' '));
  }
  function updateScatter(){
    const scatter=points.map(r=>({x:r.fertility,y:r.rates[st.dtype],province:r.province,
       district:r.district,year:r.year,count:r.counts?.[st.dtype],population:r.population}));
    const xs=scatter.map(r=>r.x);
    const line=hasFit(current)&&xs.length?[
      {x:Math.min(...xs),y:current.intercept+current.slope*Math.min(...xs)},
      {x:Math.max(...xs),y:current.intercept+current.slope*Math.max(...xs)}]:[];
    Lab.setChart('birth-scatter',{type:'scatter',data:{datasets:[
      {label:'관측치',data:scatter,pointRadius:st.allYears?3:4,pointHoverRadius:7,
       pointBackgroundColor:'rgba(33,140,136,.59)',pointBorderColor:'#fff',pointBorderWidth:.6},
      {type:'line',label:'단순 OLS 회귀선',data:line,borderColor:'#e59a5c',backgroundColor:'#e59a5c',
       pointRadius:0,borderWidth:3,order:0}
    ]},options:{responsive:true,maintainAspectRatio:false,animation:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{
        title:items=>{const r=items[0]?.raw;return r?.province?`${r.province} · ${r.district}`:'OLS 예측선';},
        label:context=>{const r=context.raw;return r?.province?[
          `${r.year}년 · 합계출산율: ${num(r.x,3)}명/여성`,
          `${st.dtype} 장애 등록률: ${num(r.y,6)}%`,
          `${st.dtype} 장애 등록인원: ${Lab.integer(r.count)}명`,
          `주민등록인구: ${Lab.integer(r.population)}명`
        ]:`예측 등록률: ${num(context.parsed.y,6)}%`;}
      }}},scales:{x:{type:'linear',title:{display:true,text:'합계출산율 (명/여성)',color:'#637386'},grid:{color:'#edf0f4'}},
           y:{title:{display:true,text:'선택 장애유형 등록률 (%)',color:'#637386'},grid:{color:'#edf0f4'}}}}});
    Lab.text('scatter-status',`${points.length.toLocaleString('ko-KR')}개 유효 관측치를 표시합니다. ${hasFit(current)?'Python statsmodels에서 계산한 OLS 계수로 회귀선을 그렸습니다.':'유효한 회귀선을 그릴 수 없습니다.'}`);
  }
  function updateTrends(){
    const metrics=[['slope','기울기 β₁'],['intercept','절편 β₀'],['r2','결정계수 R²'],['p','기울기 p-값']];
    if(st.scope==='local_history'){
      for(const [metric,label] of metrics)Lab.trend(`birth-trend-${metric}`,Array(9).fill(null),metric,label);
      Lab.text('birth-trend-note','단일 기초지자체의 한 연도에는 관측치가 한 개뿐이므로 해당 지자체의 연도별 횡단면 OLS는 계산할 수 없습니다. 위 요약은 9개년 시계열 회귀 결과입니다.');
      return;
    }
    const models=years.map(y=>modelFor(yearly.get(y),st.scope,keyRegion(),y));
    for(const [metric,label] of metrics)Lab.trend(`birth-trend-${metric}`,models,metric,label);
    Lab.text('birth-trend-note','각 연도의 동일 분석 단위로 개별 적합한 OLS 결과를 연결합니다. 유효 표본이 3개 미만인 연도는 그래프가 공란입니다.');
  }
  function rawFilename(m){return `raw/BIRTH_OLS_${m.scope==='local_history'?'local_history':String(m.year)==='전기간'?'pooled':m.year}.txt`;}
  function showRaw(m, open){
    if(!m)m={scope:st.scope,region:keyRegion(),year:period(),warning:'선택 조건에 해당하는 모델이 없습니다.'};
    Lab.text('birth-raw-title',`${m.type} · ${fmtRegion(m)} · ${m.year} · statsmodels OLS Raw`);
    Lab.text('birth-raw-hint',m.warning||'statsmodels.OLS(...).fit().summary() 전체 원문');
    $('birth-raw').textContent=m.raw||m.warning||'Raw 출력이 없습니다.';
    $('birth-raw').hidden=!open;
    $('birth-toggle-raw').textContent=open?'Raw 출력 접기':'Raw 출력 펼치기';
    const holder=$('birth-raw-file');holder.replaceChildren();
    if(m.raw){holder.append('해당 분류의 전체 Raw 파일: ');
      const link=document.createElement('a');link.href=rawFilename(m);link.textContent=rawFilename(m);link.className='text-link';holder.append(link);}
    if(open)$('birth-raw').scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  function tableSource(){
    if(st.scope==='local_history')return histories.filter(m=>(st.allTypes||m.type===st.dtype) && (st.tableAll ? m.region.startsWith(`${st.province}|`) : m.region===keyRegion()));
    const arr=st.allYears?[...years.flatMap(y=>yearly.get(y)||[]),...pooled]:yearly.get(st.year)||[];
    return arr.filter(m=>(st.allTypes||m.type===st.dtype)&&m.scope===st.scope&&(st.tableAll||m.region===keyRegion()));
  }
  function updateTable(){
    modelRows=tableSource().filter(m=>`${m.type} ${m.year} ${m.region} ${m.scope} ${m.warning||''}`.toLowerCase().includes(st.search));
    const pages=Math.max(1,Math.ceil(modelRows.length/20));
    st.page=Math.min(st.page,pages-1);
    const subset=modelRows.slice(st.page*20,(st.page+1)*20);
    $('birth-model-rows').innerHTML=subset.map(m=>`<tr title="${escape(m.type)} · ${escape(fmtRegion(m))} · ${escape(m.year)} · ${escape(m.warning||'OLS 적합 완료')}">
      <td>${escape(m.year)}</td><td>${escape(m.type)}</td><td>${scopeName(m.scope)}</td><td>${escape(fmtRegion(m))}</td>
      <td class="num">${m.n}</td><td class="num">${num(m.slope)}</td>
      <td class="num">${num(m.intercept)}</td><td class="num">${num(m.r2,5)}</td>
      <td class="num">${num(m.adj_r2,5)}</td><td class="num">${prob(m.p)}</td>
      <td><button class="model-link" data-raw-index="${modelRows.indexOf(m)}" ${!m.raw?'disabled':''}>Raw 보기</button></td></tr>`).join('')||'<tr><td colspan="11">선택 조건의 회귀 결과가 없습니다.</td></tr>';
    $('birth-model-rows').querySelectorAll('button[data-raw-index]').forEach(el=>el.addEventListener('click',()=>showRaw(modelRows[Number(el.dataset.rawIndex)],true)));
    Lab.text('birth-table-count',`${modelRows.length}개 모형 중 ${subset.length}개 표시`);
    Lab.text('birth-page',`${st.page+1} / ${pages}`);
    $('birth-prev').disabled=st.page===0;$('birth-next').disabled=st.page>=pages-1;
    Lab.text('birth-table-summary',st.tableAll?'선택 기간 내 같은 단위의 모든 지역':'현재 선택된 지역');
  }
  const dataHeader=()=>['연도','광역지자체','기초지자체','합계출산율',`${st.dtype} 장애인 등록인원`,'주민등록인구',`${st.dtype} 등록률 (%)`,'예측 등록률 (%)','잔차 (%p)'];
  function observationRows(){return points.map(r=>{
    const fitted=predict(r);return [r.year,r.province,r.district,r.fertility,r.counts?.[st.dtype],
      r.population,r.rates[st.dtype],fitted,fitted===null?null:r.rates[st.dtype]-fitted];
  });}
  function updateObservations(){
    const rows=observationRows();
    $('birth-observation-rows').innerHTML=rows.slice(0,60).map(r=>`<tr title="${escape(r[1])} · ${escape(r[2])}">
      <td>${r[0]}</td><td>${escape(r[1])}</td><td>${escape(r[2])}</td>
      <td class="num">${num(r[3],3)}</td><td class="num">${Lab.integer(r[4])}</td>
      <td class="num">${Lab.integer(r[5])}</td><td class="num">${num(r[6])}</td>
      <td class="num">${num(r[7])}</td><td class="num">${num(r[8])}</td></tr>`).join('')||'<tr><td colspan="9">해당 조건의 유효 관측치가 없습니다.</td></tr>';
    Lab.text('birth-observation-count',`총 ${rows.length}개 · 산점도와 동일한 분석 표본`);
  }
  function refresh(){
    points=getRows();current=getModel();
    updateStats();updateScatter();updateTrends();updateTable();updateObservations();showRaw(current,false);
  }
  function changeScope(){
    if(st.scope==='local_history'&&st.province==='전국'){
      st.province=meta.provinces[0];$('birth-province').value=st.province;
    }
    setDistrict();st.page=0;synchronize();refresh();
  }
  try{
    [meta,municipal,provincial]=await Promise.all([Lab.load('data/meta.json'),Lab.load('data/municipalities.json'),Lab.load('data/provinces.json')]);
    const [yrs,combined,local]=await Promise.all([
      Promise.all(years.map(y=>Lab.load(`data/birth_ols_models_${y}.json`))),
      Lab.load('data/birth_ols_models_pooled.json'),Lab.load('data/birth_ols_models_local_history.json')]);
    years.forEach((y,i)=>yearly.set(y,yrs[i]));pooled=combined;histories=local;
    Lab.fill('birth-province',meta.provinces,['전국','전국']);
    Lab.fill('birth-type',meta.types);$('birth-type').value=st.dtype;
    $('birth-type').addEventListener('change',()=>{st.dtype=$('birth-type').value;st.page=0;refresh();});
    $('birth-types-all').addEventListener('change',()=>{st.allTypes=$('birth-types-all').checked;st.page=0;updateTable();});
    $('birth-scope').addEventListener('change',()=>{st.scope=$('birth-scope').value;changeScope();});
    $('birth-province').addEventListener('change',()=>{st.province=$('birth-province').value;setDistrict();st.page=0;refresh();});
    $('birth-district').addEventListener('change',()=>{st.district=$('birth-district').value;st.page=0;refresh();});
    $('birth-year').addEventListener('input',()=>{st.year=Number($('birth-year').value);st.page=0;synchronize();refresh();});
    $('birth-all-years').addEventListener('change',()=>{st.allYears=$('birth-all-years').checked;st.page=0;synchronize();refresh();});
    $('birth-table-all').addEventListener('change',()=>{st.tableAll=$('birth-table-all').checked;st.page=0;updateTable();});
    $('birth-search').addEventListener('input',()=>{st.search=$('birth-search').value.trim().toLowerCase();st.page=0;updateTable();});
    $('birth-prev').addEventListener('click',()=>{st.page=Math.max(0,st.page-1);updateTable();});
    $('birth-next').addEventListener('click',()=>{st.page++;updateTable();});
    $('birth-toggle-raw').addEventListener('click',()=>{
      const raw=$('birth-raw');raw.hidden=!raw.hidden;
      $('birth-toggle-raw').textContent=raw.hidden?'Raw 출력 펼치기':'Raw 출력 접기';
    });
    $('birth-model-export').addEventListener('click',()=>Lab.exportCsv(`birth_${st.dtype}_ols_models.csv`,
      ['연도','장애유형','분석단위','지역','표본n','기울기','절편','R²','수정R²','기울기p','신뢰구간하한','신뢰구간상한','추정불가사유'],
      modelRows.map(m=>[m.year,m.type,m.scope,m.region,m.n,m.slope,m.intercept,m.r2,m.adj_r2,m.p,m.slope_ci?.[0],m.slope_ci?.[1],m.warning])));
    $('birth-data-export').addEventListener('click',()=>Lab.exportCsv(`birth_${st.dtype}_ols_observations.csv`,dataHeader(),observationRows()));
    setDistrict();synchronize();refresh();
  }catch(error){Lab.showError(error);}
})();
