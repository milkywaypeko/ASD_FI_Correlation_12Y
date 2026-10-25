'use strict';
/* Chart.js displays Python statsmodels results; the browser never refits OLS. */
(async () => {
  const $ = id => document.getElementById(id);
  const num = (v, d=6) => Lab.numeric(v,d);
  const prob = v => Lab.pvalue(v);
  const years = Array.from({length:9},(_,i)=>2014+i);
  const state = {scope:'municipal',province:'전국',district:'',mode:'after',year:2022,
                 allYears:false,tableAll:false,search:'',page:0};
  let meta, municipal=[], provincial=[], yearly=new Map(), pooled=[], histories=[];
  let points=[], current=null, tableRows=[];
  const esc = s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtRegion = m=>m?.scope==='local_history'?m.region.replace('|',' · '):m?.region||'전국';
  const scopeLabel = s=>({municipal:'기초 간',provincial:'광역 간',local_history:'기초 시계열'}[s]||s);
  const modeLabel = m=>m==='before'?'개편 전':'개편 후';
  const regionKey = ()=>state.scope==='provincial'?'전국':state.scope==='local_history'?`${state.province}|${state.district}`:state.province;
  const period = ()=>state.allYears||state.scope==='local_history'?'전기간':state.year;
  const modelOf = (items,scope,region,year)=>items?.find(m=>m.mode===state.mode&&m.scope===scope&&m.region===region&&String(m.year)===String(year))||null;
  const fitted = m=>m?.slope!=null&&m?.intercept!=null;
  const valid = r=>r?.fertility!=null&&r?.[state.mode]!=null&&Number.isFinite(r.fertility)&&Number.isFinite(r[state.mode]);
  function districts(){
    const select=$('fb-district');select.replaceChildren();
    (meta.districts[state.province]||[]).forEach(d=>Lab.opt(select,d,d));
    if([...select.options].some(o=>o.value===state.district))select.value=state.district;
    state.district=select.value||'';
  }
  function sync(){
    const history=state.scope==='local_history';
    $('fb-province').disabled=state.scope==='provincial';
    $('fb-district-wrap').hidden=!history;
    $('fb-all-years').checked=state.allYears||history;
    $('fb-all-years').disabled=history;
    $('fb-year').disabled=state.allYears||history;
    $('fb-year').value=String(state.year);
    Lab.text('fb-year-caption',history?'2014~2022 기초 시계열':state.allYears?'2014~2022 전체 기간 통합':`${state.year}년 단일 시점`);
    $('fb-table-all').disabled=state.scope==='provincial';
  }
  function getRows(){
    return (state.scope==='provincial'?provincial:municipal).filter(r=>{
      if(state.scope==='municipal'&&state.province!=='전국'&&r.province!==state.province)return false;
      if(state.scope==='local_history'&&(r.province!==state.province||r.district!==state.district))return false;
      if(!state.allYears&&state.scope!=='local_history'&&r.year!==state.year)return false;
      return valid(r);
    });
  }
  function getModel(){return modelOf(state.scope==='local_history'?histories:period()==='전기간'?pooled:yearly.get(state.year),
                                     state.scope,regionKey(),period());}
  function predict(r,m=current){return fitted(m)?m.intercept+m.slope*r[state.mode]:null;}
  function statistics(){
    const label=period()==='전기간'?'2014~2022':`${state.year}년`;
    Lab.text('fb-caption',`${modeLabel(state.mode)} · ${label} · ${scopeLabel(state.scope)} · ${fmtRegion(current||{region:regionKey(),scope:state.scope})}`);
    Lab.text('fb-k-slope',num(current?.slope));Lab.text('fb-k-intercept',num(current?.intercept));
    Lab.text('fb-k-r2',num(current?.r2,5));Lab.text('fb-adj-r2',`수정 R²: ${num(current?.adj_r2,5)}`);
    Lab.text('fb-k-p',prob(current?.p));Lab.text('fb-k-n',`유효 표본: ${Lab.integer(current?.n||0)}`);
    Lab.text('fb-formula',fitted(current)?`합계출산율(명/여성) = ${num(current.intercept)} + (${num(current.slope)}) × 재정자립도(0~1)`:'선택 조건에서 회귀를 적합할 수 없습니다.');
    Lab.text('fb-ci',current?.slope_ci?`[${num(current.slope_ci[0])}, ${num(current.slope_ci[1])}]`:'—');
    Lab.text('fb-unit',fitted(current)?`재정자립도 0.1 증가 시 추정 출산율 ${num(current.slope*0.1)}명 변화`: '재정자립도 0.1 증가당 추정 출산율 변화: —');
    const warnings=[];
    if(current?.warning)warnings.push(current.warning);
    if(state.scope==='local_history')warnings.push('한 지자체의 9개 시계열 관측치이므로 공통 시간 추세를 주의하세요.');
    if(state.allYears)warnings.push('통합 9개년 OLS는 지역 반복관측과 연도효과를 보정하지 않습니다.');
    warnings.push('지역 간 동시기 상관관계로, 인과관계 또는 정책효과가 아닙니다.');
    Lab.text('fb-warning',warnings.join(' '));
  }
  function scatter(){
    const obs=points.map(r=>({x:r[state.mode],y:r.fertility,province:r.province,district:r.district,year:r.year}));
    const xs=obs.map(r=>r.x);
    const line=fitted(current)&&xs.length?[{x:Math.min(...xs),y:current.intercept+current.slope*Math.min(...xs)},
                                      {x:Math.max(...xs),y:current.intercept+current.slope*Math.max(...xs)}]:[];
    Lab.setChart('fb-scatter',{type:'scatter',data:{datasets:[
      {label:'지자체 관측치',data:obs,pointRadius:state.allYears?3:4,pointHoverRadius:7,pointBackgroundColor:'rgba(33,140,136,.59)',pointBorderColor:'#fff',pointBorderWidth:.6},
      {type:'line',label:'statsmodels OLS 회귀선',data:line,borderColor:'#e59a5c',backgroundColor:'#e59a5c',pointRadius:0,borderWidth:3,order:0}
    ]},options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false},tooltip:{callbacks:{
      title:items=>items[0]?.raw?.province?`${items[0].raw.province} · ${items[0].raw.district}`:'OLS 예측선',
      label:ctx=>{const r=ctx.raw;return r?.province?[
        `${r.year}년 · 재정자립도(${modeLabel(state.mode)}): ${num(r.x,4)} (0~1)`,
        `합계출산율: ${num(r.y,3)}명/여성`
      ]:`OLS 예측 합계출산율: ${num(ctx.parsed.y,5)}명/여성`;}
    }}},scales:{x:{type:'linear',title:{display:true,text:`재정자립도 (${modeLabel(state.mode)}, 0~1)`},grid:{color:'#edf0f4'}},
                 y:{title:{display:true,text:'합계출산율 (명/여성)'},grid:{color:'#edf0f4'}}}}});
    Lab.text('fb-scatter-status',`${obs.length.toLocaleString('ko-KR')}개 유효 관측치 · ${fitted(current)?'Python에서 추정한 OLS 선을 표시합니다.':'추정 가능한 선형회귀가 없습니다.'}`);
  }
  function trends(){
    const metrics=[['slope','기울기 β₁'],['intercept','절편 β₀'],['r2','결정계수 R²'],['p','기울기 p-값']];
    const m=state.scope==='local_history'?years.map(()=>null):years.map(y=>modelOf(yearly.get(y),state.scope,regionKey(),y));
    for(const [key,title] of metrics)Lab.trend(`fb-trend-${key}`,m,key,title);
    Lab.text('fb-trend-note',state.scope==='local_history'?'단일 기초지자체는 매년 관측치가 1개이므로 연도별 횡단면 기울기를 적합할 수 없습니다. 위 9년 시계열 OLS를 참고하세요.':'각 연도의 별도 단순 OLS 회귀계수입니다. 지역별 표본이 부족하면 추이에서 빠집니다.');
  }
  function rawFilename(m){return `raw/FISCAL_BIRTH_${m.scope==='local_history'?'local_history':String(m.year)==='전기간'?'pooled':m.year}_${m.mode}.txt`;}
  function showRaw(model,open){
    const m=model||{scope:state.scope,region:regionKey(),year:period(),mode:state.mode,warning:'선택된 모형이 없습니다.'};
    Lab.text('fb-raw-title',`${modeLabel(m.mode)} · ${fmtRegion(m)} · ${m.year} · statsmodels OLS`);
    Lab.text('fb-raw-hint',m.warning||'statsmodels.OLS(...).fit().summary() 원문');
    $('fb-raw').textContent=m.raw||m.warning||'Raw 출력이 없습니다.';
    $('fb-raw').hidden=!open;$('fb-toggle-raw').textContent=open?'Raw 출력 접기':'Raw 출력 펼치기';
    const holder=$('fb-raw-file');holder.replaceChildren();
    if(m.raw){holder.append('전체 원문 텍스트 파일: ');const a=document.createElement('a');a.href=rawFilename(m);a.textContent=rawFilename(m);a.className='text-link';holder.append(a);}
    if(open)$('fb-raw').scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  function tableSource(){
    if(state.scope==='local_history')return histories.filter(m=>m.mode===state.mode&&(state.tableAll?m.region.startsWith(`${state.province}|`):m.region===regionKey()));
    const source=state.allYears?[...years.flatMap(y=>yearly.get(y)||[]),...pooled]:yearly.get(state.year)||[];
    return source.filter(m=>m.mode===state.mode&&m.scope===state.scope&&(state.tableAll||m.region===regionKey()));
  }
  function table(){
    tableRows=tableSource().filter(m=>`${m.year} ${m.region} ${m.scope} ${m.mode} ${m.warning||''}`.toLowerCase().includes(state.search));
    const pages=Math.max(1,Math.ceil(tableRows.length/20));state.page=Math.min(state.page,pages-1);
    const view=tableRows.slice(state.page*20,(state.page+1)*20);
    $('fb-model-rows').innerHTML=view.map((m,i)=>`<tr title="${esc(fmtRegion(m))} · ${esc(m.year)} · ${esc(m.warning||'추정 완료')}">
      <td>${esc(m.year)}</td><td>${modeLabel(m.mode)}</td><td>${scopeLabel(m.scope)}</td><td>${esc(fmtRegion(m))}</td>
      <td class="num">${m.n}</td><td class="num">${num(m.slope)}</td><td class="num">${num(m.intercept)}</td>
      <td class="num">${num(m.r2,5)}</td><td class="num">${num(m.adj_r2,5)}</td><td class="num">${prob(m.p)}</td>
      <td><button class="model-link" data-index="${state.page*20+i}" ${!m.raw?'disabled':''}>Raw 보기</button></td></tr>`).join('')||'<tr><td colspan="11">선택 조건에 해당하는 결과가 없습니다.</td></tr>';
    $('fb-model-rows').querySelectorAll('button[data-index]').forEach(btn=>btn.addEventListener('click',()=>showRaw(tableRows[Number(btn.dataset.index)],true)));
    Lab.text('fb-table-count',`${tableRows.length}개 모형 중 ${view.length}개 표시`);Lab.text('fb-page',`${state.page+1} / ${pages}`);
    $('fb-prev').disabled=state.page===0;$('fb-next').disabled=state.page>=pages-1;
    Lab.text('fb-table-summary',state.tableAll?'같은 기간의 모든 지역':'현재 선택된 지역');
  }
  function observationRows(){return points.map(r=>{const fit=predict(r);return [r.year,r.province,r.district,r[state.mode],r.fertility,fit,fit==null?null:r.fertility-fit];});}
  function observations(){
    const rows=observationRows();
    $('fb-observation-rows').innerHTML=rows.slice(0,60).map(r=>`<tr title="${esc(r[1])} · ${esc(r[2])}">
      <td>${r[0]}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td>
      <td class="num">${num(r[3],4)}</td><td class="num">${num(r[4],3)}</td><td class="num">${num(r[5],5)}</td><td class="num">${num(r[6],5)}</td></tr>`).join('')||'<tr><td colspan="7">유효 관측치가 없습니다.</td></tr>';
    Lab.text('fb-observation-count',`총 ${rows.length}개 · 산점도와 동일 표본`);
  }
  function refresh(){points=getRows();current=getModel();statistics();scatter();trends();table();observations();showRaw(current,false);}
  function scopeChange(){
    if(state.scope==='local_history'&&state.province==='전국'){state.province=meta.provinces[0];$('fb-province').value=state.province;}
    districts();state.page=0;sync();refresh();
  }
  try{
    [meta,municipal,provincial]=await Promise.all([Lab.load('data/meta.json'),Lab.load('data/municipalities.json'),Lab.load('data/provinces.json')]);
    const [allYear,combined,local]=await Promise.all([
      Promise.all(years.flatMap(y=>['before','after'].map(m=>Lab.load(`data/fiscal_birth_models_${y}_${m}.json`)))),
      Lab.load('data/fiscal_birth_models_pooled.json'),Lab.load('data/fiscal_birth_models_local_history.json')]);
    years.forEach((y,i)=>yearly.set(y,[...allYear[2*i],...allYear[2*i+1]]));pooled=combined;histories=local;
    Lab.fill('fb-province',meta.provinces,['전국','전국']);
    $('fb-scope').addEventListener('change',()=>{state.scope=$('fb-scope').value;scopeChange();});
    $('fb-province').addEventListener('change',()=>{state.province=$('fb-province').value;districts();state.page=0;refresh();});
    $('fb-district').addEventListener('change',()=>{state.district=$('fb-district').value;state.page=0;refresh();});
    $('fb-mode').addEventListener('change',()=>{state.mode=$('fb-mode').value;state.page=0;refresh();});
    $('fb-year').addEventListener('input',()=>{state.year=Number($('fb-year').value);state.page=0;sync();refresh();});
    $('fb-all-years').addEventListener('change',()=>{state.allYears=$('fb-all-years').checked;state.page=0;sync();refresh();});
    $('fb-table-all').addEventListener('change',()=>{state.tableAll=$('fb-table-all').checked;state.page=0;table();});
    $('fb-search').addEventListener('input',()=>{state.search=$('fb-search').value.trim().toLowerCase();state.page=0;table();});
    $('fb-prev').addEventListener('click',()=>{state.page--;table();});
    $('fb-next').addEventListener('click',()=>{state.page++;table();});
    $('fb-toggle-raw').addEventListener('click',()=>{const raw=$('fb-raw');raw.hidden=!raw.hidden;
      $('fb-toggle-raw').textContent=raw.hidden?'Raw 출력 펼치기':'Raw 출력 접기';});
    $('fb-model-export').addEventListener('click',()=>Lab.exportCsv(`fiscal_birth_${state.mode}_ols_models.csv`,
      ['연도','재정자립도 기준','분석단위','지역','표본n','기울기','절편','R²','수정R²','p값','95%CI하한','95%CI상한','추정불가 사유'],
      tableRows.map(m=>[m.year,m.mode,m.scope,m.region,m.n,m.slope,m.intercept,m.r2,m.adj_r2,m.p,m.slope_ci?.[0],m.slope_ci?.[1],m.warning])));
    $('fb-data-export').addEventListener('click',()=>Lab.exportCsv(`fiscal_birth_${state.mode}_observations.csv`,
      ['연도','광역지자체','기초지자체','재정자립도 (0~1)','합계출산율','예측 합계출산율','잔차'],observationRows()));
    districts();sync();refresh();
  }catch(err){Lab.showError(err);}
})();
