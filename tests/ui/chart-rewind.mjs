// Run: node tests/ui/chart-rewind.mjs
// Exercise the mounted chart, including its real time scale and history loader.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

const bundle = await build({
  plugins: [{name:'inspect-chart',setup(build){
    build.onLoad({filter:/PriceChart\.tsx$/},async({path})=>({loader:'tsx',contents:(await readFile(path,'utf8'))
      .replace('chartRef.current = chart;', 'chartRef.current = chart; window.chart = chart; window.mounts = (window.mounts ?? 0) + 1;')
      .replace('seriesRef.current = main;', 'seriesRef.current = main; window.main = main;')}));
  }}],
  stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import PriceChart from './src/components/app/PriceChart';
import {DEFAULT_CHART_SETTINGS} from './src/components/app/ChartSettingsMenu';
import {TIMEFRAME_MS} from './src/lib/market-data/types';
import {forexDailyStart,isForexDailyTradingDay} from './src/lib/market-data/forex-day';
import {previousCandleIndex} from './src/lib/backtest/previous-candle';
import {publishReplayVisual} from './src/lib/backtest/replay-visual-bus';
const empty=[],noop=()=>{},favorites=new Set();
const candle=timestamp=>({timestamp,open:'1.17',high:'1.18',low:'1.16',close:'1.175',volume:'100',source:'test'});
const source=[];
for(let time=Date.UTC(2025,0,7);source.length<30000;time+=60000){
 if(isForexDailyTradingDay(forexDailyStart(time)))source.push(candle(time));
}
const initial=source.slice(-10000);let cursor=source.length-1;
window.calls=[];
window.back=()=>{
 cursor=previousCandleIndex(source,cursor,window.timeframe,'EURUSD');
 publishReplayVisual({sessionId:'rewind-test',currentTime:source[cursor].timestamp,visibleIndex:cursor,currentPrice:1.175});
};
createRoot(document.getElementById('root')).render(<PriceChart initialCandles={initial} contextCandles={empty}
 replaySessionId="rewind-test" replaySeries={source} lastCandle={null} lastCandles={empty}
 markers={empty} positions={empty} pendingOrders={empty} activePositionId={null} stopLoss={null}
 takeProfit={null} tradePlan={null} currentPrice={1.175} baseTimeframe="1m" initialTimeframe={window.timeframe}
 pipSize={0.0001} precision={5} accountCurrency="USD" symbolLabel="EURUSD" theme="dark"
 settings={DEFAULT_CHART_SETTINGS} favorites={favorites} onSettingsChange={noop} onSettingsReset={noop} onToggleFavorite={noop}
 onLoadHistory={async(tf,before)=>{
  window.calls.push({tf,before});await new Promise(r=>setTimeout(r,30));
  return {candles:Array.from({length:100},(_,i)=>candle(before-(100-i)*TIMEFRAME_MS[tf])),hasMore:true};
 }}/ >);
`},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},
});
const browser=await chromium.launch();
try {
  for(const timeframe of ['1m','15m','1h','4h','1d']) {
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setContent('<div id="root" style="height:750px;width:1200px"></div>');
    await page.evaluate(tf=>window.timeframe=tf,timeframe);
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.waitForFunction(()=>window.calls.length===1);
    await page.getByRole('status',{name:'Loading chart'}).waitFor({state:'detached'});
    await page.evaluate(async()=>{
      const index=window.chart.timeScale().timeToIndex(window.main.data().at(-1).time,true);
      window.chart.timeScale().setVisibleLogicalRange({from:index-65,to:index+12});
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    });
    const before=await page.evaluate(()=>({data:window.main.data(),range:window.chart.timeScale().getVisibleLogicalRange(),mounts:window.mounts,calls:window.calls.length}));
    for(let n=1;n<=3;n++) {
      await page.evaluate(async()=>{window.back();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))));});
      const after=await page.evaluate(()=>({data:window.main.data(),range:window.chart.timeScale().getVisibleLogicalRange(),mounts:window.mounts,calls:window.calls.length}));
      assert.deepEqual(after.data,before.data.slice(0,-n),timeframe+': only the last candle should disappear');
      assert.deepEqual(after.range,before.range,timeframe+': preserve pan and zoom');
      assert.equal(after.calls,before.calls,timeframe+': do not reload history');
      assert.equal(after.mounts,before.mounts,timeframe+': do not recreate chart');
      assert.equal(await page.getByRole('status',{name:'Loading chart'}).count(),0);
    }
    assert.deepEqual(errors,[]);
    console.log(timeframe+': repeated back presses preserve chart, viewport, and loaded history');
    await page.close();
  }
} finally {await browser.close();}
