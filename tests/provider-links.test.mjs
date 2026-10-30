import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {compileLibrary} from '../scripts/library-data.mjs';
const require=createRequire(import.meta.url);
const {providerUrl}=require('../dist/domain/library.js');
test('KinoGo URLs must be real provider addresses, never slugs copied from another host',()=>{
 assert.equal(providerUrl('https://kinogo.lifestyle/filmy/defendor-2009','kinogo'),null);
 assert.equal(providerUrl('https://uakinogo.io/filmy/defendor-2009','kinogo'),null);
 assert.equal(providerUrl('https://uakinogo.io/filmy/24438-zaschitneg.html','kinogo'),'https://uakinogo.io/filmy/24438-zaschitneg.html');
});
test('all published KinoGo links come from individually verified canonical pages',async()=>{
 const registry=JSON.parse(fs.readFileSync('dist/provider-links.json')).kinogo;
 const library=await compileLibrary(process.cwd());
 for(const item of library.items){
  assert.equal(item.kinogo,registry[item.rank]?.url||null);
  if(item.kinogo){assert.equal(new URL(item.kinogo).hostname,'uakinogo.io');assert.equal(registry[item.rank].pageHasPlayer,true);}
 }
 assert.equal(library.items.find(i=>i.rank===354).kinogo,'https://uakinogo.io/filmy/24438-zaschitneg.html');
 assert.equal(library.items.find(i=>i.rank===1).kinogo,'https://uakinogo.io/serialy/36642-korporacija.html');
 assert.ok(Object.keys(registry).length>500);
});
