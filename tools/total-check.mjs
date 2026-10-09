// Package totals = the products in them. The classic panel's Living Benefits box is hidden in B but kept pricing in
// the background, and a hidden ~$45 (plus a hard-coded lb:45 on Comprehensive) was added on top of the builder's own
// living benefits. Fixed 2026-10-08.   node tools/total-check.mjs [port]   (default 8766)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = process.argv[2] || '8766';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DBG = 9300 + Math.floor(Math.random() * 500);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'totcheck-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + DBG, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(), errs = [];
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };

const TEST = `(async function(){
  var fails=[], ok=function(c,m){ if(!c) fails.push(m); }, wait=function(ms){ return new Promise(function(r){ setTimeout(r,ms); }); };
  window.confirm=function(){ return true; };
  var same=function(t){ var a=tierTotals(t).mo, b=S.packages[t].products.reduce(function(x,p){ return x+(+p.monthly||0); },0)+(+S.packages[t].med||0); return Math.abs(a-b)<0.005?'':t+' total '+a.toFixed(2)+' vs products '+b.toFixed(2); };
  ok(blankState().packages.best.lb===0,'a new quote starts with no hidden living-benefit figure');
  /* the sequence that leaked on the live site */
  S=blankState(); applySuiteClient({first:'P',last:'Q',state:'TX',age:'34',dob:'01/01/1992',kids:[],health:{}}); S.intake.who.spouse=true; S.client.sname='Sam'; S.client.sage=33;
  S.intake.anchor='aca'; ['good','better','best'].forEach(function(t){ S.include[t]=true; }); autoPriceTiers(); compute(); evApplyPreset(0,'hosp'); goStep('quote'); await wait(200); chooseTier('best');
  ['good','better','best'].forEach(function(t){ var m=same(t); ok(!m,'spouse + example sequence: '+m); });
  /* an old save carrying a stale figure on a tier that is not open */
  var raw=JSON.parse(JSON.stringify(S)); raw.packages.best.lb=45; raw.activeTab='good'; S=deepMerge(blankState(),raw); fill(); compute(); await wait(200);
  ['good','better','best'].forEach(function(t){ var m=same(t); ok(!m,'old save: '+m); });
  /* living benefits: an Other carrier is priced from what the agent types, and totals still add up */
  S=blankState(); applySuiteClient({first:'P',last:'Q',state:'TX',age:'34',dob:'01/01/1992',kids:[],health:{}}); ['good','better','best'].forEach(function(t){ S.include[t]=true; }); autoPriceTiers(); compute();
  var c=effCfg('best'); c.lb=c.lb||{}; c.lb.p={face:'75000',carrier:'other',otherName:'Corebridge QoL Flex',otherMonthly:'41.50'}; S.packages.best.dropped=(S.packages.best.dropped||[]).filter(function(x){ return x!=='lbp'; }); pbReprice();
  var pr=S.packages.best.products.filter(function(p){ return p.k==='lbp'; })[0];
  ok(pr&&pr.monthly===41.5&&/\$75K \(Corebridge QoL Flex\)/.test(pr.name),'Other carrier priced as typed: '+(pr&&pr.name));
  ok(!same('best'),'Other carrier: '+same('best'));
  c.lb.p.otherMonthly=''; pbReprice(); ok(!S.packages.best.products.some(function(p){ return p.k==='lbp'&&+p.monthly>0; }),'no premium typed yet: nothing invented');
  return {n:4, fails:fails};
})()`;

try {
  let l; for (let i = 0; i < 60 && !l; i++) { await sleep(150); l = await fetch(`http://127.0.0.1:${DBG}/json/list`).then(r => r.json()).catch(() => null); }
  ws = new WebSocket(l.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', m => { const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    if (d.method === 'Runtime.exceptionThrown') errs.push((d.params.exceptionDetails.exception || {}).description || d.params.exceptionDetails.text); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/tool/` }); await sleep(4000);
  const r = await ev(TEST);
  const bad = r.fails.concat(errs.map(e => 'page error: ' + String(e).slice(0, 160)));
  console.log(bad.length ? `TOTALS FAILED ${bad.length}:\n  ` + bad.join('\n  ') : `TOTALS ok - every package total equals its products`);
  process.exitCode = bad.length ? 1 : 0;
} catch (e) { console.log('TOTALS FAILED ' + e.message); process.exitCode = 1; }
finally { try { ws && ws.close(); } catch {} chrome.kill(); await sleep(300); fs.rmSync(prof, { recursive: true, force: true }); }
