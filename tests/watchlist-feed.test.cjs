const {test}=require('node:test');
const assert=require('node:assert/strict');
const Discovery=require('../dist/state.js');
const items=Array.from({length:6},(_,i)=>({rank:i+1,type:'series',trailer:{videoId:'v'+i}}));
const saved={collectionsVersion:2,profileSchema:3,discoveryPolicy:2,feedType:'watchlist',mode:'ordered',recommendationCohort:[1],decisions:{1:'like',2:'like',3:'dislike',4:'like',5:'like'},watched:{4:'like',5:'dislike'},good:{4:true}};
function storage(){const map=new Map([['dc-state-v2',JSON.stringify(saved)]]);return {getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};}
test('watchlist feed includes saved titles outside the recommendation cohort, excludes watched, good and rejected titles',()=>{
 const db=storage(),d=new Discovery(items,db);assert.equal(d.data.feedType,'watchlist');assert.deepEqual(d.nextBatch().map(i=>i.rank),[1,2]);assert.deepEqual(d.progress(),{done:0,total:2,percent:0});
 d.markWatched(1,'like');assert.deepEqual(d.eligible().map(i=>i.rank),[2]);d.decide(2,'dislike');assert.deepEqual(d.eligible(),[]);
 d.data.feedType='all';assert.deepEqual(d.eligible(),[]);assert.equal(d.data.recommendationCohort.length,1);
});
test('skipping a saved trailer preserves bookmark and viewing preference',()=>{
 const d=new Discovery(items,storage());assert.equal(d.defer(1),true);d.restart();assert.deepEqual(d.nextBatch().map(i=>i.rank),[2,1]);assert.equal(d.data.decisions[1],'like');assert.deepEqual(d.data.watched,saved.watched);
});

test('saved collection and feed keep the same membership even when a trailer is missing',()=>{
 const input=items.map(i=>({...i}));delete input[5].trailer;
 const d=new Discovery(input,storage());d.decide(6,'like');
 assert.deepEqual(d.watchlistItems().map(i=>i.rank),[1,2,6]);
 assert.equal(d.progress().total,d.watchlistItems().length);
 assert.deepEqual(d.eligible().map(i=>i.rank),[1,2,6]);
 d.markWatched(2,'like');assert.deepEqual(d.watchlistItems().map(i=>i.rank),[1,6]);
 assert.equal(d.progress().total,2);
});

test('exclude and save remain reversible after previous watched feedback',()=>{
 const d=new Discovery(items,storage());d.markWatched(2,'like');
 d.decide(2,'dislike');assert.equal(d.isRejected(2),true);assert.equal(d.isGood(2),false);
 d.decide(2,'like');assert.equal(d.isRejected(2),false);assert.equal(d.data.watched[2],undefined);assert.ok(d.watchlistItems().some(i=>i.rank===2));
 d.undo();assert.equal(d.isRejected(2),true);assert.equal(d.data.watched[2],'like');
 d.markWatched(2,'like');assert.equal(d.isRejected(2),false);assert.equal(d.isGood(2),true);
 d.setGood(2,false);assert.equal(d.isRejected(2),true);
});
