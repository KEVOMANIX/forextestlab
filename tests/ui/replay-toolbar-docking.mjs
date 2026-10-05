// Run: node tests/ui/replay-toolbar-docking.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { chromium } from '@playwright/test';

const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {ReplayToolbar} from './src/components/app/ReplayToolbar';
const state={status:'paused',speed:600,visibleIndex:10,lockedBeforeIndex:-1,currentPrice:'1.10000',equity:'10000',openPositions:[],
config:{symbol:'EURUSD',baseCurrency:'EUR',quoteCurrency:'USD',accountCurrency:'USD',pipSize:'0.0001',pricePrecision:5,spreadPips:'1',slippagePips:'0',commissionPerLot:'0',leverage:'100',initialVisibleCount:1}};
createRoot(document.getElementById('root')).render(<ReplayToolbar state={state} busy={false} lots="0.10" canTrade maxReplaySpeed={86400} onLotsChange={()=>{}} onPlay={()=>window.played=true} onPause={()=>{}} onNext={()=>{}} onPrev={()=>{}} onRestart={()=>{}} onEnd={()=>{}} onSpeed={()=>{}} onBuy={()=>{}} onSell={()=>{}}/>);
`},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const css=await postcss([tailwind('./tailwind.config.ts')]).process(await readFile('src/app/globals.css','utf8'),{from:'src/app/globals.css'});
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  await page.route('http://toolbar.test/**',route=>route.fulfill({contentType:'text/html',body:'<div id="root" class="app-theme-surface"></div>'}));
  async function mount(){await page.goto('http://toolbar.test');await page.addStyleTag({content:css.css});await page.addScriptTag({content:bundle.outputFiles[0].text});await page.getByTestId('replay-toolbox-handle').waitFor();}
  async function drag(y){const b=await page.getByTestId('replay-toolbox-handle').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(500,y,{steps:8});await page.mouse.up();}
  const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('forextestlab:replay-position')));
  await mount();await drag(5);
  assert.equal((await stored()).dock,'top');
  await drag(795);
  assert.equal((await stored()).dock,'bottom');
  assert.equal(await page.evaluate(()=>window.played),undefined);
  await page.getByRole('button',{name:'Choose replay speed'}).click();
  const menu=await page.getByRole('menu',{name:'Replay speed',exact:true}).boundingBox();
  assert.ok(menu.y>=0 && menu.y+menu.height<800,'bottom-docked speed menu stays visible');
  await mount();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('forextestlab:replay-position'))?.dock==='bottom');
  await page.setViewportSize({width:1000,height:650});
  await page.waitForFunction(()=>Math.abs(document.querySelector('[data-tour="replay-controls"]').getBoundingClientRect().bottom-(innerHeight-4))<1);
  await page.getByRole('button',{name:'Play replay',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.played),true);
  console.log('Replay toolbar: top/bottom docking, menu bounds, persistence, resize and playback passed.');
} finally {await browser.close();}
