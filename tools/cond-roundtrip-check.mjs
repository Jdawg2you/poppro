// Conditions round trip MyPopPro -> Discovery (Jesse, 21 Oct): medication-made conditions stay in MyPopPro; the Intake list wins;
// spouse conditions go to the spouse; a typed condition shows ticked in Discovery so it can be removed.   node tools/cond-roundtrip-check.mjs [navigator-port]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = process.argv[2] || '8777';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DBG = 9300 + Math.floor(Math.random() * 500);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'revcheck-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + DBG, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(), errs = [];
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };

const TEST = `(async function(){ var w=ms=>new Promise(r=>setTimeout(r,ms)); await w(1500); var fails=[], ok=function(c,m){ if(!c) fails.push(m); };
 var pop={app:'poppro',client:{pname:'Pat Probe'},intake:{conds:[{name:"RA / lupus / lymphoma / Crohn's (ongoing)",fromAfc:true,fromMed:'prednisone',forP:true},{name:'Lupus',forP:true},{name:'Diabetes',forP:false,forS:true}]},nav:{conds:["RA / lupus / lymphoma / Crohn's (ongoing)",'Asthma (chronic)']}};
 ok(isPopProFile(pop),'test file reads as MyPopPro');
 var P2=profileFromFile(pop);
 ok(P2.conds.indexOf("RA / lupus / lymphoma / Crohn's (ongoing)")<0,'a MyPopPro medication-made condition does not travel back: '+JSON.stringify(P2.conds));
 ok(P2.conds.indexOf('Asthma (chronic)')<0&&P2.conds.indexOf('Lupus')>=0,'the Intake list wins over the stale saved call');
 ok((P2.sp_conds||[]).indexOf('Diabetes')>=0&&P2.conds.indexOf('Diabetes')<0,'spouse conditions go to the spouse');
 P=P2; var h=condsHTMLFor(''); P.conds.push('Gout (typed)'); h=condsHTMLFor(''); ok(h.indexOf('data-cond="Gout (typed)" data-condwho="" checked')>=0,'a typed condition shows ticked so it can be taken off');
 return {n:5, fails:fails}; })()`;
try {
  let l; for (let i = 0; i < 60 && !l; i++) { await sleep(150); l = await fetch(`http://127.0.0.1:${DBG}/json/list`).then(r => r.json()).catch(() => null); }
  ws = new WebSocket(l.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', m => { const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    if (d.method === 'Runtime.exceptionThrown') errs.push((d.params.exceptionDetails.exception || {}).description || d.params.exceptionDetails.text); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html?script=health` }); await sleep(4000);
  const r = await ev(TEST);
  /* the script is Health ZONE's file, unchanged */
  const SRC = '/Users/jessestamm/Documents/Claude/Projects/Health Insurance/_training/benefits-review/Benefits_Review_Script.html';
  if (fs.existsSync(SRC) && fs.readFileSync(SRC, 'utf8') !== fs.readFileSync(new URL('../tool/benefits-review.html', import.meta.url), 'utf8')) r.fails.push('tool/benefits-review.html differs from Health ZONE\'s source');
  const bad = r.fails.concat(errs.map(e => 'page error: ' + String(e).slice(0, 160)));
  console.log(bad.length ? `CONDS-ROUNDTRIP FAILED ${bad.length}:\n  ` + bad.join('\n  ') : `CONDS-ROUNDTRIP ok - ${r.n} checks`);
  process.exitCode = bad.length ? 1 : 0;
} catch (e) { console.log('CONDS-ROUNDTRIP FAILED ' + e.message); process.exitCode = 1; }
finally { try { ws && ws.close(); } catch {} chrome.kill(); await sleep(300); fs.rmSync(prof, { recursive: true, force: true }); }
