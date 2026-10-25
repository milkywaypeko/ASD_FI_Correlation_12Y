'use strict';
const Lab = (() => {
  const cache = new Map();
  const charts = new Map();
  const URL_PARAMS = new URLSearchParams(location.search);
  async function load(path) {
    if (!cache.has(path)) cache.set(path, fetch(path).then(r => {
      if (!r.ok) throw new Error(`${r.status} - ${path}`);
      return r.json();
    }));
    return cache.get(path);
  }
  function text(id, value) { const x = document.getElementById(id); if(x) x.textContent = value; }
  function opt(select, value, label) { const o = document.createElement('option'); o.value=value; o.textContent=label; select.add(o); }
  function fill(id, values, first=null) {
    const select=document.getElementById(id);if(!select)return;
    const old=select.value;select.innerHTML='';
    if(first) opt(select, first[0], first[1]);
    values.forEach(v => opt(select, v, v));
    if([...select.options].some(x=>x.value===old)) select.value=old;
  }
  function numeric(x,digits=4) {
    if (x==null || !Number.isFinite(Number(x))) return '—';
    return Number(x).toLocaleString('ko-KR',{maximumFractionDigits:digits,minimumFractionDigits:Math.min(2,digits)});
  }
  function pvalue(x) {
    if(x==null || !Number.isFinite(Number(x))) return '—';
    if(x === 0) return '<1e-300';
    if(x < 0.0001) return Number(x).toExponential(2);
    return Number(x).toFixed(4);
  }
  function integer(x) { return x==null?'—':Number(x).toLocaleString('ko-KR'); }
  function models(year, mode) {return load(`data/models_${year}_${mode}.json`);}
  function modelOf(items,scope,region,year,dtype,mode) {
    return items.find(m=>m.scope===scope&&m.region===region&&String(m.year)===String(year)&&m.type===dtype&&m.mode===mode);
  }
  function destroyChart(id) {if(charts.has(id)){ charts.get(id).destroy(); charts.delete(id);}}
  function setChart(id,config) {
    destroyChart(id);
    if(typeof Chart==='undefined'){text('scatter-status','Chart.js 로딩에 실패했습니다. 인터넷 연결을 확인하세요.');return;}
    const canvas=document.getElementById(id);if(!canvas)return;
    charts.set(id,new Chart(canvas,config));
  }
  function colors() {return {teal:'#218c88',orange:'#e59a5c',grid:'#edf0f4',font:'#8292a3'};}
  function trend(id,items,key,title) {
    const c=colors();
    const series=items.map(m=>m&&m[key]!==null?m[key]:null);
    setChart(id,{type:'line',data:{labels:Array.from({length:9},(_,i)=>String(2014+i)),datasets:[{
      label:title,data:series,borderColor:c.teal,backgroundColor:c.teal,pointBackgroundColor:c.teal,
      borderWidth:2,pointRadius:4,pointHoverRadius:7,tension:.18,spanGaps:false
    }]},options:{responsive:true,maintainAspectRatio:false,animation:false,
      interaction:{mode:'nearest',intersect:false},
      plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${title}: ${key==='p'?pvalue(ctx.parsed.y):numeric(ctx.parsed.y,6)}`}}},
      scales:{x:{grid:{display:false},ticks:{color:c.font,font:{size:10}}},y:{grid:{color:c.grid},ticks:{color:c.font,font:{size:10},callback:v=>numeric(v,4)}}}}});
  }
  function exportCsv(filename,header,rows) {
    const safe=v=>'"'+String(v==null?'':v).replaceAll('"','""')+'"';
    const content='\ufeff'+[header,...rows].map(row=>row.map(safe).join(',')).join('\r\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
    a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
  }
  function showError(e) {
    console.error(e);
    let main=document.querySelector('main');
    if(main){const div=document.createElement('div');div.className='error-banner';div.textContent=`자료를 불러오지 못했습니다: ${e.message}. GitHub Pages 또는 python -m http.server로 열어 주세요.`;main.prepend(div);}
  }
  return {load,models,modelOf,text,opt,fill,numeric,pvalue,integer,setChart,trend,exportCsv,showError,URL_PARAMS};
})();
