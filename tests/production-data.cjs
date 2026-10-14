// Exercise production persistence with synthetic fixtures and an entirely stubbed cloud.
// No user credentials, browser storage, or live Supabase calls are used.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const baseline = execFileSync('git', ['show', '7e6b69f:index.html'], {cwd:root, encoding:'utf8', maxBuffer:8e6});
const scriptOf = h => [...h.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('function buildPhases'));
const script = scriptOf(html);
const plain = value => JSON.parse(JSON.stringify(value));
function boot(seed, response = {data:null,error:null}, cloud = true) {
  const storage = new Map(seed ? [['clsx_state_v2',JSON.stringify(seed)]] : []), writes=[], upserts=[], elements=new Map();
  const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>{writes.push(k);storage.set(k,v);}};
  const element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',style:{},classList:{toggle(){}},setAttribute(){},querySelector(){return null;},querySelectorAll(){return [];}});return elements.get(id);};
  const client={from(table){assert.equal(table,'progress');return {select(column){assert.equal(column,'data');return {eq(key,user){assert.equal(key,'user_id');assert.equal(user,'fixture-user');return {async maybeSingle(){if(response instanceof Error)throw response;return response;}};}};},async upsert(row){upserts.push(plain(row));return {error:null};}};}};
  const window={localStorage,addEventListener(){}};
  if(cloud)window.supabase={createClient(){return client;}};
  const context=vm.createContext({console,localStorage,window,navigator:{},document:{addEventListener(){},getElementById:element,querySelector(){return null;},querySelectorAll(){return [];},documentElement:{getAttribute(){return 'dark';},setAttribute(){}}},requestAnimationFrame(){},setTimeout(){},clearTimeout(){}});
  const expose='globalThis.api={defaultState,loadState,loadStateFromCloud,saveState,renderHome,renderProgressArchive,renderArchiveCalendar,archivePageInfo,getState:()=>state,setUser:()=>currentUser={id:"fixture-user"},setPage:p=>archivePage=p};';
  assert.ok(script.includes('  init();'));
  vm.runInContext(script.replace('  init();',expose),context);
  context.api.setUser();
  return {api:context.api,storage,writes,upserts};
}
let checks=0;
async function check(name,fn){await fn();checks++;console.log('PASS '+name);}
(async()=>{
  await check('production keys and Supabase connection match the deployed baseline',()=>{
    for(const name of ['STORAGE_KEY','THEME_KEY','SUPABASE_URL','SUPABASE_ANON_KEY']){
      const re=new RegExp('var '+name+' = ([^;]+);');assert.equal(html.match(re)[1],baseline.match(re)[1],name);
    }
    assert.match(html,/<script src="https:\/\/cdn.jsdelivr.net\/npm\/@supabase\/supabase-js@2\/dist\/umd\/supabase.js"><\/script>/);
    assert.doesNotMatch(script,/false\s*&&\s*SUPABASE_URL/);
    assert.doesNotMatch(html,/clsx_review_|initReview|reviewSampleState|resetReview|reviewSampleBtn|reviewEmptyBtn|Review sandbox|timer-options\.html/);
  });
  const fixture={cycleIndex:2,cycleProgress:[{attempted:true,fraction:1},{attempted:true,fraction:.5},{attempted:false,fraction:0},{attempted:false,fraction:0}],cyclesCompleted:47,streak:8,longestStreak:23,lastCompletedDate:'2026-01-05',history:{},customPreservedField:{version:7}};
  for(let year=1900;year<=2025;year++)for(let month=1;month<=12;month++)fixture.history[`${year}-${String(month).padStart(2,'0')}-01`]={dayIndex:month%4,mainDone:true,extraDone:month%3===0,fraction:month%5===0?.5:1};
  fixture.history['2024-02-29']={dayIndex:0,mainDone:true};
  fixture.history['2026-01-03']={dayIndex:1,skipped:true};
  fixture.history['2026-01-05']={dayIndex:2,mainDone:true,fraction:.75,extraDone:true,level:2};
  await check('126 years of local history and legacy records survive loading and rendering without writes',async()=>{
    const b=boot(fixture,undefined,false);await b.api.loadState();b.api.renderHome();
    const info=b.api.archivePageInfo();assert.equal(info.earliest,1900*12);
    for(let p=0;p<info.pages;p++){b.api.setPage(p);b.api.renderProgressArchive();}
    assert.match(b.api.renderArchiveCalendar('2024-02',29),/Foundation, 100% completed/);
    assert.deepEqual(plain(b.api.getState()),fixture);assert.equal(b.storage.get('clsx_state_v2'),JSON.stringify(fixture));assert.deepEqual(b.writes,[]);assert.equal(b.upserts.length,0);
  });
  await check('existing cloud row loads all fields without upserting or rewriting legacy records',async()=>{
    const b=boot({history:{}},{data:{data:plain(fixture)},error:null});await b.api.loadStateFromCloud();b.api.renderHome();b.api.renderProgressArchive();
    assert.deepEqual(plain(b.api.getState()),fixture);assert.deepEqual(JSON.parse(b.storage.get('clsx_state_v2')),fixture);assert.equal(b.upserts.length,0);assert.deepEqual(b.writes,['clsx_state_v2']);
  });
  for(const response of [{data:null,error:{message:'offline'}},new Error('network unavailable')])await check('cloud failure retains local fixture without cloud writes',async()=>{
    const b=boot(fixture,response);await b.api.loadStateFromCloud();b.api.renderHome();assert.deepEqual(plain(b.api.getState()),fixture);assert.equal(b.upserts.length,0);assert.deepEqual(b.writes,[]);
  });
  await check('new account carries existing local progress into its first cloud row',async()=>{
    const b=boot(fixture);await b.api.loadStateFromCloud();assert.equal(b.upserts.length,1);assert.equal(b.upserts[0].user_id,'fixture-user');assert.deepEqual(b.upserts[0].data,fixture);
  });
  await check('empty storage starts empty and default shape is unchanged',async()=>{
    const b=boot(null,undefined,false);await b.api.loadState();assert.deepEqual(plain(b.api.getState()),{cycleIndex:0,cycleProgress:Array.from({length:4},()=>({attempted:false,fraction:0})),cyclesCompleted:0,streak:0,longestStreak:0,lastCompletedDate:null,history:{}});assert.deepEqual(b.writes,[]);
    const extract=s=>s.slice(s.indexOf('  function defaultState(){'),s.indexOf('  function todayStr(){'));assert.equal(extract(script),extract(scriptOf(baseline)));
  });
  console.log(`${checks} production data checks passed; no live network requests.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
