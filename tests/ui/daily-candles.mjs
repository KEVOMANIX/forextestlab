// Run: node tests/ui/daily-candles.mjs
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
const bundle = await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
 import {createChart,CandlestickSeries} from 'lightweight-charts';
 import {chartHistoryKey,publishChartHistory,subscribeChartHistory} from './src/lib/chart/history-cache';
 import {historyBeforeReplay,mergeOpeningHistoryBucket} from './src/lib/chart/opening-history';
 import {formatCrosshairLabel} from './src/lib/chart/tick-marks';
 window.check = async (theme,zone) => {
  const start=Date.parse('2025-08-03T21:00:00Z');
  const history=Array.from({length:3},(_,i)=>({timestamp:start+i*86400000,open:'1.10',high:'1.15',low:'1.08',close:'1.12',volume:'20',source:'aggregated'}));
  const storage=theme+zone;
  const legacy=history.map(c=>({...c,timestamp:c.timestamp+10800000,open:'1.09'}));
  await publishChartHistory('v2:'+storage+':1d',legacy,true);
  let loaded=[]; const stop=subscribeChartHistory(chartHistoryKey(storage,'1d'),s=>{loaded=s.candles});
  await publishChartHistory(chartHistoryKey(storage,'1d'),history,true);
  const time=history[2].timestamp/1000;
  const replay=[{time,open:1.12,high:1.13,low:1.09,close:1.095,volume:5}];
  const joined=mergeOpeningHistoryBucket(loaded,replay);
  const prefix=historyBeforeReplay(loaded,joined).map(c=>({time:c.timestamp/1000,open:Number(c.open),high:Number(c.high),low:Number(c.low),close:Number(c.close)}));
  const el=document.createElement('div');document.body.append(el);
  const chart=createChart(el,{width:900,height:480,layout:{textColor:theme==='dark'?'#aac8bc':'#10231c',background:{color:theme==='dark'?'#14231e':'#f7faf8'}}});
  const context=chart.addSeries(CandlestickSeries), main=chart.addSeries(CandlestickSeries);
  context.setData(prefix);main.setData(joined);chart.timeScale().fitContent();
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const data=[...context.data(),...main.data()];
  const result={count:data.length,labels:data.map(c=>formatCrosshairLabel(Number(c.time)*1000,zone,86400000)),contextTimes:context.data().map(c=>c.time),firstReplay:main.data()[0]};
  chart.remove();el.remove();stop();return result;
 };`},bundle:true,write:false,platform:'browser'});
const browser=await chromium.launch();
try {
 const page=await browser.newPage();
 await page.setContent('<body></body>');
 await page.evaluate(()=>Object.defineProperty(window,'indexedDB',{value:undefined}));
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 for(const theme of ['dark','light'])for(const zone of ['Etc/GMT-3','Etc/GMT+5']) {
  const result=await page.evaluate(([theme,zone])=>window.check(theme,zone),[theme,zone]);
  assert.equal(result.count,3);
  assert.equal(new Set(result.labels).size,3);
  assert.ok(result.labels[0].includes('Mon'));
  assert.ok(!result.contextTimes.includes(result.firstReplay.time));
  assert.equal(result.firstReplay.open,1.10);
  assert.equal(result.firstReplay.close,1.095);
  assert.equal(result.firstReplay.high,1.15);
  assert.equal(result.firstReplay.low,1.08);
  console.log(theme,zone,JSON.stringify(result));
 }
} finally {await browser.close();}
