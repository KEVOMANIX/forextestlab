// Run: node tests/ui/replay-step-back.mjs
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
import {createSessionState,publicSessionState} from './src/lib/backtest/replay-engine';
const start=Date.UTC(2025,0,7,10);
const candles=Array.from({length:120},(_,i)=>({timestamp:start+i*60000,open:'1.1',high:'1.2',low:'1',close:String(1.1+i/10000),source:'aggregated'}));
const config={symbol:'EURUSD',symbols:['EURUSD'],baseCurrency:'EUR',quoteCurrency:'USD',timeframe:'1m',startTime:start,endTime:start+120*60000,startingBalance:'10000',accountCurrency:'USD',spreadPips:'0',commissionPerLot:'0',slippagePips:'0',executionPolicy:'conservative',pipSize:'0.0001',pricePrecision:5,initialVisibleCount:49};
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
function App(){const bt=useBacktester('test');const[tf,setTf]=React.useState('15m');window.bt=bt;
return <><select aria-label="Active timeframe" value={tf} onChange={e=>setTf(e.target.value)}><option>15m</option><option>5m</option><option>1m</option></select>
{bt.state && <ReplayToolbar state={bt.state} busy={bt.busy} onPlay={()=>bt.actions.play()} onPause={()=>bt.actions.pause()} onNext={()=>{}} onPrev={()=>bt.actions.stepPrev(tf)} onRestart={()=>{}} onEnd={()=>{}} onSpeed={()=>{}} onBuy={()=>{}} onSell={()=>{}} canTrade={false} maxReplaySpeed={60} lots="0.1" onLotsChange={()=>{}}/>}</>}
createRoot(document.getElementById('root')).render(<App/>);
` }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
const browser = await chromium.launch();
try {
  const css = await postcss([tailwind('./tailwind.config.ts')]).process(await readFile('src/app/globals.css', 'utf8'), { from: 'src/app/globals.css' });
  const page = await browser.newPage();
  await page.route('http://replay.test/**', r => r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.goto('http://replay.test');
  await page.addStyleTag({content: css.css});
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.waitForFunction(() => window.bt?.phase === 'active');
  assert.equal(await page.evaluate(() => window.bt.state.visibleIndex), 48);
  const back = page.getByRole('button', { name: 'Previous candle', exact: true });
  await back.click();
  await page.waitForFunction(() => window.bt.state.visibleIndex === 44);
  await back.click();
  await page.waitForFunction(() => window.bt.state.visibleIndex === 29);
  await page.getByRole('combobox', { name: 'Active timeframe' }).selectOption('5m');
  await back.click();
  await page.waitForFunction(() => window.bt.state.visibleIndex === 24);
  await page.getByRole('combobox', { name: 'Active timeframe' }).selectOption('1m');
  await back.click();
  await page.waitForFunction(() => window.completed === 4 && window.bt.state.visibleIndex === 23 && window.bt.saveStatus === 'saved');
  assert.equal(await page.evaluate(() => window.bt.state.status), 'paused');
  assert.deepEqual(await page.evaluate(() => window.requests.map(x => x.targetIndex)), [44, 29, 24, 23]);
  console.log('Replay back button: one active-timeframe candle, repeated clicks, and stale save responses passed.');
} finally { await browser.close(); }
