// Run: node tests/ui/replay-stop-loss.mjs
// A resumed secondary-pair trade must be protected even without an open chart.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {useBacktester} from './src/components/app/useBacktester';
import {createSessionState,publicSessionState,placeOrder} from './src/lib/backtest/replay-engine';
const start=Date.UTC(2025,0,7,10);
const reloaded=window.mode.startsWith('reload');
const primary=window.mode==='primary'||reloaded;
const candles=Array.from({length:46},(_,i)=>({timestamp:start+i*60000,open:'1.1',high:i===25&&window.mode==='reload-short-play'?'1.12':'1.101',low:i===(reloaded?25:20)?'1.08':'1.099',close:'1.1',source:'test'}));
const pair=candles.map((c,i)=>({...c,open:'1.25',close:'1.25',high:i===20?'1.27':'1.251',low:i===20?'1.23':i===18?'1.244':'1.249'}));
const config={symbol:'EURUSD',symbols:['EURUSD','GBPUSD'],baseCurrency:'EUR',quoteCurrency:'USD',timeframe:'1m',startTime:start,endTime:candles.at(-1).timestamp,startingBalance:'10000',accountCurrency:'USD',spreadPips:'0',commissionPerLot:'0',slippagePips:'0',executionPolicy:'conservative',pipSize:'0.0001',pricePrecision:5,initialVisibleCount:15};
const engine={candles,pairCandles:{GBPUSD:pair},state:createSessionState('test',config,candles.length,candles,'test',false)};
placeOrder(engine,{symbol:primary?'EURUSD':'GBPUSD',direction:window.direction,sizingMode:'fixed-lots',lots:'0.1',stopLoss:primary?(window.direction==='short'?'1.11':'1.09'):window.direction==='long'?'1.24':'1.26',...(window.mode==='pending'?{orderType:'limit',entryPrice:'1.245'}:{})});
engine.state.speed=3600;
if(window.mode==='reload-shortcount')engine.state.totalCandles=18;
window.pairRequests=0;window.pairFailed=false;
window.extensions=0;
window.fetch=async(url,options)=>{
 if(String(url).endsWith('/extend')){
  window.extensions++;await new Promise(r=>window.releaseExtension=r);
  return new Response(JSON.stringify({ok:true,candles:candles.slice(22),hasMore:false}));
 }
 if(String(url).includes('/pair?')){
  window.pairRequests++;await new Promise(r=>window.releasePair=r);
  return new Response(JSON.stringify(window.pairFailed?{ok:false,error:'Pair data unavailable'}:{ok:true,symbol:'GBPUSD',candles:pair,contextCandles:[],pipSize:'0.0001',pricePrecision:5}));
 }
 if(String(url).endsWith('/checkpoint'))return new Response(JSON.stringify({ok:true,savedAt:Date.now()}));
 return new Response(JSON.stringify({ok:true,state:publicSessionState(engine,false),candles:[],replayCandles:reloaded?candles.slice(0,22):candles,contextCandles:[],notes:''}));
};
function App(){window.bt=useBacktester('test');return null}
createRoot(document.getElementById('root')).render(<App/>);
`},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch();
try{
 for(const mode of ['next','play','jump','loading','pending','primary','failure','cancel','pause','reload-play','reload-short-play','reload-jump','reload-shortcount']){
  const page=await browser.newPage();page.setDefaultTimeout(5000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://stop.test/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
  await page.goto('http://stop.test');await page.evaluate(mode=>{window.mode=mode;window.direction=mode==='jump'||mode==='reload-short-play'?'short':'long'},mode);
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.waitForFunction(()=>window.bt?.phase==='active');
  await page.evaluate(mode=>{
   if(mode==='loading')void window.bt.actions.ensurePair('GBPUSD');
   if(mode==='play'||mode==='pause'||mode.endsWith('-play'))void window.bt.actions.play();
   else if(mode==='jump'||mode==='reload-jump')void window.bt.actions.jumpTo({kind:'time',timestamp:Date.UTC(2025,0,7,10,29)});
   else void window.bt.actions.stepNext('15m');
  },mode);
  if(mode.startsWith('reload')){
   await page.waitForFunction(()=>window.extensions===1&&typeof window.releaseExtension==='function');
   assert.ok(await page.evaluate(()=>window.bt.state.visibleIndex<=21));
   await page.evaluate(()=>window.releaseExtension());
   await page.waitForFunction(()=>window.bt.state.closedTrades.length===1);
   const trade=await page.evaluate(()=>window.bt.state.closedTrades[0]);
   assert.equal(trade.symbol,'EURUSD');assert.equal(trade.exitReason,'stop-loss');assert.equal(trade.exitIndex,25);
   assert.equal(await page.evaluate(()=>window.pairRequests),0);
   assert.deepEqual(errors,[]);console.log(mode+': original-pair stop fires across resumed buffer boundary');await page.close();continue;
  }
  if(mode==='primary'){
   await page.waitForFunction(()=>window.bt.state.closedTrades.length===1);
   assert.equal(await page.evaluate(()=>window.pairRequests),0);
   assert.equal(await page.evaluate(()=>window.bt.state.closedTrades[0].exitIndex),20);
   assert.deepEqual(errors,[]);console.log('primary: original pair stop-loss remains protected');await page.close();continue;
  }
  await page.waitForFunction(()=>window.pairRequests===1 && typeof window.releasePair==='function');
  assert.equal(await page.evaluate(()=>window.bt.state.visibleIndex),14,'clock must wait for the trade pair');
  if(mode==='failure')await page.evaluate(()=>window.pairFailed=true);
  if(mode==='cancel')await page.evaluate(()=>window.bt.actions.stepPrev('1m'));
  if(mode==='pause')await page.evaluate(()=>window.bt.actions.pause());
  await page.evaluate(()=>window.releasePair());
  if(mode==='failure'){
   await page.waitForFunction(()=>window.bt.error);
   assert.equal(await page.evaluate(()=>window.bt.state.visibleIndex),14);
   assert.equal(await page.evaluate(()=>window.bt.state.openPositions.length),1);
   await page.evaluate(()=>{window.pairFailed=false;void window.bt.actions.stepNext('15m')});
   await page.waitForFunction(()=>window.pairRequests===2);await page.evaluate(()=>window.releasePair());
   await page.waitForFunction(()=>window.bt.state.closedTrades.length===1);
   assert.equal(await page.evaluate(()=>window.bt.state.closedTrades[0].exitIndex),20);
  }else if(mode==='cancel'){
   await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.bt.state.visibleIndex),13);
  }else if(mode==='pause'){
   await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.bt.state.visibleIndex),14);
   assert.equal(await page.evaluate(()=>window.bt.state.status),'paused');
  }else{
   await page.waitForFunction(()=>window.bt.state.closedTrades.length===1);
   const trade=await page.evaluate(()=>window.bt.state.closedTrades[0]);
   assert.equal(trade.exitReason,'stop-loss');assert.equal(trade.exitIndex,20);
   assert.equal(trade.symbol,'GBPUSD');
  }
  assert.deepEqual(errors,[]);console.log(mode+': resumed trade stop-loss protection passed');await page.close();
 }
}finally{await browser.close()}
