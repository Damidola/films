const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Discovery = require('../dist/state.js');
global.AppConfig = require('../dist/config.js');
const release = global.AppConfig.recommendationReleases[0];
const old = Array.from({length:283}, (_,i)=>({rank:i+1,type:'series',discoveryEligible:true,trailer:{videoId:'old'+i}}));
const added = release.ranks.map(rank=>({rank,type:'series',discoveryEligible:true,trailer:{videoId:'new'+rank}}));
function storage(saved) { const values = new Map([['dc-state-v2',JSON.stringify(saved)]]);return {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}; }
const initial = () => ({recommendationCohort:old.map(i=>i.rank),decisions:Object.fromEntries(old.slice(0,268).map(i=>[i.rank,'dislike']))});
test('previously marked but missing release repairs 283 to 333 without losing 268 decisions',()=>{
 const saved=initial();saved.appliedRecommendationReleases=[release.id];const db=storage(saved);
 let engine=new Discovery([...old,...added],db);engine.freezeRecommendations();
 assert.deepEqual(engine.progress(),{done:268,total:333,percent:80});assert.equal(engine.eligible().length,65);
 assert.deepEqual(engine.data.decisions,saved.decisions);
 engine.decide(541,'like');engine.freezeRecommendations();assert.equal(engine.progress().total,333);
 assert.equal(engine.eligible().length,64);
 engine=new Discovery([...old,...added],db);engine.freezeRecommendations();assert.equal(engine.progress().total,333);
 assert.equal(new Set(engine.data.recommendationCohort).size,333);
});
test('stale catalog cannot mark a release complete, and current catalog adds it on reload',()=>{
 const db=storage(initial());let engine=new Discovery(old,db);engine.freezeRecommendations();
 assert.ok(!engine.data.appliedRecommendationReleases.includes(release.id));
 engine=new Discovery([...old,...added],db);engine.freezeRecommendations();
 assert.equal(engine.progress().total,333);assert.ok(engine.data.appliedRecommendationReleases.includes(release.id));
});
test('library repository uses new version and revalidates its data',async()=>{
 const window={};vm.runInNewContext(fs.readFileSync('dist/repositories/library.js','utf8'),{window});
 let request;const repo=new window.LibraryRepository({fetchFn:async(...args)=>{request=args;return {ok:true,json:async()=>({schemaVersion:1,items:[...old,...added],seeds:[]})}}});
 const library=await repo.load();assert.equal(library.items.length,333);assert.equal(request[0],'library.json?v=77');assert.equal(request[1].cache,'no-cache');
});

test('the requested 17-series release extends an existing 333 queue exactly once',()=>{
 const newRelease=global.AppConfig.recommendationReleases.find(r=>r.id==='dark-series-17-2026-10-21');
 const baseline=Array.from({length:333},(_,i)=>({rank:1000+i,type:'series',trailer:{videoId:'baseline'+i}}));
 const more=newRelease.ranks.map(rank=>({rank,type:'series',discoveryEligible:true,trailer:{videoId:'new'+rank}}));
 const decisions=Object.fromEntries(baseline.slice(0,268).map(i=>[i.rank,'dislike']));
 const saved={recommendationCohort:baseline.map(i=>i.rank),decisions,appliedRecommendationReleases:[release.id]};
 const db=storage(saved);const engine=new Discovery([...baseline,...more],db);engine.freezeRecommendations();
 assert.equal(engine.progress().total,350);assert.equal(engine.progress().done,268);assert.equal(engine.eligible().length,82);
 engine.freezeRecommendations();assert.equal(engine.progress().total,350);assert.deepEqual(engine.data.decisions,decisions);
});
