// Run: node tests/ui/replay-next-candle.mjs
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {useBacktester} from './src/components/app/useBacktester';
import {createSessionState,publicSessionState,placeOrder} from './src/lib/backtest/replay-engine';
const start=Date.UTC(2025,0,7,10);
const candles=Array.from({length:46},(_,i)=>({timestamp:start+i*60000,open:'1.1',high:'1.101',low:i===(window.serverAhead?25:20)?'1.08':'1.099',close:'1.1',source:'aggregated'}));
const config={symbol:'EURUSD',symbols:['EURUSD'],baseCurrency:'EUR',quoteCurrency:'USD',timeframe:'1m',startTime:start,endTime:candles.at(-1).timestamp,startingBalance:'10000',accountCurrency:'USD',spreadPips:'0',commissionPerLot:'0',slippagePips:'0',executionPolicy:'conservative',pipSize:'0.0001',pricePrecision:5,initialVisibleCount:15};
const engine={candles:candles.slice(0,22),state:createSessionState('test',config,22,candles,'test',false)};
if(window.withTrade)placeOrder(engine,{direction:'long',sizingMode:'fixed-lots',lots:'0.1',stopLoss:'1.09'});
if(window.serverAhead)engine.state.totalCandles=46;
window.extensions=0;
window.fetch=async(url,options)=>{
 if(String(url).endsWith('/extend')) {
  window.extensions++; await new Promise(resolve=>window.finishFetch=resolve);
  return new Response(JSON.stringify({ok:true,candles:candles.slice(22),hasMore:false}));
 }
 if(String(url).endsWith('/checkpoint'))return new Response(JSON.stringify({ok:true,savedAt:Date.now()}));
 return new Response(JSON.stringify({ok:true,state:publicSessionState(engine,false),candles:[],replayCandles:engine.candles,contextCandles:[],notes:''}));
};
function App(){const bt=useBacktester('test');window.bt=bt;
return <><button onClick={()=>bt.actions.stepNext('15m')}>Next</button><button onClick={()=>bt.actions.stepPrev('1m')}>Back</button></>}
createRoot(document.getElementById('root')).render(<App/>);
`},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch();
try {
  for(const scenario of ['flat','trade','cancel','metadata']) {
    const page=await browser.newPage();
    await page.route('http://next.test/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
    await page.goto('http://next.test');
    await page.evaluate(scenario=>{window.withTrade=scenario==='trade'||scenario==='metadata';window.serverAhead=scenario==='metadata'},scenario);
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.waitForFunction(()=>window.bt?.phase==='active');
    await page.getByRole('button',{name:'Next',exact:true}).click();
    await page.waitForFunction(()=>window.extensions===1 && typeof window.finishFetch==='function');
    if(scenario==='metadata')assert.ok(await page.evaluate(()=>window.bt.state.visibleIndex<=21),'reloaded metadata must not advance beyond downloaded candles');
    if(scenario==='cancel')await page.getByRole('button',{name:'Back',exact:true}).click();
    await page.evaluate(()=>window.finishFetch());
    if(scenario==='cancel') {
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(()=>window.bt.state.visibleIndex),20,'pending Next must not override Back');
    } else {
      await page.waitForFunction(()=>window.bt.state.visibleIndex===29);
      if(scenario==='trade'||scenario==='metadata') {
        const trades=await page.evaluate(()=>window.bt.state.closedTrades);
        assert.equal(trades.length,1);
        assert.equal(trades[0].exitIndex,scenario==='metadata'?25:20,'stop loss must execute before the 15m candle closes');
      }
      await page.getByRole('button',{name:'Next',exact:true}).click();
      await page.waitForFunction(()=>window.bt.state.visibleIndex===44);
      await page.getByRole('button',{name:'Next',exact:true}).click();
      await page.waitForFunction(()=>window.bt.endOfData);
      assert.equal(await page.evaluate(()=>window.bt.state.visibleIndex),45);
      await page.getByRole('button',{name:'Back',exact:true}).click();
      await page.waitForFunction(()=>!window.bt.endOfData);
      await page.getByRole('button',{name:'Next',exact:true}).click();
      await page.waitForFunction(()=>window.bt.state.visibleIndex===45);
    }
    console.log(scenario+': next-candle boundary, extension and replay state passed');
    await page.close();
  }
} finally {await browser.close();}
