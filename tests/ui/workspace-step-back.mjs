// Run: node tests/ui/workspace-step-back.mjs
// Covers the saved-layout restoration race through real charts and replay controls.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from 'tailwindcss';

const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {useBacktester} from './src/components/app/useBacktester';
import {ReplayToolbar} from './src/components/app/ReplayToolbar';
import ChartGrid from './src/components/app/ChartGrid';
import {DEFAULT_CHART_SETTINGS} from './src/components/app/ChartSettingsMenu';
const empty=[],noop=()=>{};
const workspace={ready:true,settings:DEFAULT_CHART_SETTINGS,updateSettings:noop,resetSettings:noop,favorites:new Set(),toggleFavorite:noop,revision:0};
localStorage.setItem('forextestlab:layout:test',JSON.stringify({layout:window.multi?'2v':'1',cells:[{id:'cell-1',symbol:'EURUSD',timeframe:'4h'},...(window.multi?[{id:'cell-2',symbol:'EURUSD',timeframe:'1d'}]:[])],focusedId:'cell-1'}));
localStorage.setItem('forextestlab:chart:test:cell-2:EURUSD',JSON.stringify({timeframe:'1h'}));
localStorage.setItem('forextestlab:chart:test:cell-1:EURUSD',JSON.stringify({timeframe:'15m'}));

import {createSessionState,publicSessionState} from './src/lib/backtest/replay-engine';
const start=Date.UTC(2025,0,7,10);
const candles=Array.from({length:2000},(_,i)=>({timestamp:start+i*60000,open:'1.1',high:'1.2',low:'1',close:String(1.1+i/10000),source:'aggregated'}));
const config={symbol:'EURUSD',symbols:['EURUSD'],baseCurrency:'EUR',quoteCurrency:'USD',timeframe:'1m',startTime:start,endTime:start+2000*60000,startingBalance:'10000',accountCurrency:'USD',spreadPips:'0',commissionPerLot:'0',slippagePips:'0',executionPolicy:'conservative',pipSize:'0.0001',pricePrecision:5,initialVisibleCount:1009};
const engine={candles,state:createSessionState('test',config,candles.length,candles,'test',false)};
window.requests=[];
window.completed=0;
window.fetch=async(url,options)=>{
 if(String(url).endsWith('/action')) {
  window.requests.push(JSON.parse(options.body));
  await new Promise(resolve=>setTimeout(resolve,100));
  window.completed++;
 }
 return new Response(JSON.stringify({ok:true,state:publicSessionState(engine,false),candles:[],replayCandles:engine.candles,contextCandles:[],notes:''}));
};
function App(){const bt=useBacktester('test');const[tf,setTf]=React.useState('15m');window.bt=bt;window.activeTf=tf;
return <>
{bt.state && <div style={{height:650,width:1200}}><ChartGrid state={bt.state} sessionSeries={bt.replayCandles} sessionContextCandles={empty} pairs={{}} pairLoadingSymbols={empty} onNeedSymbol={noop} markers={empty} positions={empty} pendingOrders={empty} activePositionId={null} stopLoss={null} takeProfit={null} tradePlan={null} onTradePlanChange={noop} theme="dark" onStopLossChange={noop} onTakeProfitChange={noop} onLoadHistory={async(symbol,tf,before)=>({candles:[{...candles[0],timestamp:before-86400000}],hasMore:false})} storageKey="test" focusedSymbol="EURUSD" onFocusedSymbolChange={noop} workspace={workspace} onOpenSymbolPicker={noop} onFocusedTimeframeChange={setTf} onOpenSettings={noop}/></div>}
{bt.state && <ReplayToolbar state={bt.state} busy={bt.busy} onPlay={()=>bt.actions.play()} onPause={()=>bt.actions.pause()} onNext={()=>{}} onPrev={()=>bt.actions.stepPrev(tf)} onRestart={()=>{}} onEnd={()=>{}} onSpeed={()=>{}} onBuy={()=>{}} onSell={()=>{}} canTrade={false} maxReplaySpeed={60} lots="0.1" onLotsChange={()=>{}}/>}</>}
createRoot(document.getElementById('root')).render(<App/>);
` }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
const browser = await chromium.launch();
try {
  const css = await postcss([tailwind('./tailwind.config.ts')]).process(await readFile('src/app/globals.css', 'utf8'), { from: 'src/app/globals.css' });
  for(const multi of [false,true]) {
  const page = await browser.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('http://replay.test/**', r => r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.goto('http://replay.test');
  await page.evaluate(multi=>window.multi=multi,multi);
  await page.addStyleTag({content: css.css});
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.waitForFunction(() => window.bt?.phase === 'active');
  const first=page.getByTestId('chart-cell-1');
  await first.getByRole('status',{name:'Loading chart'}).waitFor({state:'detached'});
  await first.getByTestId('legend-timeframe-trigger').waitFor();
  // Allow all restoration effects to settle; asserting only an intermediate
  // value would miss the stale layout overwriting the chart's report.
  await page.waitForTimeout(300);
  assert.equal((await first.getByTestId('legend-timeframe-trigger').textContent()).trim(),'15m');
  assert.equal(await page.evaluate(()=>window.activeTf),'15m');
  const back=page.getByRole('button',{name:'Previous candle',exact:true});
  await back.click();
  await page.waitForFunction(()=>window.completed===1);
  assert.equal(await page.evaluate(()=>window.bt.state.visibleIndex),1004);
  await back.click();
  await page.waitForFunction(()=>window.completed===2);
  assert.equal(await page.evaluate(()=>window.bt.state.visibleIndex),989);
  if(multi) {
    await page.getByTestId('chart-cell-2').locator('[data-axis-timeframe]').click({position:{x:250,y:250}});
  } else {
    await first.getByRole('button',{name:'Display 1h candles',exact:true}).click();
  }
  await page.waitForFunction(()=>window.activeTf==='1h');
  await back.click();
  await page.waitForFunction(()=>window.completed===3);
  assert.equal(await page.evaluate(()=>window.bt.state.visibleIndex),959);
  assert.deepEqual(await page.evaluate(()=>window.requests.map(x=>x.targetIndex)),[1004,989,959]);
  assert.deepEqual(errors,[]);
  console.log((multi?'Two-pane':'Single-pane')+' workspace: restored display timeframe, consecutive back presses, and timeframe/focus changes passed.');
  await page.close();
  }
} finally { await browser.close(); }
