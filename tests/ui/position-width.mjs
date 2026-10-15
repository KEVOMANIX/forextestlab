// Run: node tests/ui/position-width.mjs
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
import {createChart,CandlestickSeries} from 'lightweight-charts';
import {DrawingEngine} from './src/lib/chart/drawing/engine';
import {defaultStyle} from './src/lib/chart/drawing/types';
const chart=createChart(document.getElementById('chart'),{width:1000,height:600});
const series=chart.addSeries(CandlestickSeries);
const start=Date.UTC(2025,0,7)/1000;
const candles=Array.from({length:120},(_,i)=>({time:start+i*900,open:1.1,high:1.14,low:1.06,close:1.11}));
series.setData(candles);chart.timeScale().setVisibleLogicalRange({from:0,to:119});
const engine=new DrawingEngine(chart,series,document.getElementById('overlay'));
engine.setEnv({candles,timeframe:'15m',magnet:'strong',precision:5,pipSize:.0001});
window.reset=async(kind,selected,edge)=>{
 const saved={id:'position',kind,points:[{time:candles[30].time,price:1.1},{time:candles[30].time,price:kind==='long'?1.09:1.11},{time:candles[65].time,price:kind==='long'?1.12:1.08}],style:defaultStyle(kind),locked:false,hidden:false,zIndex:1,visibleTimeframes:null};
 engine.load([saved]);if(selected)engine.select(saved.id);
 await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 const rect=chart.chartElement().getBoundingClientRect();
 return {saved,x:rect.left+chart.timeScale().timeToCoordinate(saved.points[2].time),y:rect.top+series.priceToCoordinate(edge?(saved.points[0].price+saved.points[2].price)/2:saved.points[0].price)};
};
window.result=()=>engine.serialize()[0];
window.undo=()=>engine.undo();
window.pointer=(type,x,y)=>chart.chartElement().dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:9,pointerType:'touch',isPrimary:true,clientX:x,clientY:y,button:0,buttons:type==='pointerup'?0:1}));
`},bundle:true,write:false,platform:'browser'});
const browser=await chromium.launch();
try {
 const page=await browser.newPage({viewport:{width:1100,height:700}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setContent('<div style="position:relative;width:1000px;height:600px"><div id="chart"></div><div id="overlay" style="position:absolute;inset:0;pointer-events:none"></div></div>');
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 for(const kind of ['long','short'])for(const selected of [false,true])for(const edge of [false,true])for(const touch of [false,true]) {
  const {saved,x,y}=await page.evaluate(args=>window.reset(...args),[kind,selected,edge]);
  if(touch) {
   await page.evaluate(({x,y})=>{window.pointer('pointerdown',x,y);window.pointer('pointermove',x+120,y+25);window.pointer('pointerup',x+120,y+25);},{x,y});
  } else {
   await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+120,y+25,{steps:5});await page.mouse.up();
  }
  const after=await page.evaluate(()=>window.result());
  const label=JSON.stringify({kind,selected,edge,touch});
  assert.deepEqual(after.points[0],saved.points[0],label+': entry must stay fixed');
  assert.deepEqual(after.points[1],saved.points[1],label+': stop must stay fixed');
  assert.equal(after.points[2].price,saved.points[2].price,label+': target price must stay fixed');
  assert.ok(after.points[2].time>saved.points[2].time,label+': right edge must widen');
  await page.evaluate(()=>window.undo());
  assert.deepEqual((await page.evaluate(()=>window.result())).points,saved.points,label+': undo must restore width');
 }
 assert.deepEqual(errors,[]);
 console.log('Long/short width grips and far edges: selected/unselected, mouse/touch, price magnet and undo passed.');
} finally {await browser.close();}
