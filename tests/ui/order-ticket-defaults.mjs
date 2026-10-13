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
import {drawingOrderDraft} from './src/lib/backtest/drawing-order';
import {defaultStyle} from './src/lib/chart/drawing/types';
const state={status:'paused',currentPrice:'1.10000',currentTime:1,equity:'10000',balance:'10000',openPositions:[],
config:{symbol:'EURUSD',baseCurrency:'EUR',quoteCurrency:'USD',accountCurrency:'USD',pipSize:'0.0001',pricePrecision:5,spreadPips:'1',slippagePips:'0',commissionPerLot:'0',leverage:'100'}};
function App(){const [plan,setPlan]=React.useState(null);const [request,setRequest]=React.useState(null);const [oneClick,setOneClick]=React.useState(false);const [lots,setLots]=React.useState('0.10');
window.plan=plan;return <>
<button onClick={()=>{setPlan({direction:'short',entryPrice:'1.10200',stopLoss:'',takeProfit:''});setRequest({id:Date.now(),direction:'short',orderType:'limit',openPlanner:true})}}>Chart limit</button>
<button onClick={()=>{const drawing={kind:'long',points:[{price:1.1},{price:1.098},{price:1.104}],style:{...defaultStyle('long'),risk:1.5,riskMode:'percent'}};const draft=drawingOrderDraft(drawing,state);setPlan(draft.plan);setOneClick(true);setRequest({id:Date.now(),direction:'long',orderType:draft.orderType,openPlanner:true,riskPercent:draft.riskPercent});}}>Position tool</button>
<OrderTicket compactQuote state={state} tradePlan={plan} busy={false} lots={lots} oneClickTrading={oneClick}
onLotsChange={setLots} onTemplateChange={()=>{}} onPlaceOrder={order=>window.order=order}
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
  const lotPanel=page.getByTestId('quick-lot-size');
  const lotInput=page.getByRole('textbox',{name:'Order size in lots'});
  for(const side of ['Buy','Sell']) {
    await page.getByRole('button',{name:new RegExp('^'+side+' .* lot at')}).hover();
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-testid="quick-lot-size"]')).opacity==='1');
    await lotInput.hover();
    await lotPanel.getByRole('button',{name:'0.50',exact:true}).click();
    assert.equal(await lotInput.inputValue(),'0.50');
    assert.equal(await page.evaluate(()=>window.order),undefined,'Changing size must not place an order');
    await lotInput.fill('0.10');
    await lotInput.press('Tab');
    await page.mouse.move(700,700);
    await page.locator('body').click({position:{x:700,y:700}});
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-testid="quick-lot-size"]')).opacity==='0');
  }
  await page.getByRole('button',{name:/^Buy .* lot at/}).focus();
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-testid="quick-lot-size"]')).opacity==='1');
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
  await page.getByRole('button',{name:'Clear trade plan'}).click();
  await page.getByRole('button',{name:'Position tool',exact:true}).click();
  await page.waitForFunction(()=>window.plan?.stopLoss==='1.09800'&&window.plan?.takeProfit==='1.10400');
  assert.equal(await page.evaluate(()=>window.order),undefined,'one-click must not submit a drawing automatically');
  await page.getByRole('button',{name:/^Buy .* EURUSD MARKET$/}).click();
  const placed=await page.evaluate(()=>window.order);
  assert.equal(placed.riskPercent,'1.5');assert.equal(placed.stopLoss,'1.09800');assert.equal(placed.takeProfit,'1.10400');assert.equal(placed.orderType,'market');
  console.log('Limit defaults passed: buy, chart-picked sell, collapsed exits and manual opt-out.');
} finally {await browser.close();}
