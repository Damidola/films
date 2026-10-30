'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const catalog=require('../dist/catalog.json');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:360,height:720},deviceScaleFactor:2.75,isMobile:true,hasTouch:true});
 // Test site layout and link opening independently of third-party availability.
 await context.route('https://www.youtube.com/**',r=>r.abort());
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const size of [{width:320,height:568},{width:360,height:640},{width:393,height:740},{width:430,height:820},{width:844,height:390}]){
  await page.setViewportSize(size);await page.goto('http://localhost:8000/catalog.html');await page.waitForSelector('.card');
  assert.deepEqual(await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth})),{scroll:size.width,client:size.width},'catalog must fit the actual device width');
  const bounds=await page.locator('header,.catalog,.nav,.card,.card .smallbtn,.search input,.nav a,.brand').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right}}));assert.ok(bounds.every(r=>r.left>=0&&r.right<=size.width+.5));
  await page.evaluate(()=>window.scrollTo({left:100,top:0}));assert.equal(await page.evaluate(()=>scrollX),0);await page.locator('.filters').evaluate(el=>el.scrollLeft=1000);assert.equal(await page.evaluate(()=>scrollX),0);await page.locator('.filters').evaluate(el=>el.scrollLeft=0);
  if(size.width===360)await page.screenshot({path:path.join(__dirname,'catalog-mobile-fixed.png')});
  // The longest title exercises wrapping and the available video space.
  await page.locator('[data-trailer="61"]').click();await page.waitForTimeout(180);
  const video=await page.locator('#video-box').boundingBox();const bottom=await page.locator('.feed-page.active .feed-bottom').boundingBox();const nav=await page.locator('.nav').boundingBox();
  assert.ok(video.height>=100,'video remains usable');
  if(size.width<500)assert.ok(video.y+video.height<=bottom.y+1,'video and information do not overlap');
  const link=page.locator('.feed-page.active .watch-links a');assert.equal(await link.count(),2);const box=await link.first().boundingBox();assert.ok(box.x>=0&&box.x+box.width<=size.width+.5&&box.y>=0&&box.y+box.height<=nav.y,'direct link stays above navigation');assert.ok(box.height>=38);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),size.width);
  if(size.width===360)await page.screenshot({path:path.join(__dirname,'feed-mobile-fixed.png')});
 }
 await page.setViewportSize({width:360,height:720});
 const item=catalog.find(i=>i.rezka&&i.kinogo&&i.trailer);const destinations=[['HDrezka',item.rezka],['KinoGo',item.kinogo]];
 for(const [name,url] of destinations){await context.route(url,r=>r.fulfill({contentType:'text/html',body:'<title>External destination</title>'}));await page.goto('http://localhost:8000/catalog.html');await page.locator(`[data-trailer="${item.rank}"]`).click();const link=page.locator('.feed-page.active .watch-links a').filter({hasText:name});assert.equal(await link.getAttribute('href'),url);const popupReady=page.waitForEvent('popup');await link.tap();const popup=await popupReady;await popup.waitForLoadState('domcontentloaded');assert.equal(popup.url(),url);await popup.close()}
 const missing=catalog.find(i=>!i.kinogo&&i.trailer&&!i.status);await page.goto('http://localhost:8000/catalog.html');await page.locator(`[data-trailer="${missing.rank}"]`).click();assert.equal(await page.locator('.feed-page.active .watch-links a').filter({hasText:'KinoGo'}).count(),0);assert.equal(await page.locator('.feed-page.active .provider-disabled').count(),1);assert.equal(await page.locator('a[href*="story="],a[href*="uakinogo.io/index.php"]').count(),0);for(const i of catalog.filter(i=>i.kinogo))assert.ok(!/[?]|search|index\.php/.test(i.kinogo));
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: catalog device widths, long titles, visible feed links, HDrezka/KinoGo taps open exact URLs, no KinoGo search fallbacks, portrait and landscape');
})().catch(e=>{console.error(e);process.exit(1)});
