const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/private/tmp/calis-review-browser/node_modules/playwright');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const fixture={cycleIndex:0,cyclesCompleted:1,streak:2,longestStreak:3,lastCompletedDate:'2025-01-15',history:{'2025-01-15':{dayIndex:0,mainDone:true,extraDone:false,fraction:1},'2025-02-11':{dayIndex:1,mainDone:true,fraction:1}}};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/Users/mrezarf/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
 const errors=[];
 async function pageFor(signedIn){
  const context=await browser.newContext({viewport:{width:375,height:548},isMobile:true,hasTouch:true});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.origin==='http://127.0.0.1:4173'&&url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
   if(url.href.includes('@supabase/supabase-js'))return route.fulfill({contentType:'application/javascript',body:`window.cloudCalls={reads:0,writes:0};window.supabase={createClient(){const user={id:'test-only-user'};return {auth:{onAuthStateChange(){},async getSession(){return {data:{session:${signedIn?'true':'false'}?{user}:null}}},async getUser(){return {data:{user}}}},from(table){if(table!=='progress')throw Error('Unexpected table');return {select(){return {eq(){return {async maybeSingle(){cloudCalls.reads++;return {data:{data:${JSON.stringify(fixture)}}}}}}}},async upsert(){cloudCalls.writes++;throw Error('Unexpected cloud write in read-only test')}}}}}};`});
   // Prevent every real network call, including cloud writes and external assets.
   return route.abort();
  });
  await page.goto('http://127.0.0.1:4173/');return {page,context};
 }
 const {page,context}=await pageFor(true);
 await page.locator('#startBtn').waitFor();
 assert.equal(await page.locator('[id^="review"]').count(),0);
 assert.equal(await page.locator('.review-banner').count(),0);
 assert.deepEqual(await page.evaluate(()=>cloudCalls),{reads:1,writes:0});
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('clsx_state_v2')).history),fixture.history,'legacy history preserved verbatim');
 await page.locator('#monthProgressBtn').click();assert.equal(await page.locator('.archive-month[open]').count(),0);
 while(await page.locator('#archiveOlderBtn').isEnabled())await page.locator('#archiveOlderBtn').click();
 const firstMonth=page.locator('.archive-month').last();await firstMonth.locator('summary').click();
 await firstMonth.locator('.calendar-day.has-workout').first().click();
 assert.match(await firstMonth.locator('.calendar-selection').innerText(),/Foundation/);
 assert.deepEqual(await page.evaluate(()=>cloudCalls),{reads:1,writes:0},'history browsing never writes cloud');
 await page.locator('[data-level="2"]').click();assert.equal(await page.evaluate(()=>localStorage.getItem('clsx_level')),'2');
 await page.clock.install();await page.locator('#startBtn').click();
 assert.equal(await page.locator('#phaseLabelEl').isVisible(),false);
 const ratio=()=>page.locator('#timerMeter').evaluate(n=>Number(n.style.getPropertyValue('--remaining')));
 const before=await ratio();await page.clock.runFor(250);assert.ok(await ratio()<before);
 await page.locator('#pauseBtn').click();const frozen=await ratio();await page.clock.runFor(1200);assert.equal(await ratio(),frozen);
 await page.locator('#pauseBtn').click();await page.clock.runFor(250);assert.ok(await ratio()<frozen);
 await page.locator('#skipBtn').click();assert.equal(await page.locator('#roundDots i').count(),3);
 assert.equal(await page.locator('#roundDots').getAttribute('aria-label'),'Round 1 of 3');
 assert.equal(await page.locator('#pauseBtn svg').count(),1);
 const bounds=await page.evaluate(()=>({scroll:document.documentElement.scrollHeight,height:innerHeight,off:[...document.querySelectorAll('#screen-workout.active button,#secLabel,#moveNameEl,#wkDescEl,#roundDots,#phaseDots,#timerMeter')].filter(n=>n.getClientRects().length).filter(n=>{const r=n.getBoundingClientRect();return r.top<0||r.bottom>innerHeight||r.left<0||r.right>innerWidth}).map(n=>n.id)}));
 assert.ok(bounds.scroll<=bounds.height+1);assert.deepEqual(bounds.off,[]);
 await page.locator('#skipBtn').click();assert.equal(await page.locator('#nextMoveBanner').isVisible(),true);
 assert.equal(await page.locator('#roundDots').getAttribute('aria-label'),'Round 1 of 3');
 assert.deepEqual(await page.evaluate(()=>cloudCalls),{reads:1,writes:0},'startup/browsing/incomplete session never writes cloud');
 await context.close();
 const signedOut=await pageFor(false);await signedOut.page.locator('#authEmail').waitFor();
 assert.equal(await signedOut.page.locator('#authPassword').isVisible(),true);
 assert.equal(await signedOut.page.locator('#screen-home.active').count(),0);
 assert.deepEqual(await signedOut.page.evaluate(()=>cloudCalls),{reads:0,writes:0});
 await signedOut.context.close();assert.deepEqual(errors,[]);await browser.close();
 console.log('PASS production HTML: mocked signed-in legacy cloud read, zero writes, preserved history, archive navigation, levels, smooth timer/pause, round/rest state, compact iPhone layout, and signed-out auth. All non-test network blocked.');
})().catch(e=>{console.error(e);process.exit(1)});
