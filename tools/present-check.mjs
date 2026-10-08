// Present mode (sandbox), driven in headless Chrome against a local preview.
//   node tools/present-check.mjs [port]     (default 8767)
// Checks: the stepper reads Intake, Quote, Present, Enroll; every blank in the script fills from the chosen
// package (no [missing:]); Present never shows on Client View; "Show them" + Back returns to the same section;
// the Apply list puts life first, then ManhattanLife, then the base plan; the mother's maiden name is shown
// while typed but is never in the saved state, localStorage or the printout.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = process.argv[2] || '8767';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DBG = 9300 + Math.floor(Math.random() * 500);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'prcheck-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + DBG, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(), errs = [];
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };

const TEST = `(async function(){
  var fails=[], ok=function(c,m){ if(!c) fails.push(m); }, wait=function(ms){ return new Promise(function(r){ setTimeout(r,ms); }); };
  window.confirm=function(){ return true; }; window.alert=function(){};
  S=blankState(); applySuiteClient({first:'Pat',last:'Present',state:'TX',age:'45',dob:'01/01/1981',kids:[],health:{}});
  S.intake.whyShop='renewal went up again'; S.intake.anchor='aca'; S.aca.prem=620; S.aca.ded=7500; S.intake.medList=[{name:'Metformin'}];
  ['good','better','best'].forEach(function(t){ S.include[t]=true; }); autoPriceTiers(); compute(); goStep('quote'); await wait(500);
  /* put living benefits on the chosen package so life-first is exercised */
  var c=effCfg('best'); c.lb=c.lb||{}; c.lb.p={carrier:'americo',face:'50000'}; autoPriceTiers(); compute(); await wait(200);
  ok(Array.prototype.map.call(document.querySelectorAll('#stepper button'),function(b){ return b.dataset.step; }).join()==='intake,quote,present,enroll','stepper order');
  var pb=document.querySelector('[data-act="present"]'); ok(!!pb,'Present button on the Quote step');
  chooseTier('best'); pb=document.querySelector('[data-act="present"]'); pb.click(); await wait(300);
  ok(S.step==='present'&&getComputedStyle(document.getElementById('step-present')).display!=='none','Present step opens');
  var missing=[], filled=0;
  for(var i=0;i<PRESENT_SCRIPT.length-1;i++){ S.present.sec=i; renderPresent(); await wait(20);
    var h=document.getElementById('presentHost');
    h.querySelectorAll('.pr-miss').forEach(function(m){ missing.push(PRESENT_SCRIPT[i].id+':'+m.textContent); });
    filled+=h.querySelectorAll('.pr-val').length; }
  ok(!missing.length,'every blank fills: '+missing.join(', '));
  ok(filled>=15,'blanks filled across the script ('+filled+')');
  var T=presentTokens('best'); ok(T['plan.monthly']===fmt2(tierTotals('best').mo),'plan.monthly = package total ('+T['plan.monthly']+')');
  /* Show them -> Client View, Back -> same section */
  S.present.sec=2; renderPresent(); presentShow('ev'); await wait(150);
  ok(document.body.classList.contains('client'),'Show them flips to Client View');
  ok(getComputedStyle(document.getElementById('step-present')).display==='none','script hidden on Client View');
  ok(getComputedStyle(document.getElementById('presentBack')).display!=='none','Back to the script button showing');
  ok(!/PLACEHOLDER|pr-line/.test(document.getElementById('printout').innerHTML),'no script text in the printout');
  presentBack(); await wait(100);
  ok(!document.body.classList.contains('client')&&S.step==='present'&&S.present.sec===2,'Back returns to section 3 ('+S.step+' '+S.present.sec+')');
  ok(getComputedStyle(document.getElementById('presentBack')).display==='none','Back button hides again');
  /* Apply order */
  var steps=presentApplyPlan('best').map(function(s){ return s.car.split(' ')[0]; });
  ok(steps[0]==='Americo','life first: '+steps.join(' > '));
  ok(steps.indexOf('ManhattanLife')>0,'ManhattanLife after life: '+steps.join(' > '));
  /* the life step names the carrier that was actually priced, even when the builder fell back from another */
  effCfg('best').lb.p.carrier='moo'; autoPriceTiers(); compute(); await wait(100);
  presentApplyPlan('best').filter(function(s){ return /Term/.test(s.car); }).forEach(function(s){ s.items.forEach(function(p){ var m=String(p.name).match(/\\((Americo|Mutual)/);
    ok(!m||s.car.indexOf(m[1])===0,'life step '+s.car+' matches the priced policy '+p.name); }); });
  chooseTier('best');
  /* maiden name: in memory only */
  S.present.sec=PRESENT_SCRIPT.length-1; renderPresent(); await wait(30);
  var mm=document.querySelector('[data-prf="mmn"]'); ok(!!mm,'maiden-name box on Apply');
  if(mm){ mm.value='Zzyzxmaiden'; mm.dispatchEvent(new Event('change')); await wait(50); }
  ok(/Zzyzxmaiden/.test(document.getElementById('presentHost').innerText),'typed maiden name shows for copying');
  autosave(); await wait(50);
  var ls=''; for(var j=0;j<localStorage.length;j++){ ls+=localStorage.getItem(localStorage.key(j)); }
  ok(!/Zzyzxmaiden/.test(JSON.stringify(S))&&!/Zzyzxmaiden/.test(ls),'maiden name not in saved state or localStorage');
  setView('client'); buildPrintout(); ok(!/Zzyzxmaiden/.test(document.getElementById('printout').innerHTML),'maiden name not on the printout'); setView('agent');
  /* positive control for the storage check */
  S.intake.beneficiary='Zzyzxbenef'; autosave(); await wait(50); var ls2=''; for(var j2=0;j2<localStorage.length;j2++){ ls2+=localStorage.getItem(localStorage.key(j2)); }
  ok(/Zzyzxbenef/.test(ls2),'control: a saved field does reach localStorage');
  return {n:filled, fails:fails};
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
  console.log(bad.length ? `PRESENT FAILED ${bad.length}:\n  ` + bad.join('\n  ') : `PRESENT ok blanks=${r.n}`);
  process.exitCode = bad.length ? 1 : 0;
} catch (e) { console.log('PRESENT FAILED ' + e.message); process.exitCode = 1; }
finally { try { ws && ws.close(); } catch {} chrome.kill(); await sleep(300); fs.rmSync(prof, { recursive: true, force: true }); }
