'use strict';
/* Interactive 3-D rendering of precomputed statsmodels OLS, NOT an extra fit.
 * x: fiscal independence 0..1; y: total fertility rate; z: observed disability rate %.
 * A convex-hull triangulated mesh restricts the regression plane to the observed
 * x/y support, rather than extrapolating into all four corners of a rectangle.
 */
(function (root) {
  const finite = v => v !== null && v !== undefined && Number.isFinite(Number(v));
  const nfmt = (x, digits) => Number(x).toLocaleString('ko-KR', {maximumFractionDigits:digits});

  function hull2D(points) {
    const unique = new Map();
    points.forEach(p => { if (finite(p.x) && finite(p.y)) unique.set(`${p.x}|${p.y}`, {x:p.x, y:p.y}); });
    const sorted = Array.from(unique.values()).sort((a,b) => a.x-b.x || a.y-b.y);
    if (sorted.length < 3) return [];
    const cross = (o,a,b) => (a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
    const lower=[],upper=[];
    sorted.forEach(p => {while(lower.length>=2 && cross(lower[lower.length-2],lower[lower.length-1],p)<=1e-12) lower.pop(); lower.push(p);});
    sorted.slice().reverse().forEach(p => {while(upper.length>=2 && cross(upper[upper.length-2],upper[upper.length-1],p)<=1e-12) upper.pop(); upper.push(p);});
    lower.pop();upper.pop();
    return lower.concat(upper);
  }

  function prepare(rows, model, type, mode, showPlane=true, colorByYear=true) {
    const pts=rows.filter(r => finite(r?.[mode]) && finite(r?.fertility) && finite(r?.rates?.[type]))
      .map(r=>({x:Number(r[mode]),y:Number(r.fertility),z:Number(r.rates[type]),
        year:Number(r.year),province:r.province,district:r.district}));
    const years=new Set(pts.map(r=>r.year));
    const colorYears=colorByYear && years.size>1;
    const points={
      type:'scatter3d',mode:'markers',name:'실제 장애인 등록률',
      x:pts.map(p=>p.x),y:pts.map(p=>p.y),z:pts.map(p=>p.z),
      customdata:pts.map(p=>[p.province,p.district,p.year]),
      marker:{size:pts.length>900?2.5:3.8,opacity:0.83,
        ...(colorYears?{color:pts.map(p=>p.year),colorscale:[[0,'#166c80'],[.5,'#39aa91'],[1,'#e59a5c']],
          cmin:2014,cmax:2022,showscale:true,colorbar:{title:{text:'연도'},thickness:11,len:.62,tickvals:[2014,2016,2018,2020,2022]}}
          :{color:'#218c88'}),line:{color:'#ffffff',width:0.3}},
      hovertemplate:'광역: %{customdata[0]}<br>기초: %{customdata[1]}<br>연도: %{customdata[2]}<br>재정자립도: %{x:.4f} (0~1)<br>합계출산율: %{y:.3f}<br><b>실제 등록률: %{z:.6f}%</b><extra>관측치</extra>'
    };
    const validModel=model && [model.intercept,model.fiscal_coef,model.fertility_coef].every(finite);
    let plane=null,hull=[];
    if (showPlane && validModel) {
      hull=hull2D(pts);
      if(hull.length>=3){
        const predict=(x,y)=>Number(model.intercept)+Number(model.fiscal_coef)*x+Number(model.fertility_coef)*y;
        const i=[],j=[],k=[];
        for(let t=1;t<hull.length-1;t++){i.push(0);j.push(t);k.push(t+1);}
        plane={type:'mesh3d',name:'OLS 회귀평면',
          x:hull.map(p=>p.x),y:hull.map(p=>p.y),z:hull.map(p=>predict(p.x,p.y)),
          i,j,k,opacity:0.42,color:'#e59a5c',flatshading:true,
          hovertemplate:'재정자립도: %{x:.4f}<br>합계출산율: %{y:.3f}<br><b>모형 예측 등록률: %{z:.6f}%</b><extra>OLS 회귀평면</extra>'};
      }
    }
    // Draw the plane first so the real observations remain identifiable.
    return {traces:[...(plane?[plane]:[]),points],n:pts.length,hasPlane:!!plane,modelValid:!!validModel,
      hullVertices:hull.length,yearsCount:years.size,colorYears};
  }

  function render({rows,model,type,mode,showPlane=true,colorByYear=true}) {
    const div=document.getElementById('multi-3d-plot');
    if(!div)return Promise.resolve();
    const status=document.getElementById('multi-3d-summary');
    if(typeof root.Plotly==='undefined'){
      div.textContent='3D 그래프를 불러오지 못했습니다. Plotly.js CDN 연결을 확인해 주세요. 기존 2D 그래프와 회귀 결과는 계속 사용할 수 있습니다.';
      if(status)status.textContent='3D 렌더링 라이브러리를 사용할 수 없습니다.';
      return Promise.resolve();
    }
    const result=prepare(rows,model,type,mode,showPlane,colorByYear);
    if(status){
      const period=result.yearsCount>1?'여러 연도 통합':'단일 연도';
      status.textContent=`실제 관측치 ${nfmt(result.n,0)}개 (${period}) · ${result.hasPlane?'반투명 주황색 면: statsmodels 다중회귀 예측평면':'OLS 예측평면 미표시'} · 점은 보정하지 않은 실제 등록률(%). `+
        (result.modelValid?'회귀평면은 관측된 재정자립도–출산율의 볼록껍질 안에서만 표시합니다.':'선택 표본에서 유효한 다중회귀를 추정하지 못했습니다. ') +
        ' 마우스로 회전·확대하거나 점에 올려 지역과 연도별 값을 확인할 수 있습니다.';
    }
    const axis={showbackground:true,backgroundcolor:'#f7f9fb',gridcolor:'#e2e9ef',
                showspikes:false,zerolinecolor:'#dde5ed',tickfont:{size:10,color:'#738297'}};
    const layout={
      margin:{l:0,r:0,t:4,b:0},paper_bgcolor:'#ffffff',
      font:{family:'Pretendard, Noto Sans KR, Apple SD Gothic Neo, sans-serif',color:'#405267'},
      showlegend:true,legend:{orientation:'h',x:0.01,y:1,xanchor:'left',yanchor:'top',font:{size:11}},
      scene:{xaxis:{...axis,title:{text:'재정자립도 (0~1)',font:{size:12}}},
        yaxis:{...axis,title:{text:'합계출산율 (명/여성)',font:{size:12}}},
        zaxis:{...axis,title:{text:`${type} 등록률 (%)`,font:{size:12}}},
        aspectmode:'cube',camera:{eye:{x:1.58,y:1.52,z:1.12}}},
      uirevision:'multi-3d-camera-v1'
    };
    try {
      return Promise.resolve(root.Plotly.react(div,result.traces,layout,{responsive:true,displaylogo:false,
        modeBarButtonsToRemove:['sendDataToCloud'],toImageButtonOptions:{format:'png',filename:'disability_multivariate_3d',height:850,width:1250,scale:1}}))
        .catch(e=>{div.textContent=`3D 그래프 렌더링 오류: ${e.message}`;if(status)status.textContent='3D 그래프 로딩에 실패했습니다. 다른 분석 결과에는 영향이 없습니다.';});
    } catch(e) {
      div.textContent=`3D 그래프 렌더링 오류: ${e.message}`;
      if(status)status.textContent='3D 그래프 로딩에 실패했습니다. 다른 분석 결과에는 영향이 없습니다.';
      return Promise.resolve();
    }
  }

  root.Multi3D={prepare,hull2D,render};
  if(typeof module!=='undefined'&&module.exports) module.exports={prepare,hull2D};
})(typeof window!=='undefined'?window:globalThis);
