// Real Lightweight Charts regression (no server, credentials, or database).
// Run: node tests/ui/drawing-timeframes.mjs
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
    import { createChart, CandlestickSeries, LineSeries } from 'lightweight-charts';
    import { CoordinateMapper } from './src/lib/chart/drawing/coords';
    import { createObject } from './src/lib/chart/drawing/objects';
    import { defaultStyle } from './src/lib/chart/drawing/types';
    import { candleBucketStart } from './src/lib/market-data/aggregation';
    import { nextTimeframeTimestamp } from './src/lib/market-data/types';
    const chart = createChart(document.getElementById('chart'), {width:1200,height:600});
    const context = chart.addSeries(CandlestickSeries);
    const replay = chart.addSeries(CandlestickSeries);
    const future = chart.addSeries(LineSeries, {visible:false});
    const mapper = new CoordinateMapper(chart,replay);
    mapper.width=1200; mapper.height=600;
    const saved = { id:'regression', kind:'rectangle',
      points:[{time:Date.UTC(2020,7,18,0,44)/1000,price:1.1883},
              {time:Date.UTC(2020,7,18,2,10)/1000,price:1.1886}],
      style:defaultStyle('rectangle'), hidden:false, locked:false,zIndex:1,visibleTimeframes:null};
    const drawing = createObject(saved);
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=600;
    const ctx=canvas.getContext('2d');
    window.check = async (tf, pan) => {
      const start=candleBucketStart(saved.points[0].time*1000,tf);
      const times=Array.from({length:340},(_,i)=>nextTimeframeTimestamp(start,tf,i-200)/1000);
      const bars=times.map(time=>({time,open:1.188,high:1.19,low:1.187,close:1.189}));
      context.setData(bars.slice(0,180)); replay.setData(bars.slice(180,310));
      future.setData(times.slice(310).map(time=>({time})));
      mapper.setTimeframe(tf);mapper.setCandles(bars.slice(0,310));mapper.setFutureTimes(times.slice(310));
      chart.timeScale().setVisibleLogicalRange({from:175+pan,to:225+pan});
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const scale=chart.timeScale();
      const expected=saved.points.map(p=>{
        const bucket=candleBucketStart(p.time*1000,tf)/1000;
        const next=nextTimeframeTimestamp(bucket*1000,tf)/1000;
        const index=scale.timeToIndex(bucket,false);
        const left=scale.logicalToCoordinate(index);
        const right=scale.logicalToCoordinate(index+1);
        return left+(right-left)*(p.time-bucket)/(next-bucket);
      });
      ctx.clearRect(0,0,1200,600);drawing.render({ctx,mapper});
      const pixels=ctx.getImageData(0,0,1200,600).data;
      let painted=0;for(let i=3;i<pixels.length;i+=4) if(pixels[i]) painted++;
      return {tf,pan,actual:saved.points.map(p=>mapper.timeToX(p.time)),expected,painted,
        fractionalLibraryCoordinate:scale.logicalToCoordinate(200.5),bbox:drawing.bbox(mapper),
        unchanged:JSON.stringify(saved.points)===JSON.stringify(drawing.serialize().points)};
    };
  ` }, bundle:true,write:false,platform:'browser',
});
const browser=await chromium.launch();
try {
  const page=await browser.newPage();
  await page.setContent('<div id="chart"></div>');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  for(const tf of ['1m','3m','5m','10m','15m','30m','45m','1h','2h','4h','6h','12h','1d','1w','1M','3M','4M','6M','1yr']) {
    for(const pan of [0,-20,10]) {
      const result=await page.evaluate(([tf,pan])=>window.check(tf,pan),[tf,pan]);
      console.log(tf, 'pan', pan, 'width', result.bbox?.w, 'painted', result.painted);
      result.actual.forEach((x,i)=>assert.ok(Number.isFinite(x)&&Math.abs(x-result.expected[i])<0.01,`${tf}: anchor ${i} collapsed or drifted`));
      assert.ok(result.bbox.w>0,`${tf}: rectangle collapsed`);
      assert.ok(result.painted>0,`${tf}: rectangle not painted`);
      assert.ok(result.unchanged,'projection changed saved points');
    }
  }
} finally {await browser.close();}
