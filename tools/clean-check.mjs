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
 S=blankState(); S.client.pname='Pat Test'; S.client.agent='Agent Test'; S.client.state='TX'; S.client.page='45'; S.intake.famcancer=true; fill(); recommendBundles(); autoPriceTiers(); chooseTier('best'); await w(100);
 document.querySelectorAll('.modal.open').forEach(function(m){ m.classList.remove('open'); });
 var vis=function(doc){ return [].slice.call(doc.querySelectorAll('.flag,[data-author="note"]')).filter(function(e){ var x=e; while(x&&x.nodeType===1){ if(doc.defaultView.getComputedStyle(x).display==='none') return false; x=x.parentElement; } return true; }); };
 presentOpen(); for(var k=0;k<40;k++){ await w(150); var f=document.getElementById('prFrame'); if(f&&f.contentDocument&&f.contentDocument.querySelector('[data-screen]')) break; }
 await w(500); var seen=0, total=document.getElementById('prFrame').contentDocument.querySelectorAll('.flag,[data-author="note"]').length, pages=presentNav();
 for(var p=0;p<pages.length;p++){ presentGo(pages[p]); await w(120); seen+=vis(document.getElementById('prFrame').contentDocument).length; }
 ok(total>0,'control: the presentation script contains '+total+' flags/notes'); ok(seen===0,'Present, every page: '+seen+' visible across '+pages.length+' pages');
 goStep('review'); for(var k=0;k<40;k++){ await w(150); var r=document.getElementById('rvFrame'); if(r&&r.contentDocument&&r.contentDocument.body&&r.contentDocument.body.dataset.rvp) break; }
 await w(400); var rseen=0, rp=reviewPages(chosenTier()).length; for(var q=0;q<rp;q++){ reviewGo(q,true); await w(120); rseen+=vis(document.getElementById('rvFrame').contentDocument).length; }
 ok(rseen===0,'Benefits Review, every page: '+rseen+' visible across '+rp+' pages');
 return {n:3, fails:fails}; })()`;
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
  console.log(bad.length ? `CLEAN FAILED ${bad.length}:\n  ` + bad.join('\n  ') : `CLEAN ok - ${r.n} checks`);
  process.exitCode = bad.length ? 1 : 0;
} catch (e) { console.log('CLEAN FAILED ' + e.message); process.exitCode = 1; }
finally { try { ws && ws.close(); } catch {} chrome.kill(); await sleep(300); fs.rmSync(prof, { recursive: true, force: true }); }
