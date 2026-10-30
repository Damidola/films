const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('dist/app.js','utf8');
function fn(name,next){return app.slice(app.indexOf('function '+name+'('),app.indexOf('function '+next+'('));}
test('next trailer decodes once, pauses and is promoted without a seek or reload',()=>{
 let pending;let pauses=0;let positions=0;
 const slot={warming:true,ready:true,rank:2,api:{mute(){},seekTo(){throw Error('must not seek buffered frame');}},host:{classList:{toggle(){}},setAttribute(){}}};
 const old={ready:true,api:{mute(){}},host:slot.host};
 const c={clearTimeout(){},setTimeout(cb,ms){assert.equal(ms,120);pending=cb;return 1;},activeVideoSlot:old,videoSlots:[old,slot],slotClock:0,player:null,playerReady:false,commentsPanel:null,$:()=>({hidden:true}),positionVideoSlots(){positions++;},pauseVideoSlot(){pauses++;},applySound(){}};
 vm.createContext(c);vm.runInContext(fn('primeOpeningFrame','handleVideoState')+fn('activateVideoSlot','playCurrent'),c);
 c.primeOpeningFrame(slot);assert.equal(slot.prepared,undefined);pending();assert.equal(slot.prepared,true);assert.equal(slot.warming,false);assert.equal(pauses,1);
 c.activateVideoSlot(slot);assert.equal(c.activeVideoSlot,slot);assert.equal(c.player,slot.api);assert.equal(slot.warming,false);assert.equal(pauses,2);assert.ok(positions>=2);
});
test('promotion cancels pending warm-up pause so visible trailer keeps playing',()=>{
 let pending;let pauses=0;const slot={warming:true};
 const c={clearTimeout(){},setTimeout(cb){pending=cb;return 1;},activeVideoSlot:null,pauseVideoSlot(){pauses++;},positionVideoSlots(){}};
 vm.createContext(c);vm.runInContext(fn('primeOpeningFrame','handleVideoState'),c);c.primeOpeningFrame(slot);c.activeVideoSlot=slot;pending();assert.equal(pauses,0);
});
test('only the immediate neighbour consumes preload bandwidth; buffered neighbour is not restarted',()=>{
 const calls=[];const next={rank:2,trailer:{videoId:'next'}};const slot={rank:2,ready:true,videoId:'next',prepared:true,failed:false};
 const c={view:'feed',document:{hidden:false},playerReady:true,current:()=>({rank:1}),player:{getPlayerState:()=>1},timeline:[{item:{rank:1}},{item:next},{item:{rank:3}}],activeIndex:0,engine:{unavailable:new Set()},activeVideoSlot:{},candidates:i=>[i.trailer],reserveVideoSlot:i=>{calls.push(i.rank);return slot;},loadVideoSlot(){throw Error('must not reload buffered neighbour');},positionVideoSlots(){}};
 vm.createContext(c);vm.runInContext(fn('preloadNextVideo','activateVideoSlot'),c);c.preloadNextVideo();assert.deepEqual(calls,[2]);
});
