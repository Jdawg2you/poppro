// The Quote's "Send the quote" email, headless.   node tools/email-check.mjs [port]  (default 8767)
// Jesse, 24 Nov: the email is about the plan that was PRESENTED - its name, each piece, its price and the same comparison
// that plan's script speaks - never the generic "Healthcare Package of Protection" / "the Complete plan" buckets.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = process.argv[2] || '8767';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DBG = 9300 + Math.floor(Math.random() * 500);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'mailcheck-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + DBG, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(), errs = [];
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };

const TEST = `(async function(){ var w=ms=>new Promise(r=>setTimeout(r,ms)); await w(1200); window.confirm=()=>true; var fails=[], n=0, ok=function(c,m){ n++; if(!c) fails.push(m); };
 var sm=document.getElementById('setupModal'); if(sm) sm.classList.remove('open');
 var mk=async function(lineup,tier){ S=blankState(); applySuiteClient({first:'Pat',last:'Test',state:'TX',age:'45',dob:'01/01/1981',kids:[],health:{}}); S.intake.email='pat@example.com'; S.client.agent='Jesse Stamm'; S.agency='Optimum Health';
   goStep('quote'); await w(400); var b=document.querySelector('[data-lineup="'+lineup+'"]'); if(b) b.click(); await w(600); presentThis(tier); await w(1500); return buildEmail(); };
 var txt=function(h){ var d=document.createElement('div'); d.innerHTML=h; return d.textContent; };
 var generic=function(m){ return /Healthcare Package of Protection|the (Essential|Complete|Comprehensive) plan|plan we shared/.test(m.subject+m.body); };
 /* Manhattan */
 var m=await mk('mh','better');
 ok(/ManhattanLife Complete/.test(m.subject)&&!generic(m),'Manhattan: names the presented package: '+m.subject);
 ok(/Affordable Choice \\(/.test(m.body)&&/Hospital Indemnity Select \\(/.test(m.body)&&/All together: \\$/.test(m.body),'Manhattan: lists each piece and the total');
 ok(/First Health network/.test(m.body),'Manhattan: First Health network link');
 var lbOn=pkMonthly(S.packages.better)>0&&prLbMo('better')>0; ok(lbOn?/Living benefits — /.test(m.body):!/Living benefits/.test(m.body),'Manhattan: living benefits only when they are in it');
 /* Cigna, with a current plan anchor: the saving equals the script's price page */
 m=await mk('lx-mh-cg','best'); var C=curIn(); C.prem=1200; C.ded=6000; anchorSetTo('cur'); m=buildEmail();
 ok(/Cigna PPO plan/.test(m.subject)&&!generic(m)&&/Cigna PPO health plan/.test(m.body)&&/Amaze —/.test(m.body),'Cigna: named, with its pieces: '+m.subject);
 ok(!/Rx Valet/.test(m.body),'Cigna: no Rx Valet');
 ok(!/Living benefits/.test(m.body),'Cigna: no living benefits when none were sold');
 var sc=txt(prVsAnchor('best',false,false)).match(/\\$([\\d,.]+) a month back/), em=m.body.match(/about \\$([\\d,]+) a month less/);
 ok(sc&&em&&Math.round(+sc[1].replace(/,/g,''))===+em[1].replace(/,/g,''),'Cigna: the email saving is the script\\'s figure: '+(em&&em[1])+' vs '+(sc&&sc[1]));
 ok(/Cigna PPO network/.test(m.body),'Cigna: Cigna network link');
 /* Cigna more than the anchor: no saving claimed, as the script */
 C.prem=300; m=buildEmail(); ok(!/less|save/.test(m.body.split('WHAT’S IN IT')[1]),'Cigna above the anchor: no saving claimed');
 /* Bright Life */
 m=await mk('lx-mh-cg','good'); ok(/Bright Life plan/.test(m.subject)&&!generic(m)&&/Bright Life health plan/.test(m.body),'Bright Life: named: '+m.subject);
 /* ACA + protection: they KEEP the marketplace plan - never "you wouldn't carry its deductible"; no First Health link */
 m=await mk('aca','better'); ok(/marketplace plan plus protection/.test(m.subject)&&!generic(m),'ACA: named: '+m.subject);
 ok(!/wouldn’t (have|be carrying)/.test(m.body)&&!/First Health/.test(m.body),'ACA: no "skip the deductible" claim and no First Health link');
 ok(/apply for it yourself/.test(m.body),'ACA: says they apply for the marketplace plan themselves');
 /* Virtual Basic: side by side, never a saving; Amaze brochure named; no network link */
 m=await mk('vb','better'); var A=acaIn(); A.prem=900; A.ov=Object.assign({},A.ov,{prem:true}); m=buildEmail();
 ok(/Virtual Basic A/.test(m.subject)&&!generic(m),'Virtual Basic: named: '+m.subject);
 ok(!/less|save you/.test(m.body)&&!/First Health/.test(m.body)&&!/• Health plan:/.test(m.body)&&/• Amaze — everyday care:/.test(m.body),'Virtual Basic: no saving claim, no network link, Amaze brochure named');
 ok(!/Rx Valet/.test(m.body),'Virtual Basic: no Rx Valet');
 return {n:n, fails:fails}; })()`;
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
  console.log(bad.length ? `EMAIL FAILED ${bad.length}:\n  ` + bad.join('\n  ') : `EMAIL ok - ${r.n} checks`);
  process.exitCode = bad.length ? 1 : 0;
} catch (e) { console.log('EMAIL FAILED ' + e.message); process.exitCode = 1; }
finally { try { ws && ws.close(); } catch {} chrome.kill(); await sleep(300); fs.rmSync(prof, { recursive: true, force: true }); }
