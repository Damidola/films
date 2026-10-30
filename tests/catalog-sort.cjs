'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const catalog=require('../dist/catalog.json');
const fs=require('node:fs');
(async()=>{
 const old=JSON.parse(fs.readFileSync('research/series-stats.json')).items;
 const added=JSON.parse(fs.readFileSync('research/adult-series-metadata.json')).items;
 for(const item of catalog.filter(i=>i.type==='series')){
  const episodes=old[item.rank]?.episodes||added.find(i=>i.rank===item.rank)?.proof.episodes||JSON.parse(fs.readFileSync('research/papich-series-metadata.json')).items[item.papich.kinopoiskId].episodes;
  const st=item.seriesStats;
  assert.equal(st.totalMinutes,Math.round(episodes.reduce((n,e)=>n+(e.runtime>0?e.runtime:st.episodeMinutes),0)),item.title);
 }
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:320,height:568}});
  await page.goto('http://localhost:8000/catalog.html');await page.waitForSelector('.card');
  const ids=()=>page.locator('.card').evaluateAll(xs=>xs.map(x=>Number(x.dataset.rank)));
  const initial=await ids();
  for(const sort of ['kp-desc','kp-asc','score-desc','score-asc']){
   await page.selectOption('#catalog-sort',sort);
   const [field,direction]=sort.split('-');
   const expected=initial.map(rank=>catalog.find(i=>i.rank===rank)).sort((a,b)=>a[field]==null?(b[field]==null?a.rank-b.rank:1):b[field]==null?-1:(a[field]-b[field])*(direction==='asc'?1:-1)||a.rank-b.rank).map(i=>i.rank);
   assert.deepEqual(await ids(),expected,sort);
  }
  await page.reload();await page.waitForSelector('.card');assert.equal(await page.inputValue('#catalog-sort'),'score-asc');
  await page.fill('#search','Corporate');assert.equal(await page.locator('#grid .series-stats,#grid .syn,#grid .card-providers,#grid .compact-providers').count(),0);assert.match(await page.locator('.compact-hours').innerText(),/13 ч/);const card=page.locator('.card').first();const positions=await card.evaluate(e=>({heart:e.querySelector('[data-save]').getBoundingClientRect().x,no:e.querySelector('[data-no]').getBoundingClientRect().x}));assert.ok(positions.heart>positions.no);
  await page.locator('[data-info="1"]').click();assert.equal(await page.locator('#detail .total-duration').innerText(),'Всего ≈13 ч');assert.ok(await page.locator('#detail .watch-links a').count()>=1);await page.locator('#detail').evaluate(el=>el.close());
  await page.fill('#search','');await page.selectOption('#catalog-sort','order');assert.deepEqual(await ids(),initial);
  await page.locator('[data-filter="film"]').click();assert.equal(await page.locator('#grid .total-duration').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),320);
  await page.locator('[data-filter="all"]').click();await page.screenshot({path:'tests/catalog-sort.png',fullPage:false});
  console.log('Catalog rating sorts, persistence, filters, totals for all 95 series and mobile layout passed');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
