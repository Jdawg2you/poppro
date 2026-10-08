// The medication box on Intake, driven in headless Chrome against a local preview.
//   node tools/med-check.mjs [port]     (default 8766)
// Checks: the big FDA/NADAC list loads; brand names off the core list are found (Vyvanse, Adderall XR) and
// price as generic/brand from the list; anything can be added as typed; Enter on a misspelling keeps what was
// typed instead of grabbing a sound-alike; a core alias still resolves to the core drug and lifts its condition.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = process.argv[2] || '8766';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DBG = 9300 + Math.floor(Math.random() * 500);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'medcheck-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + DBG, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(), errs = [];
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };

const TEST = `(async function(){
  var fails=[], ok=function(c,m){ if(!c) fails.push(m); }, wait=function(ms){ return new Promise(function(r){ setTimeout(r,ms); }); };
  window.confirm=function(){ return true; }; window.alert=function(){};
  for(var i=0;i<30&&!MED_FDA.length;i++) await wait(100);
  ok(MED_FDA.length>3000,'big list loaded ('+MED_FDA.length+')');
  S=blankState(); goStep('intake'); await wait(300);
  var type=async function(txt){ document.getElementById('addMed').click(); await wait(40); var ins=document.querySelectorAll('#medList input.mname'), inp=ins[ins.length-1];
    inp.focus(); inp.value=txt; inp.dispatchEvent(new Event('input')); await wait(40); var shown=inp.parentNode.querySelector('.medsug').innerText;
    inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); await wait(40); return shown; };
  var sh=await type('vyvanse'); ok(/Lisdexamfetamine/.test(sh),'Vyvanse offered with its generic name: '+sh);
  await type('adderall'); await type('Brand New Med 5mg'); var sv=await type('vivanse'); await type('lipitor');
  ok(/did you mean Vyvanse/.test(sv)&&/Add .vivanse. as typed/.test(sv),'misspelling: suggests Vyvanse and offers as-typed');
  var L=S.intake.medList.map(function(m){ return m.name; });
  ok(L.join('|')==='Vyvanse|Adderall XR|Brand New Med 5mg|vivanse|Atorvastatin','saved names: '+L.join('|'));
  var K=S.intake.medList.map(function(m){ return medKind(m); });
  ok(K[0]==='g'&&K[1]==='g'&&K[2]===null&&K[4]==='g','kinds Vyvanse g, Adderall XR g, typed unknown, Atorvastatin g: '+K.join());
  ok(medKind({name:'Eliquis'})==='b'&&medKind({name:'Jardiance'})==='b'&&medKind({name:'Wegovy'})==='b','brand-only drugs stay brand');
  ok(popMedFlags().some(function(f){ return f.m==='Atorvastatin'; }),'core drug still asks about its condition');
  ok(!popMedFlags().some(function(f){ return /Vyvanse|Adderall/.test(f.m); }),'big-list drugs never invent a condition');
  ok(popMedResolve('Vyvanse')==='Vyvanse','an exact big-list name is never fuzzed into a core drug');
  return {n:MED_FDA.length, fails:fails};
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
  console.log(bad.length ? `MEDS FAILED ${bad.length}:\n  ` + bad.join('\n  ') : `MEDS ok list=${r.n}`);
  process.exitCode = bad.length ? 1 : 0;
} catch (e) { console.log('MEDS FAILED ' + e.message); process.exitCode = 1; }
finally { try { ws && ws.close(); } catch {} chrome.kill(); await sleep(300); fs.rmSync(prof, { recursive: true, force: true }); }
