'use strict';
(async () => {
  try {
    const [meta,municipalities,provinces] = await Promise.all([
      Lab.load('data/meta.json'),Lab.load('data/municipalities.json'),Lab.load('data/provinces.json')]);
    const E=id=>document.getElementById(id);
    const st={unit:'municipal',province:'전국',district:'',dtype:'전체',mode:'after',year:2022,allYears:false,page:0,search:''};
    const params=Lab.URL_PARAMS;
    if(['municipal','provincial','local_history'].includes(params.get('unit')))st.unit=params.get('unit');
    if(meta.provinces.includes(params.get('province')))st.province=params.get('province');
    if(meta.types.includes(params.get('dtype')))st.dtype=params.get('dtype');
    if(['before','after'].includes(params.get('mode')))st.mode=params.get('mode');
    if(meta.years.includes(Number(params.get('year'))))st.year=Number(params.get('year'));
    st.allYears=params.get('all')==='1';
    E('unit').value=st.unit;E('dtype').innerHTML='';meta.types.forEach(t=>Lab.opt(E('dtype'),t,t==='전체'?'전체 장애인':t));E('dtype').value=st.dtype;
    E('mode').value=st.mode;E('year').value=st.year;E('all-years').checked=st.allYears;
    Lab.fill('province',meta.provinces,['전국','전국 · 모든 광역']);E('province').value=st.province;
    function setDistricts(){
      const p=st.province==='전국'?'세종특별자치시':st.province;
      Lab.fill('district',meta.districts[p]||[]);
      if(params.has('district')&&[...E('district').options].some(o=>o.value===params.get('district'))) E('district').value=params.get('district');
      st.district=E('district').value;
    }
    setDistricts();
    function synchronizeControls(){
      const history=st.unit==='local_history';
      E('district-wrap').style.display=history?'flex':'none';
      E('province').disabled=st.unit==='provincial';
      if(history&&st.province==='전국'){st.province='서울특별시';E('province').value=st.province;setDistricts();}
      if(st.unit==='provincial'){st.province='전국';E('province').value='전국';}
      E('all-years').disabled=history;
      if(history) {st.allYears=true;E('all-years').checked=true;}
      E('year').disabled=st.allYears;
      Lab.text('year-caption',st.allYears?'2014–2022 통합 시점':`${st.year}년 단일 시점`);
    }
    synchronizeControls();
    for(const id of ['unit','province','district','dtype','mode','year','all-years']){
      E(id).addEventListener(id==='year'?'input':'change',async ()=>{
        st.unit=E('unit').value;
        st.province=E('province').value;
        st.dtype=E('dtype').value;st.mode=E('mode').value;
        st.year=Number(E('year').value);st.allYears=E('all-years').checked;
        if(id==='province'||id==='unit'){if(id==='province')setDistricts();}
        st.district=E('district').value;
        st.page=0;
        synchronizeControls();await render();
      });
    }
    E('search').addEventListener('input',()=>{st.search=E('search').value.trim().toLowerCase();st.page=0;renderTable();});
    E('point-prev').addEventListener('click',()=>{st.page=Math.max(0,st.page-1);renderTable();});
    E('point-next').addEventListener('click',()=>{st.page++;renderTable();});
    E('toggle-raw').addEventListener('click',()=>{const pre=E('raw-output');pre.hidden=!pre.hidden;E('toggle-raw').textContent=pre.hidden?'Raw 출력 펼치기':'Raw 출력 접기';});

    let view=[];
    let current=null;
    function getView(){
      const base=st.unit==='provincial'?provinces:municipalities;
      return base.filter(r=>{
        if(!st.allYears&&r.year!==st.year)return false;
        if(st.unit==='provincial')return true;
        if(st.province!=='전국'&&r.province!==st.province)return false;
        if(st.unit==='local_history'&&r.district!==st.district)return false;
        return true;
      }).filter(r=>r[st.mode]!=null&&r.rates[st.dtype]!=null);
    }
    function modelForSelection(items){
      const scope=st.unit,year=(st.allYears||st.unit==='local_history')?'전기간':st.year;
      const region=scope==='local_history'?`${st.province}|${st.district}`:scope==='provincial'?'전국':st.province;
      return Lab.modelOf(items,scope,region,year,st.dtype,st.mode);
    }
    async function getModel(){
      const items=st.unit==='local_history'?await Lab.load('data/models_local_history.json'):
          st.allYears?await Lab.load('data/models_pooled.json'):await Lab.models(st.year,st.mode);
      return modelForSelection(items);
    }
    function renderScatter(){
      const colors={teal:'#218c88',orange:'#e59a5c'};
      const points=view.map(r=>({x:r[st.mode],y:r.rates[st.dtype],province:r.province,district:r.district,year:r.year,count:r.counts[st.dtype]??r.disabled,missingTypes:r.missing_types||[]}));
      const xs=points.map(x=>x.x),min=Math.min(...xs),max=Math.max(...xs);
      const line=current?.slope!=null?[
        {x:min,y:current.intercept+current.slope*min},{x:max,y:current.intercept+current.slope*max}
      ]:[];
      Lab.setChart('scatter',{type:'scatter',data:{datasets:[
        {label:'관측 지자체',data:points,pointRadius:st.allYears?3:4,pointHoverRadius:7,
         backgroundColor:'rgba(33,140,136,0.54)',pointBorderColor:'#fff',pointBorderWidth:.5},
        {type:'line',label:'OLS 추정선',data:line,borderColor:colors.orange,backgroundColor:colors.orange,
         pointRadius:0,borderWidth:2.8,fill:false,order:0}
      ]},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'nearest',intersect:true},
        plugins:{legend:{display:false},tooltip:{callbacks:{
          title:items=>{const r=items[0]?.raw;return r?.province?`${r.province} · ${r.district}`:'OLS 추정선';},
          label:ctx=>{let r=ctx.raw;if(!r||!r.province)return `예측 등록률 ${Lab.numeric(ctx.parsed.y)}%`;
            return [`${r.year}년 · ${st.dtype==='전체'?'전체 장애인':st.dtype}`,
              `재정자립도 (${meta.modes[st.mode]}): ${Lab.numeric(ctx.parsed.x)}%`,
              `장애인 등록률: ${Lab.numeric(ctx.parsed.y,5)}%`, ...(r.missingTypes.length?['원본 장애유형 일부 공란: '+r.missingTypes.join(', ')]:[])];}
        }}},scales:{x:{type:'linear',title:{display:true,text:`재정자립도 (%, ${meta.modes[st.mode]})`,color:'#637386',font:{size:12}},
          grid:{color:'#eef1f5'},ticks:{color:'#8d9aab'}},y:{title:{display:true,text:`${st.dtype==='전체'?'전체 장애인':st.dtype} 등록률 (%)`,color:'#637386'},grid:{color:'#eef1f5'},ticks:{color:'#8d9aab'}}}}});
      const warning=current?.warning|| (current?.slope==null?'해당 조건에서는 유효한 OLS 모형을 계산할 수 없습니다.':'');
      Lab.text('scatter-status',`${view.length}개 관측치 표시. ${warning}`);
    }
    function renderTable(){
      const filtered=view.filter(r=>(r.province+' '+r.district+' '+r.year).toLowerCase().includes(st.search));
      const chunk=filtered.slice(st.page*15,(st.page+1)*15);
      E('point-rows').innerHTML=chunk.map(r=>`<tr title="${r.province} · ${r.district}"><td>${r.year}</td><td>${r.province}</td><td>${r.district}</td><td class="num">${Lab.integer(r.population)}</td><td class="num">${Lab.integer(st.dtype==='전체'?r.disabled:r.counts[st.dtype])}</td><td class="num">${Lab.numeric(r.rates[st.dtype],5)}</td><td class="num">${Lab.numeric(r[st.mode])}</td></tr>`).join('');
      Lab.text('point-count',`${filtered.length.toLocaleString()}개 관측치`);
      Lab.text('point-page',`${Math.min(st.page+1,Math.max(1,Math.ceil(filtered.length/15)))} / ${Math.max(1,Math.ceil(filtered.length/15))}`);
      E('point-prev').disabled=st.page===0;E('point-next').disabled=(st.page+1)*15>=filtered.length;
    }
    E('export-csv').addEventListener('click',()=>{
      Lab.exportCsv('disability_observations.csv',['연도','광역','기초','인구','장애유형','유형등록인원','등록률(%)',`재정자립도_${st.mode}(%)`],
        view.map(r=>[r.year,r.province,r.district,r.population,st.dtype,st.dtype==='전체'?r.disabled:r.counts[st.dtype],r.rates[st.dtype],r[st.mode]]));
    });
    async function renderTrends(){
      if(st.unit==='local_history'){
        ['slope','intercept','r2','p'].forEach(key=>Lab.trend('trend-'+key,Array(9).fill(null),key,key));
        Lab.text('trend-note','단일 기초지자체는 각 연도에 한 점만 있으므로 연도별 단면 회귀가 불가능합니다. 위 산점도와 핵심 계수는 해당 지자체 9개 연도 시계열 OLS입니다.');
        return;
      }
      const values=await Promise.all(meta.years.map(year=>Lab.models(year,st.mode)));
      const trend=values.map((ms,i)=>Lab.modelOf(ms,st.unit,st.unit==='provincial'?'전국':st.province,meta.years[i],st.dtype,st.mode));
      for(const [key,title] of [['slope','기울기'],['intercept','절편'],['r2','결정계수'],['p','p-값']])Lab.trend('trend-'+key,trend,key,title);
      Lab.text('trend-note','연도별 회귀는 해당 연도 안에서 별도로 적합합니다. 그래프의 빈 구간은 표본 수 부족, 고정된 X 또는 결측값으로 계산되지 않은 경우입니다.');
    }
    let sequence=0;
    async function render(){
      const ticket=++sequence;
      view=getView();const model=await getModel();if(ticket!==sequence)return;
      current=model;
      const val=k=>model?.[k];
      Lab.text('k-slope',Lab.numeric(val('slope'),6));
      Lab.text('k-intercept',Lab.numeric(val('intercept'),5));
      Lab.text('k-r2',Lab.numeric(val('r2'),5));
      Lab.text('k-p',Lab.pvalue(val('p')));
      Lab.text('n-label',`표본 수 n = ${model?.n??0}`);
      const year=st.allYears?'2014–2022 통합':`${st.year}년`;
      Lab.text('model-caption',`${year} · ${st.unit==='municipal'?'기초':st.unit==='provincial'?'광역':'개별 시계열'} 단위 · ${st.province}`);
      Lab.text('scatter-description',`${st.dtype==='전체'?'전체 장애인':st.dtype} · ${meta.modes[st.mode]} · ${year} · ${st.province}`);
      E('raw-output').textContent=model?.raw||model?.warning||'해당 회귀 결과가 없습니다.';
      Lab.text('raw-note',model?.raw?`텍스트 파일: raw/OLS_${st.unit==='local_history'?'local_history_'+st.mode:st.allYears?'pooled_'+st.mode:st.year+'_'+st.mode}.txt`:'유효 표본 부족 또는 X값 고정으로 OLS 결과가 없습니다.');
      renderScatter();renderTable();await renderTrends();
      if(ticket!==sequence)return;
    }
    await render();
  }catch(e){Lab.showError(e);}
})();
