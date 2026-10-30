const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('dist/app.js','utf8');
const source=app.slice(app.indexOf('function armPlaybackRecovery('),app.indexOf('function onVideoError('));
function setup(){
 let timer,plays=0,reloads=0,switches=0;
 const slot={rank:202,videoId:'first',altIndex:0,api:{getPlayerState:()=>-1,mute(){},playVideo(){plays++},loadVideoById(){reloads++}},host:{classList:{add(){}}}};
 const c={activeVideoSlot:slot,view:'feed',document:{hidden:false},manuallyPaused:new Set(),scrolling:false,horizontalTransition:false,$:()=>({classList:{remove(){}}}),hideVideoStatus(){},setTimeout(fn){timer=fn;return 1},current:()=>({}),candidates:()=>[{videoId:'first'},{videoId:'second'}],videoSpec:x=>x,playCurrent(){switches++},altIndex:0};
 vm.createContext(c);vm.runInContext(source,c);
 return {c,slot,tick(){timer()},counts:()=>({plays,reloads,switches})};
}
test('stalled playback retries, reloads, then switches to the alternate',()=>{
 const {c,slot,tick,counts}=setup();c.armPlaybackRecovery(slot);tick();assert.equal(slot.autoplayMuted,true);tick();tick();assert.deepEqual(counts(),{plays:1,reloads:1,switches:1});assert.equal(c.altIndex,1);
});
test('recovery respects user pause and cannot restart a previous card',()=>{
 for(const stop of ['pause','switch','playing']){
  const {c,slot,tick,counts}=setup();c.armPlaybackRecovery(slot);
  if(stop==='pause')c.manuallyPaused.add(202);
  if(stop==='switch')c.activeVideoSlot={};
  if(stop==='playing')slot.api.getPlayerState=()=>1;
  tick();assert.deepEqual(counts(),{plays:0,reloads:0,switches:0});
 }
});
