// Run: node tests/ui/go-to-navigation.mjs
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {useBacktester} from './src/components/app/useBacktester';
import {JumpStatus} from './src/components/app/JumpStatus';
import {createSessionState,publicSessionState} from './src/lib/backtest/replay-engine';
const start=Date.UTC(2025,0,1);
const candles=Array.from({length:12000},(_,i)=>({timestamp:start+i*60000,open:'1.1',high:'1.2',low:'1',close:'1.15'}));
const config={symbol:'EURUSD',symbols:['EURUSD'],baseCurrency:'EUR',quoteCurrency:'USD',timeframe:'1m',startTime:start,endTime:start+20000*60000,startingBalance:'10000',accountCurrency:'USD',spreadPips:'0',commissionPerLot:'0',slippagePips:'0',executionPolicy:'conservative',pipSize:'0.0001',pricePrecision:5,initialVisibleCount:1};
const engine={candles:candles.slice(0,6000),state:createSessionState('test',config,6000,candles,'test',false)};
window.requests=[];
window.fetch=async (url,options)=>{
 if(String(url).endsWith('/extend')){window.requests.push(JSON.parse(options.body));return new Promise(resolve=>window.finishFetch=()=>resolve(new Response(JSON.stringify({ok:true,candles:candles.slice(6000),hasMore:true}))));}
 if(String(url).endsWith('/checkpoint'))return new Response(JSON.stringify({ok:true,savedAt:Date.now(),visibleIndex:0}));
 return new Response(JSON.stringify({ok:true,state:publicSessionState(engine,false),candles:[],replayCandles:engine.candles,contextCandles:[],notes:''}));
};
function App(){const bt=useBacktester('test');window.bt=bt;return <>
<button onClick={()=>bt.actions.jumpTo({kind:'time',timestamp:start+3000*60000}).then(x=>window.outcome=x)}>Nearby</button>
<button onClick={()=>bt.actions.jumpTo({kind:'time',timestamp:start+15000*60000}).then(x=>window.outcome=x)}>Distant</button>
<JumpStatus active={bt.jumping} destination="Next month" phase={bt.jumpProgress?.phase} percent={bt.jumpProgress?.percent} onCancel={bt.actions.cancelJump}/></>}
createRoot(document.getElementById('root')).render(<App/>);
`},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch();
try {
const page=await browser.newPage();
await page.route('http://jump.test/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
await page.goto('http://jump.test');await page.addScriptTag({content:bundle.outputFiles[0].text});
await page.waitForFunction(()=>window.bt?.phase==='active');
await page.getByRole('button',{name:'Nearby',exact:true}).click();
await page.waitForFunction(()=>window.outcome?.reason==='target');
assert.equal(await page.evaluate(()=>window.bt.state.visibleIndex),3000);
assert.equal(await page.getByTestId('go-to-progress').count(),0,'fast local jumps should not flash a loader');
await page.getByRole('button',{name:'Distant',exact:true}).click();
await page.getByTestId('go-to-progress').waitFor();
assert.equal(await page.evaluate(()=>window.requests[0].jump),true);
await page.getByRole('button',{name:'Cancel',exact:true}).click();
await page.getByText('Stopping…',{exact:true}).waitFor();
await page.evaluate(()=>window.finishFetch());
await page.waitForFunction(()=>window.outcome?.reason==='cancelled');
assert.equal(await page.evaluate(()=>window.bt.state.visibleIndex),5999);
assert.equal(await page.evaluate(()=>window.bt.state.status),'paused');
assert.equal(await page.getByTestId('go-to-progress').count(),0);
console.log('Go to: instant loaded destination, larger batch request, status, cancellation and safe paused cursor passed.');
}finally{await browser.close();}
