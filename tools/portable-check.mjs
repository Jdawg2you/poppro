// Portable client file: one JSON per client opens in POP Pro or the Script Navigator, from any starting point.
// Drives the real pages side by side in headless Chrome - POP Pro (default 8767) and the navigator (default 8777) -
// and walks one client round the loop: navigator save -> POP Pro load -> POP Pro edits + save -> navigator load ->
// navigator edits + save -> POP Pro load. Fails if a navigator-only answer, a POP Pro-only product, or the newer
// edit from either side is lost. Also checks the push carries the whole call and that old files still load.
//   node tools/portable-check.mjs [poppro-port] [navigator-port]     -> PORTABLE ok
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const PP = process.argv[2] || '8767', NP = process.argv[3] || '8777';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', DBG = 9200 + Math.floor(Math.random() * 90);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'port-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + DBG, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function page(url) {
  const t = await fetch(`http://127.0.0.1:${DBG}/json/new?${url}`, { method: 'PUT' }).then(r => r.json());
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = new Map(), errs = [];
  ws.addEventListener('message', m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') errs.push((d.params.exceptionDetails.exception || {}).description || d.params.exceptionDetails.text); });
  const send = (m, p = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await send('Runtime.enable');
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result.result.value; };
  return { ev, errs, close: () => ws.close() };
}
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
try {
  let l; for (let i = 0; i < 60 && !l; i++) { await sleep(150); l = await fetch(`http://127.0.0.1:${DBG}/json/list`).then(r => r.json()).catch(() => null); }
  const pop = await page(`http://127.0.0.1:${PP}/tool/`), nav = await page(`http://127.0.0.1:${NP}/`);
  await sleep(5000);
  ok(await pop.ev('typeof loadQuoteObject') === 'function', 'POP Pro has the portable loader');
  ok(await nav.ev('typeof profileFromFile') === 'function', 'navigator has the portable loader');
  // 1. a call done in the navigator, saved as a profile file (its Save Profile writes P as-is)
  const navFile1 = await nav.ev(`(function(){ P={first:'Port',last:'Able',dob:'01/01/1980',age:'46',state:'TX',zip:'77001',sex:'Male',married:'Married',sp_name:'Sam',sp_last:'Able',sp_dob:'02/02/1982',sp_age:'44',
      why_matters:'keep Dr. Patel',why_note:'premium went up',keep_docs:'Yes',lead:'LFL',next_same:'Yes',cur_prem:'900',cur_ded:'7000'}; return JSON.parse(JSON.stringify(P)); })()`);
  // 2. opened in POP Pro, quote built, a POP Pro-only product added, an answer changed, saved
  const popFile1 = await pop.ev(`(async function(){ window.confirm=function(){ return true; }; window.alert=function(){}; var w=function(ms){ return new Promise(function(r){ setTimeout(r,ms); }); };
      var where=loadQuoteObject(${JSON.stringify(navFile1)}); ['good','better','best'].forEach(function(t){ S.include[t]=true; }); autoPriceTiers(); compute(); await w(200);
      S.packages.best.products.push({name:'ZZ Other cancer plan',monthly:41.5,other:true}); S.intake.whyMatters='never get wiped out'; compute();
      var d=currentQuote(); d.format='optimum-client'; d.formatV=1; return {where:where, file:d}; })()`);
  ok(popFile1.where === 'intake', 'a plain navigator file opens POP Pro on the Intake');
  ok(popFile1.file.nav && popFile1.file.nav.keep_docs === 'Yes' && popFile1.file.nav.lead === 'LFL', 'POP Pro save carries the whole navigator call (incl. answers POP Pro has no box for)');
  ok(popFile1.file.format === 'optimum-client', 'POP Pro save is marked portable');
  // 3. that POP Pro file opened in the navigator, edited there, saved again
  const navFile2 = await nav.ev(`(function(){ P=profileFromFile(${JSON.stringify(popFile1.file)}); var r={keep:P.keep_docs, lead:P.lead, wm:P.why_matters, hasPop:!!P._pop, other:(((P._pop||{}).packages||{}).best||{}).products.some(function(p){ return p.name==='ZZ Other cancer plan'; })};
      P.why_note='changed in the navigator'; r.file=JSON.parse(JSON.stringify(P)); return r; })()`);
  ok(navFile2.keep === 'Yes' && navFile2.lead === 'LFL', 'navigator restores its own answers from a POP Pro file');
  ok(navFile2.wm === 'never get wiped out', 'navigator picks up the newer POP Pro edit');
  ok(navFile2.hasPop && navFile2.other, 'navigator keeps the POP Pro quote inside its profile');
  // 4. back into POP Pro
  const back = await pop.ev(`(async function(){ S=blankState(); var where=loadQuoteObject(${JSON.stringify(navFile2.file)}); compute();
      return {where:where, other:(S.packages.best.products||[]).some(function(p){ return p.name==='ZZ Other cancer plan'; }), why:S.intake.whyShop, wm:S.intake.whyMatters, navKeep:(S.nav||{}).keep_docs, noPop:!(S.nav||{})._pop}; })()`);
  ok(back.where === 'quote' && back.other, 'POP Pro restores its quote (the Other product) from a navigator file');
  ok(back.why === 'changed in the navigator', 'POP Pro picks up the newer navigator edit');
  ok(back.wm === 'never get wiped out', 'and keeps its own earlier edit');
  ok(back.navKeep === 'Yes' && back.noPop, 'the call rides along without nesting copies');
  // 5. the push carries the whole call
  const pushed = await pop.ev(`(async function(){ S=blankState(); window.postMessage({source:'optimum-suite',type:'client',v:1,client:{first:'Push',last:'Test',state:'TX',age:'40',dob:'01/01/1986',kids:[],health:{}},profile:{first:'Push',last:'Test',lead:'GOAT'}},'*');
      await new Promise(function(r){ setTimeout(r,400); }); return (S.nav||{}).lead||null; })()`);
  ok(pushed === 'GOAT', 'a push from the navigator keeps the whole call in POP Pro');
  // 6. old files: a POP Pro quote with no call inside still opens in the navigator as before
  const oldPop = await nav.ev(`(function(){ var o=${JSON.stringify(popFile1.file)}; delete o.nav; var p=profileFromFile(o); return {first:p.first, wm:p.why_matters}; })()`);
  ok(oldPop.first === 'Port' && oldPop.wm === 'never get wiped out', 'an old POP Pro file (no call inside) still opens in the navigator');
  const errs = pop.errs.concat(nav.errs).map(e => 'page error: ' + String(e).slice(0, 160));
  const all = fails.concat(errs);
  console.log(all.length ? 'PORTABLE FAILED ' + all.length + ':\n  ' + all.join('\n  ') : 'PORTABLE ok (navigator -> POP Pro -> navigator -> POP Pro, push, old files)');
  process.exitCode = all.length ? 1 : 0; pop.close(); nav.close();
} catch (e) { console.log('PORTABLE FAILED ' + e.message); process.exitCode = 1; }
finally { chrome.kill(); await sleep(300); try { fs.rmSync(prof, { recursive: true, force: true }); } catch {} }
