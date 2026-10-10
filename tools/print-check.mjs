// Renders the client printout to a PDF with headless Chrome, so page layout can be checked
// without clicking Print.
//   node tools/print-check.mjs [out.pdf] [port] [heavy]   (default ./printout.pdf, preview port 8766)
// "heavy" = worst case: spouse + 2 kids, meds, doctors, no current plan (ACA only), Medical Bill Saver on.
// Loads a fixed sample client (FL, 45, current plan + ACA shown, anchored on the current plan),
// builds the printout exactly as the Print button does, and reports which section starts each page.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = path.resolve(process.argv[2] || 'printout.pdf');
const PORT = process.argv[3] || '8766';
/* A full URL (https://mypoppro.com) checks the live site; a bare port checks a local preview. */
const BASE = /^https?:/.test(PORT) ? PORT.replace(/\/$/, '') : `http://127.0.0.1:${PORT}`;
const HEAVY = process.argv[4] === 'heavy';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DBG = 9300 + Math.floor(Math.random() * 500);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'poppro-print-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + DBG, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let ws, id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJS = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };

const SCENARIO = `(function(){ var HEAVY=${HEAVY};
  var s=blankState();
  s.client.pname='Sample Client'; s.client.state='FL'; s.client.zip='33101'; s.client.page=45; s.client.agent='Jesse Stamm'; s.client.date='';
  s.intake.income=60000; s.intake.pincome=60000; s.intake.visits=20; s.intake.anchor='cur'; s.intake.budget=600; s.intake.budgetComfort=450;
  s.intake.carrier='Florida Blue'; s.intake.plan='Silver PPO'; s.intake.whyShop='Premium went up again at renewal'; s.intake.whyMatters='keep my doctors and stop the premium climbing';
  s.intake.medList=[]; s.acaIn={status:'open',show:true,fullded:true,ov:{}};
  s.cur={show:true,prem:450,ded:5000,oop:8000,copay:50};
  if(HEAVY){ s.intake.who={app:true,spouse:true,kids:true}; s.client.sname='Sample Spouse'; s.client.sage=43;
    s.intake.kids=[{n:'Kid One',age:12},{n:'Kid Two',age:9}]; s.intake.anchor='aca'; s.cur={}; s.intake.carrier=''; s.intake.plan='';
    s.intake.medList=[{name:'Metformin'},{name:'Lisinopril'},{name:'Atorvastatin'}];
    s.intake.docs1='Dr. Ramirez (primary care)'; s.intake.docs2='Dr. Chen (cardiology)'; s.intake.keepafc='yes';
    s.negot={on:true,onEvery:false,pct:40,min:2500}; }
  localStorage.setItem('hf_pop_last',JSON.stringify(s));
})()`;

try {
  let ver; for (let i = 0; i < 50 && !ver; i++) { await sleep(150); ver = await fetch(`http://127.0.0.1:${DBG}/json/list`).then(r => r.json()).catch(() => null); }
  const page = ver.find(t => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } });
  await send('Page.enable'); await send('Runtime.enable');
  const url = `${BASE}/tool/`;
  await send('Page.navigate', { url }); await sleep(1500);
  await evalJS(SCENARIO);
  await send('Page.navigate', { url }); await sleep(2500);
  await evalJS(`setView('client'); buildPrintout(); true`); await sleep(2000);   // benefit files load async
  await evalJS(`buildPrintout(); true`); await sleep(500);
  // Which printout sections start each printed page: emulate print and read offsets.
  await send('Emulation.setEmulatedMedia', { media: 'print' });
  const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, paperWidth: 8.5, paperHeight: 11, marginTop: 0.4, marginBottom: 0.4, marginLeft: 0.4, marginRight: 0.4 });
  fs.writeFileSync(OUT, Buffer.from(pdf.data, 'base64'));
  const pages = (Buffer.from(pdf.data, 'base64').toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  const secs = await evalJS(`Array.from(document.querySelectorAll('#printout > *')).map(function(e){return e.className.split(' ')[0]+':'+Math.round(e.getBoundingClientRect().height);}).join(' | ')`);
  console.log('pages ' + pages + '  →  ' + OUT);
  console.log('sections ' + secs);
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill();
  await sleep(300);
  fs.rmSync(prof, { recursive: true, force: true });
}
