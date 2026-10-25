'use strict';
(async () => {
  try {
    const meta=await Lab.load('data/meta.json');
    const E=id=>document.getElementById(id);
    const st={scope:'municipal',province:'전국',district:'',dtype:'전체',mode:'after',period:'yearly',sort:'year',page:0,search:''};
    const params=Lab.URL_PARAMS;
    if(meta.provinces.includes(params.get('province')))st.province=params.get('province');
    if(meta.types.includes(params.get('dtype')))st.dtype=params.get('dtype');
    if(['before','after'].includes(params.get('mode')))st.mode=params.get('mode');
    E('scope').value=st.scope;Lab.fill('province',meta.provinces,['전국','전국 · 모든 광역']);E('province').value=st.province;
    meta.types.forEach(t=>Lab.opt(E('dtype'),t,t==='전체'?'전체 장애인':t));E('dtype').value=st.dtype;E('mode').value=st.mode;
    function districtChoices(){
      const name=st.province==='전국'?'서울특별시':st.province;
      Lab.fill('district',meta.districts[name]||[]);st.district=E('district').value;
    }
    districtChoices();
    function sync(){
      const history=st.scope==='local_history';
      E('district-wrap').style.display=history?'flex':'none';
      E('province').disabled=st.scope==='provincial';
      if(history&&st.province==='전국'){st.province='서울특별시';E('province').value=st.province;districtChoices();}
      if(st.scope==='provincial'){st.province='전국';E('province').value='전국';}
      if(history){st.period='all';E('period').value='all';E('period').disabled=true;}else{E('period').disabled=false;}
      Lab.text('series-caption',`${st.dtype==='전체'?'전체 장애인':st.dtype} · ${meta.modes[st.mode]} · ${st.province}`);
    }
    sync();
    for(const id of ['scope','province','district','dtype','mode','period','sort']){
      E(id).addEventListener('change',async ()=>{
        st.scope=E('scope').value;st.province=E('province').value;st.dtype=E('dtype').value;
        st.mode=E('mode').value;st.period=E('period').value;st.sort=E('sort').value;
        if(id==='province')districtChoices();
        if(id==='scope'&&st.scope==='local_history')districtChoices();
        st.district=E('district').value;st.page=0;sync();await render();
      });
    }
    E('filter-text').addEventListener('input',()=>{st.search=E('filter-text').value.toLowerCase().trim();st.page=0;renderTable();});
    E('models-prev').addEventListener('click',()=>{st.page=Math.max(0,st.page-1);renderTable();});
    E('models-next').addEventListener('click',()=>{st.page++;renderTable();});
    const yearly=await Promise.all(meta.years.map(y=>Lab.models(y,st.mode)));
    const annualAll=yearly.flat();
    let displayed=[];
    let chosen=null;
    async function getFilteredModels(){
      const annual=st.mode==='after'?annualAll:(await Promise.all(meta.years.map(y=>Lab.models(y,st.mode)))).flat();
      const pooled=st.scope==='local_history'?
        await Lab.load('data/models_local_history.json'):await Lab.load('data/models_pooled.json');
      const base=st.period==='yearly'?annual:st.period==='all'?pooled:[...annual,...pooled];
      return base.filter(r=>r.mode===st.mode&&r.scope===st.scope&&r.type===st.dtype).filter(r=>{
        if(st.scope==='provincial')return r.region==='전국';
        if(st.scope==='local_history')return r.region===`${st.province}|${st.district}`;
        return st.province==='전국'||r.region===st.province;
      });
    }
    function matchingAnnual(){
      const raw=st.mode==='after'?annualAll:window.__annualBefore||[];
      return meta.years.map(year=>Lab.modelOf(raw,st.scope,
        st.scope==='provincial'?'전국':st.scope==='local_history'?`${st.province}|${st.district}`:st.province,
        year,st.dtype,st.mode));
    }
    function renderSeries(models){
      const valid=models.filter(m=>m?.slope!=null),significant=valid.filter(m=>m.p!=null&&m.p<.05);
      Lab.text('summary-total',Lab.integer(models.length));Lab.text('summary-valid',Lab.integer(valid.length));
      Lab.text('summary-sig',Lab.integer(significant.length));
      for(const [key,label] of [['slope','기울기'],['intercept','절편'],['r2','결정계수'],['p','p-값']])
        Lab.trend('result-'+key,models,key,label);
      Lab.text('series-warning',st.scope==='local_history'?'기초지자체 하나의 각 연도에는 관측치가 1개뿐이므로 연도별 횡단면 회귀계수를 그릴 수 없습니다. 선택한 기초지자체의 2014~2022 통합 회귀는 표에서 확인하세요.':'시점별 회귀의 결측 연도는 그래프에서 빈 곳으로 표시됩니다. 기울기 p-값과 R²는 모형별로 계산한 기술통계 결과입니다.');
    }
    function labelOf(m){return m.scope==='local_history'?m.region.replace('|',' · '):m.region;}
    function linkOf(m){
      const q=new URLSearchParams({unit:m.scope,province:m.region==='전국'?'전국':m.region.split('|')[0],dtype:m.type,mode:m.mode});
      if(m.scope==='local_history')q.set('district',m.region.split('|')[1]);
      if(m.year==='전기간')q.set('all','1');else q.set('year',String(m.year));
      return 'index.html?'+q.toString();
    }
    function details(m){
      chosen=m;
      Lab.text('detail-title',`${m.year} · ${labelOf(m)} · ${m.type}`);
      Lab.text('detail-hint',`단위: ${m.scope==='municipal'?'기초':m.scope==='provincial'?'광역':'기초 시계열'} · ${meta.modes[m.mode]} · 관측치 ${m.n}개`);
      E('detail-raw').hidden=false;
      E('detail-raw').textContent=m.raw||m.warning||'저장된 Raw 결과가 없습니다.';
      E('detail-explore').hidden=false;E('detail-explore').href=linkOf(m);
      E('detail-raw').scrollIntoView({behavior:'smooth',block:'nearest'});
    }
    function sorted(rows){
      return rows.sort((a,b)=>{
        if(st.sort==='region')return labelOf(a).localeCompare(labelOf(b),'ko') || String(a.year).localeCompare(String(b.year));
        if(st.sort==='r2')return (b.r2??-Infinity)-(a.r2??-Infinity);
        if(st.sort==='p')return (a.p??Infinity)-(b.p??Infinity);
        return String(a.year).localeCompare(String(b.year)) || labelOf(a).localeCompare(labelOf(b),'ko');
      });
    }
    function renderTable(){
      let searched=displayed.filter(m=>(String(m.year)+' '+labelOf(m)+' '+m.type).toLowerCase().includes(st.search));
      sorted(searched);
      const nPages=Math.max(1,Math.ceil(searched.length/18));st.page=Math.min(st.page,nPages-1);
      const chunk=searched.slice(st.page*18,(st.page+1)*18);
      E('model-rows').innerHTML=chunk.map((m,i)=>`<tr title="${labelOf(m)}"><td>${m.year}</td><td>${m.scope==='municipal'?'기초 간':m.scope==='provincial'?'광역 간':'시계열'}</td><td>${labelOf(m)}</td><td>${m.type}</td><td class="num">${m.n}</td><td class="num">${Lab.numeric(m.slope,6)}</td><td class="num">${Lab.numeric(m.intercept,5)}</td><td class="num">${Lab.numeric(m.r2,5)}</td><td class="num">${Lab.pvalue(m.p)}</td><td><button class="model-link" data-index="${i}">${m.raw?'Raw':'사유'}</button></td></tr>`).join('');
      E('model-rows').querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>details(chunk[Number(button.dataset.index)])));
      Lab.text('model-count',`${searched.length.toLocaleString()}개 분석 결과 / 회귀 불가도 표기`);
      Lab.text('models-page',`${st.page+1} / ${nPages}`);
      E('models-prev').disabled=st.page===0;E('models-next').disabled=st.page>=nPages-1;
    }
    E('results-csv').addEventListener('click',()=>{
      Lab.exportCsv('regression_results.csv',['연도','범위','지자체','장애유형','개편전후','n','기울기','절편','R2','p','특이사항'],
        displayed.map(m=>[m.year,m.scope,labelOf(m),m.type,m.mode,m.n,m.slope,m.intercept,m.r2,m.p,m.warning]));
    });
    let ticket=0;
    async function render(){
      const t=++ticket;displayed=await getFilteredModels();if(t!==ticket)return;
      if(st.mode==='before'&&!window.__annualBefore)window.__annualBefore=(await Promise.all(meta.years.map(y=>Lab.models(y,'before')))).flat();
      if(t!==ticket)return;
      sync();
      renderSeries(matchingAnnual());renderTable();
    }
    await render();
  }catch(e){Lab.showError(e);}
})();
