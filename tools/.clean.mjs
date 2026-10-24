// Benefits Review (sandbox), headless.   node tools/review-check.mjs [port]  (default 8767)
// The step after Enroll: the carrier panel saves into the client file and never defaults the draft date; the script is
// Health ZONE's copy unchanged; agent-only notes hidden; the prescription sentence is the true one (gain / partial /
// neither); dental and tier-below screens only when they apply; the four on-call ticks persist; the resource page
// comes from Setup unless the client has their own.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = process.argv[2] || '8767';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DBG = 9300 + Math.floor(Math.random() * 500);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'revcheck-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + DBG, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(), errs = [];
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };

const TEST = `(async function(){ var w=ms=>new Promise(r=>setTimeout(r,ms)); for(var k=0;k<40&&PR_STATE!=='ok';k++) await w(250); var fails=[], ok=function(c,m){ if(!c) fails.push(m); };
 S=blankState(); S.client.pname='Pat Test'; S.client.agent='Agent Test'; S.client.state='TX'; S.client.page='45'; fill(); recommendBundles(); autoPriceTiers(); chooseTier('best'); await w(100);
 document.querySelectorAll('.modal.open').forEach(function(m){ m.classList.remove('open'); });
 var count=function(doc){ var all=[].slice.call(doc.querySelectorAll('.flag,[data-author="note"]')); return {total:all.length, shown:all.filter(function(e){ return doc.defaultView.getComputedStyle(e).display!=='none'; }).length}; };
 presentOpen(); for(var k=0;k<40;k++){ await w(150); var f=document.getElementById('prFrame'); if(f&&f.contentDocument&&f.contentDocument.body&&f.contentDocument.querySelector('[data-screen]')) break; }
 await w(400); var pr=count(document.getElementById('prFrame').contentDocument);
 ok(pr.total>0,'control: the live presentation script really contains flags/notes ('+pr.total+')'); ok(pr.shown===0,'Present shows none of them ('+pr.shown+' visible)');
 var txt=document.getElementById('prFrame').contentDocument.body.innerText; ok(!/WE AGREED TO COME BACK|Open questions for Jesse/i.test(txt),'no flag wording in the visible text');
 goStep('enroll'); await w(1500); var e2=document.getElementById('enFrame2'); var en=e2&&e2.contentDocument?count(e2.contentDocument):{total:-1,shown:-1}; ok(en.shown===0,'Enroll wrap-up shows none ('+JSON.stringify(en)+')');
 goStep('review'); for(var k=0;k<40;k++){ await w(150); var r=document.getElementById('rvFrame'); if(r&&r.contentDocument&&r.contentDocument.body&&r.contentDocument.body.dataset.rvp) break; }
 await w(400); var rv=count(document.getElementById('rvFrame').contentDocument); ok(rv.total>0&&rv.shown===0,'Benefits Review shows none ('+JSON.stringify(rv)+')');
 var rtxt=document.getElementById('rvFrame').contentDocument.body.innerText; ok(!/Open questions for Jesse|WE AGREED TO COME BACK/i.test(rtxt),'no flag wording in the review text');
 return {n:6, fails:fails}; })()`;
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
  /* the script is Health ZONE's file, unchanged */
  const SRC = '/Users/jessestamm/Documents/Claude/Projects/Health Insurance/_training/benefits-review/Benefits_Review_Script.html';
  if (fs.existsSync(SRC) && fs.readFileSync(SRC, 'utf8') !== fs.readFileSync(new URL('../tool/benefits-review.html', import.meta.url), 'utf8')) r.fails.push('tool/benefits-review.html differs from Health ZONE\'s source');
  const bad = r.fails.concat(errs.map(e => 'page error: ' + String(e).slice(0, 160)));
  console.log(bad.length ? `REVIEW FAILED ${bad.length}:\n  ` + bad.join('\n  ') : `REVIEW ok - ${r.n} checks`);
  process.exitCode = bad.length ? 1 : 0;
} catch (e) { console.log('REVIEW FAILED ' + e.message); process.exitCode = 1; }
finally { try { ws && ws.close(); } catch {} chrome.kill(); await sleep(300); fs.rmSync(prof, { recursive: true, force: true }); }
