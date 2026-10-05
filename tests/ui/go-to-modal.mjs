import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {GoToModal} from './src/components/app/GoToModal';
function App(){const [hours,setHours]=useState({});return <GoToModal open onClose={()=>{}} anchor={null} currentTime={Date.UTC(2020,4,7)} currentPrice={1.12} pipSize={0.0001} precision={5} candles={[{timestamp:Date.UTC(2020,4,1),open:'1.1',high:'1.2',low:'1',close:'1.12'}]} visibleIndex={0} timeZone="UTC" endTime={Date.UTC(2020,5,1)} sessionHours={hours} canWaitForClose={false} busy={false} onJump={(target,label)=>window.jump={target,label}} onSessionHoursChange={h=>{window.saved=h;setHours(h)}}/>};createRoot(document.getElementById('root')).render(<App/>);` }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
const browser=await chromium.launch();
try {
 const page=await browser.newPage({viewport:{width:1000,height:800}});
 await page.setContent('<style>:root{--app-panel-solid:#1c3029;--app-panel-2:#13251e;--app-border:#39574a;--app-text:#edf7f2}body{color:#edf7f2;background:#0d1c16}</style><div id="root"></div>');
 for(const f of fs.readdirSync('.next/static/chunks').filter(f=>f.endsWith('.css'))) await page.addStyleTag({content:fs.readFileSync('.next/static/chunks/'+f,'utf8')});
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.getByRole('button',{name:'Session settings',exact:true}).click();
 await page.getByLabel('London Open',{exact:true}).fill('07:30');
 assert.equal(await page.getByRole('navigation',{name:'Go to destinations'}).isVisible(),false);
 await page.getByRole('button',{name:'London time zone',exact:true}).click();
 await page.getByRole('textbox',{name:'Search time zones'}).fill('Nairobi');
 await page.getByRole('option',{name:/Nairobi/}).click();
 await page.getByRole('button',{name:'Save settings',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>window.saved.london),{openMinutes:450,closeMinutes:990,zone:'Africa/Nairobi'});
 await page.getByRole('button',{name:'Go to London open',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.jump),undefined);
 await page.getByRole('button',{name:'Go to selection',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.jump.target.timestamp),Date.UTC(2020,4,7,4,30));
 await page.getByRole('button',{name:'Price levels',exact:true}).click();
 assert.equal(await page.getByRole('group',{name:'Direction'}).isVisible(),false);
 await page.getByRole('button',{name:'Sessions',exact:true}).click();
 await page.screenshot({path:'.tmp/go-to-sidebar.png'});
 await page.setViewportSize({width:375,height:800});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=375),true);
 console.log('Go to sidebar, saved hours/zone, explicit navigation and mobile width passed.');
} finally {await browser.close();}
