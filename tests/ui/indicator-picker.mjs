// Run: node tests/ui/indicator-picker.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { chromium } from '@playwright/test';

const bundle = await build({stdin: {resolveDir:process.cwd(),loader:'tsx',contents:`
  import React from 'react';import {createRoot} from 'react-dom/client';
  import {IndicatorPicker} from './src/components/app/IndicatorPicker';
  function App(){const [open,setOpen]=React.useState(false);return <>
    <button onClick={()=>setOpen(true)}>Open indicators</button>
    {open&&<IndicatorPicker theme={window.testTheme} onClose={()=>setOpen(false)} onSelect={kind=>{window.selected=kind;setOpen(false)}}/>}
  </>};createRoot(document.getElementById('root')).render(<App/>);
`},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const css=await postcss([tailwind('./tailwind.config.ts')]).process(await readFile('src/app/globals.css','utf8'),{from:'src/app/globals.css'});
const browser=await chromium.launch();
try{
  for(const [width,theme] of [[1280,'dark'],[1280,'light'],[390,'dark'],[390,'light']]){
    const page=await browser.newPage({viewport:{width,height:800}});
    await page.route('http://picker.test/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
    await page.goto('http://picker.test');
    await page.evaluate(theme=>window.testTheme=theme,theme);
    await page.addStyleTag({content:css.css});await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.getByText('Open indicators',{exact:true}).click();
    assert.equal(await page.getByRole('dialog').evaluate(el=>getComputedStyle(el).backgroundColor),theme==='light'?'rgb(255, 255, 255)':'rgb(30, 48, 42)');
    const search=page.getByRole('textbox',{name:'Search indicators'});
    await search.fill('macd');
    const star=page.getByRole('button',{name:/Add .*MACD.* to favorites/i});
    await star.click();
    assert.equal(await page.evaluate(()=>window.selected),undefined,'starring must not add to chart');
    await page.getByRole('button',{name:'Close indicators'}).click();
    await page.getByText('Open indicators',{exact:true}).click();
    await page.getByRole('button',{name:'Favorites',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:/Remove .*MACD.* from favorites/i}).count(),1);
    await search.fill('no such indicator');
    await page.getByText('No matching indicators.').waitFor();
    await page.getByRole('button',{name:'Clear search'}).click();
    const bounds=await page.getByRole('dialog').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width);
    await page.getByRole('button',{name:/Remove .*MACD.* from favorites/i}).click();
    await page.getByText('Star indicators to find them here.').waitFor();
    await page.getByRole('button',{name:'All indicators',exact:true}).click();
    await search.fill('macd');
    await page.getByRole('button',{name:/^MACD/}).click();
    assert.equal(await page.evaluate(()=>window.selected),'macd');
    await page.getByText('Open indicators',{exact:true}).click();await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(),0);
    console.log('Indicator picker passed at',width);await page.close();
  }
}finally{await browser.close()}
