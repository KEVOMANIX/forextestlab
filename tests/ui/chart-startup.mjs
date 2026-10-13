// Run: node tests/ui/chart-startup.mjs
// Mount the real chart empty, as ChartGrid does before revealing its slice.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React from 'react';
import {createRoot} from 'react-dom/client';
import PriceChart from './src/components/app/PriceChart';
import {DEFAULT_CHART_SETTINGS} from './src/components/app/ChartSettingsMenu';
const empty=[]; const noop=()=>{}; const favorites=new Set();
const start=Date.parse('2025-12-31T05:00:00Z');
const candle=timestamp=>({timestamp,open:'1.17',high:'1.18',low:'1.16',close:'1.175',volume:'100',source:'test'});
window.calls=0; window.ready=0; window.fail=false;
function App(){
 const [initial,setInitial]=React.useState(empty);
 window.deliver=()=>setInitial([candle(start),candle(start+60000)]);
 return <PriceChart initialCandles={initial} contextCandles={empty}
 lastCandle={null} lastCandles={empty} markers={empty} positions={empty} pendingOrders={empty}
 activePositionId={null} stopLoss={null} takeProfit={null} tradePlan={null} currentPrice={1.175}
 baseTimeframe="1m" initialTimeframe="15m" pipSize={0.0001} precision={5} accountCurrency="USD"
 symbolLabel="EURUSD" theme="dark" settings={DEFAULT_CHART_SETTINGS} favorites={favorites}
 onSettingsChange={noop} onSettingsReset={noop} onToggleFavorite={noop}
 onReady={()=>window.ready++} onLoadHistory={async(tf,before)=>{
 window.calls++; window.request={tf,before};
 await new Promise(resolve=>setTimeout(resolve,80));
 if(window.fail)throw Error('Network interrupted');
 return {candles:Array.from({length:600},(_,i)=>candle(start-(600-i)*900000)),hasMore:true};
 }} />;
}
createRoot(document.getElementById('root')).render(<App/>);
` }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: {'process.env.NODE_ENV':'"production"'} });
const browser = await chromium.launch();
try {
 for (const fail of [false, true]) {
  const page = await browser.newPage({viewport:{width:1280,height:800}});
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.setContent('<div id="root" style="height:750px;width:1200px"></div>');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.waitForFunction(()=>typeof window.deliver==='function');
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>window.ready),0,'Empty initial mount must stay covered');
  assert.equal(await page.evaluate(()=>window.calls),0);
  await page.evaluate(fail=>{window.fail=fail;window.deliver();},fail);
  await page.waitForFunction(()=>window.calls===1);
  if(fail){
   await page.getByRole('button',{name:'Retry loading chart',exact:true}).waitFor();
   await page.evaluate(()=>window.fail=false);
   await page.getByRole('button',{name:'Retry loading chart',exact:true}).click();
  }
  await page.waitForFunction(()=>window.ready===1);
  await page.getByRole('status',{name:'Loading chart'}).waitFor({state:'detached'});
  assert.deepEqual(await page.evaluate(()=>window.request),{tf:'15m',before:Date.parse('2025-12-31T05:00:00Z')});
  assert.deepEqual(errors,[]);
  console.log(fail?'Failed startup stays covered; retry loads history.':'Delayed initial candles automatically load history.');
  await page.close();
 }
} finally {await browser.close();}
