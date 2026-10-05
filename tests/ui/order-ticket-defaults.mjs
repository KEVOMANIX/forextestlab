// Run: node tests/ui/order-ticket-defaults.mjs
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from 'tailwindcss';

const bundle = await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {OrderTicket} from './src/components/app/OrderTicket';
const state={status:'paused',currentPrice:'1.10000',currentTime:1,equity:'10000',balance:'10000',openPositions:[],
config:{symbol:'EURUSD',baseCurrency:'EUR',quoteCurrency:'USD',accountCurrency:'USD',pipSize:'0.0001',pricePrecision:5,spreadPips:'1',slippagePips:'0',commissionPerLot:'0',leverage:'100'}};
function App(){const [plan,setPlan]=React.useState(null);const [request,setRequest]=React.useState(null);
window.plan=plan;return <>
<button onClick={()=>{setPlan({direction:'short',entryPrice:'1.10200',stopLoss:'',takeProfit:''});setRequest({id:Date.now(),direction:'short',orderType:'limit',openPlanner:true})}}>Chart limit</button>
<OrderTicket state={state} tradePlan={plan} busy={false} lots="0.10" oneClickTrading={false}
onLotsChange={()=>{}} onTemplateChange={()=>{}} onPlaceOrder={order=>window.order=order}
onClearPlan={()=>setPlan(null)} activationRequest={request}
onDirectionChange={direction=>setPlan(current=>current?.direction===direction?current:{direction,entryPrice:'1.10000',stopLoss:'',takeProfit:''})}
onPlanChange={(level,value)=>setPlan(current=>({...current,[level]:value}))}/></>}
createRoot(document.getElementById('root')).render(<App/>);
`},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const css=await postcss([tailwind('./tailwind.config.ts')]).process(await readFile('src/app/globals.css','utf8'),{from:'src/app/globals.css'});
const browser=await chromium.launch();
try {
  const page=await browser.newPage();
  await page.setContent('<div id="root" class="app-theme-surface" style="position:relative;height:900px"></div>');
  await page.addStyleTag({content:css.css});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.getByRole('button',{name:/^Buy .* lot at/}).click();
  await page.getByRole('tab',{name:'limit',exact:true}).click();
  await page.waitForFunction(()=>window.plan?.stopLoss==='1.09700'&&window.plan?.takeProfit==='1.10300');
  const exits=page.getByRole('button',{name:/^Exits/});
  assert.equal(await exits.getAttribute('aria-expanded'),'false');
  await exits.click();
  const stop=page.getByRole('switch',{name:'Toggle Stop loss, price'});
  assert.equal(await stop.getAttribute('aria-checked'),'true');
  await stop.click();
  await exits.click();await exits.click();
  assert.equal(await stop.getAttribute('aria-checked'),'false','explicitly disabled exit must stay disabled');
  await page.getByRole('button',{name:'Clear trade plan'}).click();
  await page.getByRole('button',{name:'Chart limit'}).click();
  await page.waitForFunction(()=>window.plan?.stopLoss==='1.10400'&&window.plan?.takeProfit==='1.09800');
  assert.equal(await exits.getAttribute('aria-expanded'),'false');
  console.log('Limit defaults passed: buy, chart-picked sell, collapsed exits and manual opt-out.');
} finally {await browser.close();}
