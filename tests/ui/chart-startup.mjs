// Run: node tests/ui/chart-startup.mjs
// Exercise the real chart with ChartGrid's delayed initial candle delivery.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React from 'react';
import {createRoot} from 'react-dom/client';
import PriceChart from './src/components/app/PriceChart';
import {DEFAULT_CHART_SETTINGS} from './src/components/app/ChartSettingsMenu';
import {TIMEFRAME_MS} from './src/lib/market-data/types';
import {publishReplayVisual} from './src/lib/backtest/replay-visual-bus';
const empty=[]; const noop=()=>{}; const favorites=new Set();
const start=Date.parse('2025-12-31T05:00:00Z');
const candle=timestamp=>({timestamp,open:'1.17',high:'1.18',low:'1.16',close:'1.175',volume:'100',source:'test'});
window.calls=[]; window.ready=0;
const source=Array.from({length:30000},(_,i)=>candle(start+i*60000));
window.rewind=()=>publishReplayVisual({sessionId:'test-session',currentTime:source[25000].timestamp,visibleIndex:25000,currentPrice:1.175});
function App(){
 const [initial,setInitial]=React.useState(empty);
 window.deliver=(at=start)=>setInitial(Array.from({length:10000},(_,i)=>candle(at+i*60000)));
 return <PriceChart initialCandles={initial} contextCandles={empty} replaySessionId="test-session" replaySeries={source}
 lastCandle={null} lastCandles={empty} markers={empty} positions={empty} pendingOrders={empty}
 activePositionId={null} stopLoss={null} takeProfit={null} tradePlan={null} currentPrice={1.175}
 baseTimeframe="1m" initialTimeframe={window.timeframe} storageKey={window.storageKey} pipSize={0.0001} precision={5} accountCurrency="USD"
 symbolLabel="EURUSD" theme="dark" settings={DEFAULT_CHART_SETTINGS} favorites={favorites}
 onSettingsChange={noop} onSettingsReset={noop} onToggleFavorite={noop}
 onReady={()=>window.ready++} onLoadHistory={async(tf,before)=>{
 window.calls.push({tf,before});
 await new Promise(resolve=>setTimeout(resolve,80));
 if(window.fail)throw Error('Network interrupted');
 return {candles:Array.from({length:200},(_,i)=>candle(before-(200-i)*TIMEFRAME_MS[tf])),hasMore:true};
 }} />;
}
createRoot(document.getElementById('root')).render(<App/>);
` }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: {'process.env.NODE_ENV':'"production"'} });
const browser = await chromium.launch();
try {
 for (const timeframe of ['1m', '15m', '1h', '4h', '1d', '1w', '1M', '3M', '6M', '1yr']) {
  for (const fail of [false, true]) {
   const page = await browser.newPage({viewport:{width:1280,height:800}});
   const errors=[]; page.on('pageerror',error=>errors.push(error.message));
   await page.setContent('<div id="root" style="height:750px;width:1200px"></div>');
   await page.evaluate(({timeframe,fail})=>Object.assign(window,{timeframe,fail}),{timeframe,fail});
   await page.addScriptTag({content:bundle.outputFiles[0].text});
   await page.waitForFunction(()=>typeof window.deliver==='function');
   await page.waitForTimeout(200);
   assert.equal(await page.evaluate(()=>window.ready),0,`${timeframe}: empty initial mount must stay covered`);
   assert.equal(await page.evaluate(()=>window.calls.length),0);
   await page.evaluate(()=>window.deliver());
   await page.waitForFunction(()=>window.calls.length===1);
   if(fail){
    await page.getByRole('button',{name:'Retry loading chart',exact:true}).waitFor();
    // The parent must reveal this actionable error rather than keep its full-page spinner.
    await page.waitForFunction(()=>window.ready===1);
    await page.evaluate(()=>window.fail=false);
    await page.getByRole('button',{name:'Retry loading chart',exact:true}).click();
   }
   await page.waitForFunction(()=>window.ready===1);
   await page.getByRole('status',{name:'Loading chart'}).waitFor({state:'detached'});
   assert.deepEqual(await page.evaluate(()=>window.calls[0]),{tf:timeframe,before:Date.parse('2025-12-31T05:00:00Z')});
   assert.equal(await page.evaluate(()=>window.calls.length), fail?2:1);
   if(timeframe==='1d'&&!fail){
    const next=Date.parse('2026-08-21T00:00Z');
    await page.evaluate(at=>window.deliver(at),next);
    await page.waitForFunction(()=>window.calls.length===2);
    await page.getByRole('status',{name:'Loading chart'}).waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>window.calls.at(-1).before),next,'A replacement window must fetch its adjacent daily history');
    await page.evaluate(()=>window.rewind());
    await page.waitForFunction(()=>window.calls.length===3);
    await page.getByRole('status',{name:'Loading chart'}).waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>window.calls.at(-1).before),Date.parse('2025-12-31T05:00:00Z')+15001*60000,'A rewind must fetch history beside the new slice');
   }
   assert.deepEqual(errors,[]);
   console.log(`${timeframe}: ${fail?'failed opening history is retryable':'delayed candles automatically fetch opening history'}`);
   await page.close();
  }
 }
 const page = await browser.newPage({viewport:{width:1280,height:800}});
 const errors=[]; page.on('pageerror',error=>errors.push(error.message));
 await page.route('http://chart.test/**',route=>route.fulfill({contentType:'text/html',body:'<div id="root" style="height:750px;width:1200px"></div>'}));
 await page.goto('http://chart.test');
 await page.evaluate(()=>{
  window.timeframe='1d'; window.storageKey='blocked-history-cache';
  // Simulate a browser storage request that never settles.
  Object.defineProperty(window,'indexedDB',{value:{open:()=>({})}});
 });
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.waitForFunction(()=>typeof window.deliver==='function');
 await page.evaluate(()=>window.deliver());
 await page.getByRole('status',{name:'Loading chart'}).waitFor({state:'detached'});
 await page.waitForFunction(()=>window.ready===1);
 assert.deepEqual(errors,[]);
 console.log('Blocked browser history storage does not delay chart readiness.');
 await page.close();
} finally {await browser.close();}
