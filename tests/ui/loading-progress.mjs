// Run: node tests/ui/loading-progress.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { chromium } from '@playwright/test';

const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
  import React from 'react'; import {createRoot} from 'react-dom/client';
  import {LoadingProgress} from './src/components/LoadingProgress';
  function App() { const [value, setValue] = React.useState(25); window.setProgress = setValue;
    return <div style={{width:'min(256px,80vw)',margin:'80px auto'}}><LoadingProgress value={value} label="Loading chart history"/></div>; }
  createRoot(document.getElementById('root')).render(<App/>);
` }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: {'process.env.NODE_ENV':'"production"'} });
const css = await postcss([tailwind('./tailwind.config.ts')]).process(await readFile('src/app/globals.css','utf8'), {from:'src/app/globals.css'});
const browser = await chromium.launch();
try {
  for (const width of [390,1280]) {
    const page = await browser.newPage({viewport:{width,height:600},reducedMotion:'reduce'});
    await page.setContent('<div id="root"></div>');
    await page.addStyleTag({content:css.css});
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    const bar = page.getByRole('progressbar');
    for (const [value,expected] of [[25,25],[45,45],[90,90],[150,100],[-5,0]]) {
      await page.evaluate(value=>window.setProgress(value),value);
      await page.getByText(expected+'%',{exact:true}).waitFor();
      assert.equal(await bar.getAttribute('aria-valuenow'),String(expected));
      const ratio = await bar.evaluate(el=>el.firstElementChild.getBoundingClientRect().width/el.getBoundingClientRect().width);
      assert.ok(Math.abs(ratio-expected/100)<0.01,'fill must match displayed progress');
    }
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.close();
  }
  console.log('Loading progress passed: responsive fill, percentage, bounds, accessibility.');
} finally { await browser.close(); }
