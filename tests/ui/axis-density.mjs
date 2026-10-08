// Run: node tests/ui/axis-density.mjs
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

const bundle = await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import {createChart,CandlestickSeries} from 'lightweight-charts';
  import {AXIS_FONT_SIZES,PRICE_AXIS_TICK_DENSITY} from './src/lib/chart/axis-layout';
  import {formatTickMark,timeframeTickMarkMaxCharacters} from './src/lib/chart/tick-marks';
  window.measure = async (dense,width,theme) => {
    const texts = new Set();
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText=function(text,...args){texts.add(String(text)); return original.call(this,text,...args);};
    const el=document.createElement('div');document.body.append(el);
    const chart=createChart(el,{width,height:600,layout:{fontSize:dense?AXIS_FONT_SIZES.medium:16,textColor:theme==='light'?'#10231c':'#aac8bc',background:{color:theme==='light'?'#f7faf8':'#14231e'}},
      rightPriceScale:{tickMarkDensity:dense?PRICE_AXIS_TICK_DENSITY:2.5,ticksVisible:dense},
      timeScale:{timeVisible:true,tickMarkMaxCharacterLength:dense?timeframeTickMarkMaxCharacters('15m'):5,tickMarkFormatter:(time,type)=>formatTickMark(Number(time)*1000,type,'UTC','15m')}});
    const series=chart.addSeries(CandlestickSeries,{priceFormat:{type:'price',precision:5,minMove:0.00001}});
    series.setData(Array.from({length:300},(_,i)=>({time:1704067200+i*900,open:1.10+i*.00001,high:1.12+i*.00001,low:1.09+i*.00001,close:1.11+i*.00001})));
    chart.timeScale().setVisibleLogicalRange({from:0,to:299});
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const result={price:[...texts].filter(x=>/^1\\.\\d{5}$/.test(x)).length,time:[...texts].filter(x=>/^\\d{2}:\\d{2}$/.test(x)).length};
    chart.remove();el.remove();CanvasRenderingContext2D.prototype.fillText=original;return result;
  };
`},bundle:true,write:false,platform:'browser'});
const browser=await chromium.launch();
try {
  const page=await browser.newPage();
  await page.setContent('<body style="margin:0"></body>');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  for(const width of [480,1200]) for(const theme of ['dark','light']) {
    const before=await page.evaluate(([w,t])=>window.measure(false,w,t),[width,theme]);
    const after=await page.evaluate(([w,t])=>window.measure(true,w,t),[width,theme]);
    assert.ok(after.price>before.price,JSON.stringify({width,theme,before,after}));
    assert.ok(after.time>=before.time,JSON.stringify({width,theme,before,after}));
    console.log(width,theme,JSON.stringify({before,after}));
  }
} finally {await browser.close();}
