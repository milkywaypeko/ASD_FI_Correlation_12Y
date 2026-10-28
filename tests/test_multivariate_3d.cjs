'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {prepare,hull2D}=require('../site/assets/js/multivariate-3d.js');
const read=f=>JSON.parse(fs.readFileSync(path.join(__dirname,'../site/data',f),'utf8'));
const rows=read('municipalities.json');
const models=read('multi_models_2022_after.json');
const autism=models.find(m=>m.scope==='municipal'&&m.region==='전국'&&m.year===2022&&m.type==='자폐성'&&m.mode==='after');
const sample=rows.filter(r=>r.year===2022 && r.after!=null && r.fertility!=null && r.rates?.['자폐성']!=null);

test('2022 data points are ACTUAL rates, not corrected rates or predictions',()=>{
  const p=prepare(sample,autism,'자폐성','after');
  assert.equal(p.n,228);
  assert.equal(p.traces[0].type,'mesh3d');
  const scatter=p.traces[1];
  assert.equal(scatter.type,'scatter3d');
  for(const [i,r] of sample.entries()){
    assert.equal(scatter.x[i],r.after);
    assert.equal(scatter.y[i],r.fertility);
    assert.equal(scatter.z[i],r.rates['자폐성']);
    assert.deepEqual(scatter.customdata[i],[r.province,r.district,r.year]);
  }
});

test('the surface Z is computed using the saved statsmodels OLS coefficients',()=>{
  const out=prepare(sample,autism,'자폐성','after');
  const plane=out.traces[0];
  assert.ok(out.hasPlane);
  assert.ok(out.hullVertices>=3);
  for(let i=0;i<plane.x.length;i++){
    const fitted=autism.intercept+autism.fiscal_coef*plane.x[i]+autism.fertility_coef*plane.y[i];
    assert.ok(Math.abs(fitted-plane.z[i])<1e-12);
  }
  assert.equal(plane.i.length,out.hullVertices-2);
});

test('both reform modes use selected 0-1 fiscal measure',()=>{
  const after=prepare(sample,autism,'자폐성','after',false).traces[0];
  const before=prepare(sample,autism,'자폐성','before',false).traces[0];
  assert.equal(after.x[0],sample[0].after);
  assert.equal(before.x[0],sample[0].before);
  assert.notEqual(after.x[0],before.x[0]);
  assert.equal(after.z[0],before.z[0]);
});

test('pooled sample has 9 years and distinct year colors; missing values are skipped',()=>{
  const pooled=prepare(rows,autism,'자폐성','after',false,true);
  assert.equal(pooled.yearsCount,9);
  assert.equal(pooled.n,2051);
  assert.equal(pooled.traces[0].marker.showscale,true);
  assert.equal(pooled.traces[0].marker.color.length,2051);
});

test('no fictional plane when model is not identifiable or has null coefficients',()=>{
  const invalid={...autism,fiscal_coef:null};
  const out=prepare(sample,invalid,'자폐성','after');
  assert.equal(out.traces.length,1);
  assert.equal(out.hasPlane,false);
  const collinear=[{after:0.1,fertility:0.5,rates:{'자폐성':0.01},year:2022},
    {after:0.2,fertility:0.6,rates:{'자폐성':0.02},year:2022}];
  const small=prepare(collinear,autism,'자폐성','after');
  assert.equal(small.hasPlane,false);
});

test('convex hull forms no extraneous rectangular extrapolation corners',()=>{
  const hull=hull2D([{x:0,y:0},{x:2,y:0},{x:1,y:1},{x:0.7,y:0.2},{x:1,y:0}]);
  assert.equal(hull.length,3);
  assert.deepEqual(hull.map(({x,y})=>[x,y]),[[0,0],[2,0],[1,1]]);
});
