// Real multi-pane charts: tool placement, bidirectional sharing and keyboard edits.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
const fixture=`
import React from 'react';
import {createRoot} from 'react-dom/client';
import ChartGrid from './src/components/app/ChartGrid';
import {DEFAULT_CHART_SETTINGS} from './src/components/app/ChartSettingsMenu';
import {createSessionState,publicSessionState} from './src/lib/backtest/replay-engine';
const empty=[],noop=()=>{};
const workspace={ready:true,settings:DEFAULT_CHART_SETTINGS,updateSettings:noop,resetSettings:noop,favorites:new Set(['horizontal','trend']),toggleFavorite:noop,revision:0};
localStorage.setItem('forextestlab:layout:test',JSON.stringify({layout:'2v',cells:[{id:'cell-1',symbol:'EURUSD',timeframe:'15m'},{id:'cell-2',symbol:'EURUSD',timeframe:'1h'}],focusedId:'cell-1'}));
const start=Date.UTC(2025,0,7,10);
const candles=Array.from({length:2000},(_,i)=>({timestamp:start+i*60000,open:'1.1',high:'1.2',low:'1',close:String(1.1+i/10000),source:'aggregated'}));
const config={symbol:'EURUSD',symbols:['EURUSD'],baseCurrency:'EUR',quoteCurrency:'USD',timeframe:'1m',startTime:start,endTime:start+2000*60000,startingBalance:'10000',accountCurrency:'USD',spreadPips:'0',commissionPerLot:'0',slippagePips:'0',executionPolicy:'conservative',pipSize:'0.0001',pricePrecision:5,initialVisibleCount:1009};
const state=publicSessionState({candles,state:createSessionState('test',config,candles.length,candles,'test',false)},false);
createRoot(document.getElementById('root')).render(<div style={{height:650,width:1200}}><ChartGrid state={state} sessionSeries={candles} sessionContextCandles={empty} pairs={{}} pairLoadingSymbols={empty} onNeedSymbol={noop} markers={empty} positions={empty} pendingOrders={empty} activePositionId={null} stopLoss={null} takeProfit={null} tradePlan={null} onTradePlanChange={noop} theme="dark" onStopLossChange={noop} onTakeProfitChange={noop} onLoadHistory={async(symbol,tf,before)=>({candles:[{...candles[0],timestamp:before-86400000}],hasMore:false})} storageKey="test" focusedSymbol="EURUSD" onFocusedSymbolChange={noop} workspace={workspace} onOpenSymbolPicker={noop} onFocusedTimeframeChange={noop} onOpenSettings={noop}/></div>);
`;
const instrument=`
import {DrawingEngine} from './src/lib/chart/drawing/engine';
window.engines={};
const originalEnv=DrawingEngine.prototype.setEnv;
DrawingEngine.prototype.setEnv=function(env){const id=this.host.closest('[data-testid^="chart-cell-"]')?.dataset.testid;if(id)window.engines[id]=this;return originalEnv.call(this,env)};
`;
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:instrument+fixture},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const css=await postcss([tailwind('./tailwind.config.ts')]).process(await readFile('src/app/globals.css','utf8'),{from:'src/app/globals.css'});
const browser=await chromium.launch();
try{
const page=await browser.newPage({viewport:{width:1450,height:850}});
page.setDefaultTimeout(10000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('http://drawings.test/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
await page.goto('http://drawings.test');
await page.addStyleTag({content:css.css});await page.addScriptTag({content:bundle.outputFiles[0].text});
await page.waitForFunction(()=>Object.keys(window.engines).length===2);
await page.getByTestId('chart-cell-1').getByRole('status',{name:'Loading chart'}).waitFor({state:'detached'});
await page.getByTestId('chart-cell-2').getByRole('status',{name:'Loading chart'}).waitFor({state:'detached'});
await page.waitForTimeout(300);
const chart=i=>page.getByTestId('chart-cell-'+i).locator('[data-axis-timeframe]');
const counts=()=>page.evaluate(()=>Object.values(window.engines).map(e=>e.serialize().length));
const clickChart=async(i,x=220,y=250)=>chart(i).click({position:{x,y}});
// Choose on pane one, place on pane two without first focusing it.
await page.getByRole('button',{name:'Horizontal line',exact:true}).click();
await clickChart(2);
await page.waitForTimeout(100);
assert.deepEqual(await counts(),[1,1],'tool must draw on the pane clicked and share to its sibling');
assert.equal(await page.evaluate(()=>window.engines['chart-cell-2'].serialize()[0]?.kind),'horizontal');
// Reverse direction and retain the previous marking.
await page.getByRole('button',{name:'Horizontal line',exact:true}).click();
await clickChart(1,250,300);await page.waitForTimeout(100);
assert.deepEqual(await counts(),[2,2],'drawings must share in both directions');
assert.deepEqual(await page.evaluate(()=>Object.values(window.engines).map(e=>e.serialize())),await page.evaluate(()=>{const s=window.engines['chart-cell-1'].serialize();return [s,s]}));
await page.waitForFunction(()=>Object.values(window.engines).every(e=>e.env.tool===null));
// Keyboard history belongs to the clicked pane, rather than every mounted engine.
await page.keyboard.press('Control+z');await page.waitForTimeout(100);
assert.deepEqual(await counts(),[1,1],'undo must run only in the focused pane');
await page.keyboard.press('Control+Shift+z');await page.waitForTimeout(100);
assert.deepEqual(await counts(),[2,2]);
// Drag a shared line in the second pane; editing must flow back to the first.
await clickChart(2,400,100);await page.waitForTimeout(150);
const priceBefore=await page.evaluate(()=>window.engines['chart-cell-2'].serialize()[0].points[0].price);
const y=await page.evaluate(()=>{const e=window.engines['chart-cell-2'];return e.mapper.priceToY(e.serialize()[0].points[0].price)});
const box=await page.evaluate(()=>window.engines['chart-cell-2'].host.getBoundingClientRect().toJSON());
await page.mouse.move(box.x+300,box.y+y);await page.mouse.down();
await page.mouse.move(box.x+300,box.y+y+30,{steps:5});await page.mouse.up();await page.waitForTimeout(100);
const prices=await page.evaluate(()=>Object.values(window.engines).map(e=>e.serialize()[0].points[0].price));
assert.notEqual(prices[1],priceBefore);assert.equal(prices[0],prices[1]);
await page.keyboard.press('Delete');await page.waitForTimeout(100);
assert.deepEqual(await counts(),[1,1],'deleting on pane two must update pane one');
// Rebuilding a series must initialize its replacement drawing engine too.
await page.getByRole('button',{name:'Chart type',exact:true}).click();
await page.getByRole('button',{name:'Line',exact:true}).click();
await page.waitForTimeout(150);
await page.getByRole('button',{name:'Horizontal line',exact:true}).click();
await clickChart(1,800,150);await page.waitForTimeout(100);
assert.deepEqual(await counts(),[2,2]);
// Multi-point placement must stay on the destination through the focus change.
await page.getByRole('button',{name:'Trend line',exact:true}).click();
await clickChart(2,700,180);await clickChart(2,850,220);await page.waitForTimeout(100);
assert.deepEqual(await counts(),[3,3]);
await page.getByRole('button',{name:'Horizontal line',exact:true}).click();
await page.keyboard.press('Escape');
await page.waitForFunction(()=>Object.values(window.engines).every(e=>e.env.tool===null));
assert.deepEqual(errors,[]);
console.log('Multi-pane placement, bidirectional creation/edit/delete, focused undo/redo, rebuilt series, multi-point tools and Escape passed.');
}finally{await browser.close()}

