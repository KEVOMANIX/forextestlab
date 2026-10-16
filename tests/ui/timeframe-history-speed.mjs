// Run: node tests/ui/timeframe-history-speed.mjs
// Compare completed chart data and requests through real timeframe changes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import postcss from 'postcss';
import tailwind from 'tailwindcss';

const bundle=await build({
  plugins:[{name:'inspect-chart',setup(b){b.onLoad({filter:/PriceChart\.tsx$/},async({path})=>({loader:'tsx',contents:(await readFile(path,'utf8'))
    .replace('chartRef.current = chart;','chartRef.current = chart; window.chart=chart; window.mounts=(window.mounts??0)+1;')
    .replace('contextSeriesRef.current = context;','contextSeriesRef.current = context; window.contextSeries=context;')
    .replace('seriesRef.current = main;','seriesRef.current = main; window.mainSeries=main;')}));}}],
  stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import PriceChart from './src/components/app/PriceChart';
import {DEFAULT_CHART_SETTINGS} from './src/components/app/ChartSettingsMenu';
import {TIMEFRAME_MS} from './src/lib/market-data/types';
import {candleBucketStart} from './src/lib/market-data/aggregation';
const empty=[],noop=()=>{},favorites=new Set();
const candle=timestamp=>({timestamp,open:'1.17',high:'1.18',low:'1.16',close:'1.175',volume:'100',source:'test'});
const start=Date.UTC(2025,3,7,10,7);
const source=Array.from({length:4500},(_,i)=>candle(start+i*60000));
window.calls=[];window.failures={};
const load=async(tf,before)=>{
 window.calls.push({tf,before,at:performance.now()});
 await new Promise(r=>setTimeout(r,tf==='5m'?650:tf==='30m'?100:450));
 if(window.failures[tf]){window.failures[tf]--;throw Error('Temporary history failure')}
 const bucket=candleBucketStart(before-1,tf);
 return {candles:Array.from({length:150},(_,i)=>candle(bucket-(149-i)*TIMEFRAME_MS[tf])),hasMore:true};
};
function App(){const [initial,setInitial]=React.useState(source);
window.changeWindow=()=>setInitial([candle(start-60000),...source]);
return <PriceChart initialCandles={initial} contextCandles={empty} replaySessionId="speed-test"
 replaySeries={initial} lastCandle={null} lastCandles={empty} markers={empty} positions={empty} pendingOrders={empty}
 activePositionId={null} stopLoss={null} takeProfit={null} tradePlan={null} currentPrice={1.175}
 baseTimeframe="1m" initialTimeframe="15m" pipSize={0.0001} precision={5} accountCurrency="USD"
 symbolLabel="EURUSD" theme="dark" storageKey="speed-test:EURUSD" settings={DEFAULT_CHART_SETTINGS}
 favorites={favorites} onSettingsChange={noop} onSettingsReset={noop} onToggleFavorite={noop}
 onLoadHistory={load}/>}
createRoot(document.getElementById('root')).render(<App/>);
`},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},
});
const css=await postcss([tailwind('./tailwind.config.ts')]).process(await readFile('src/app/globals.css','utf8'),{from:'src/app/globals.css'});
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1400,height:900}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://speed.test/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root" style="height:800px;width:1300px"></div>'}));
 await page.goto('http://speed.test');await page.addStyleTag({content:css.css});await page.addScriptTag({content:bundle.outputFiles[0].text});
 const ready=()=>page.getByRole('status',{name:'Loading chart'}).waitFor({state:'detached'});
 const snapshot=()=>page.evaluate(()=>({main:window.mainSeries.data(),history:window.contextSeries.data(),mounts:window.mounts}));
 const count=tf=>page.evaluate(tf=>window.calls.filter(c=>c.tf===tf).length,tf);
 const choose=async tf=>{
   const pinned=page.getByRole('button',{name:'Display '+tf+' candles',exact:true});
   if(await pinned.count())await pinned.click();
   else {await page.getByTestId('legend-timeframe-trigger').click();await page.getByRole('menuitemradio',{name:new RegExp('^'+tf+'\\s')}).click();}
 };
 await page.waitForFunction(()=>window.calls.length===1);await ready();
 const initial=await snapshot();assert.ok(initial.history.length>0);
 const timings=[];
 for(const tf of ['1h','4h','1d']){
   const coldAt=performance.now();await choose(tf);
   await page.waitForFunction(tf=>window.calls.some(c=>c.tf===tf),tf);await ready();
   const coldMs=performance.now()-coldAt,cold=await snapshot();
   assert.ok(cold.history.length>0);assert.equal(cold.mounts,1);
   await choose('15m');await ready();assert.equal(await count('15m'),1);
   assert.deepEqual(await snapshot(),initial,'restored 15m data must match the loaded chart');
   const warmAt=performance.now();await choose(tf);await ready();
   const warmMs=performance.now()-warmAt;
   assert.equal(await count(tf),1,'returning to '+tf+' must not download history again');
   assert.deepEqual(await snapshot(),cold,'cached '+tf+' OHLC and history must be identical');
   timings.push({tf,coldMs:Math.round(coldMs),warmMs:Math.round(warmMs)});
 }
 // History added by scrolling must survive leaving and returning to a timeframe.
 await choose('1h');await ready();
 const beforeOlder=await snapshot();
 await page.getByRole('button',{name:'Load older candles',exact:true}).click();
 await page.waitForFunction(()=>window.calls.filter(c=>c.tf==='1h').length===2);
 await page.getByRole('button',{name:'Load older candles',exact:true}).waitFor();
 const withOlder=await snapshot();assert.ok(withOlder.history.length>beforeOlder.history.length);
 await choose('15m');await ready();await choose('1h');await ready();
 assert.equal(await count('1h'),2);assert.deepEqual(await snapshot(),withOlder);
 // Out-of-order responses warm only their own page and never repaint the active timeframe.
 await choose('5m');await page.waitForFunction(()=>window.calls.some(c=>c.tf==='5m'));
 await choose('30m');await ready();const thirty=await snapshot();
 await page.waitForTimeout(700);assert.deepEqual(await snapshot(),thirty);
 await choose('5m');await ready();assert.equal(await count('5m'),1);
 // Failed loads remain retryable and cannot poison a later cached switch.
 await page.evaluate(()=>window.failures['2h']=1);await choose('2h');
 await page.getByRole('button',{name:'Retry loading chart',exact:true}).waitFor();
 await page.getByRole('button',{name:'Retry loading chart',exact:true}).click();await ready();
 assert.equal(await count('2h'),2);
 await choose('15m');await ready();await choose('2h');await ready();assert.equal(await count('2h'),2);
 // A different replay window requires new adjacent history rather than an old cached page.
 await choose('15m');await ready();await page.evaluate(()=>window.changeWindow());
 await page.waitForFunction(()=>window.calls.filter(c=>c.tf==='15m').length===2);await ready();
 const boundaries=await page.evaluate(()=>window.calls.filter(c=>c.tf==='15m').map(c=>c.before));
 assert.notEqual(boundaries[0],boundaries[1]);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({timings,checks:'Identical OHLC/history, no repeat download or remount, safe late responses, retry, and changed replay boundary passed.'}));
}finally{await browser.close()}
