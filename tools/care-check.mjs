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
/* Care card ↔ MyPopPro (Jesse, 23 Oct): what the agent types on the Benefits Review rides in the card link and the
   recap email; a link copied off the card page comes back in; the real card page opens with those boxes filled. */
const CARD = process.argv[3] || '/Users/jessestamm/Documents/Claude/Projects/Optimum Rebrand/OptimumSite/card/index.html';
const TEST = `(async function(){ var w=ms=>new Promise(r=>setTimeout(r,ms)); await w(1200); window.confirm=()=>true; var fails=[], n=0, ok=function(c,m){ n++; if(!c) fails.push(m); };
 var sm=document.getElementById('setupModal'); if(sm) sm.classList.remove('open');
 S=blankState(); applySuiteClient({first:'Pat',last:'Care',state:'TX',age:'45',dob:'01/01/1981',kids:[],health:{}});
 S.intake.email='pat@example.com'; S.client.agent='Sam Agent'; S.agency='Optimum Health'; S.agentPhone='555-201-3344'; S.agentBenefits='optimumprotects.com/manhattanlife';
 ['good','better','best'].forEach(function(t){ S.include[t]=true; }); autoPriceTiers(); compute(); S.chosen={tier:'better'}; compute();
 Object.assign(S.intake,{docs1:'Dr. Patel',docs1who:'me',docs1net:true,docs2:'Dr. Lee',docs2who:'me',docs2net:'no',docs3:'Kids Clinic',docs3who:'',docs3net:true});
 goStep('review'); await w(1800);
 ok((document.querySelector('[data-care="me_doc"]')||{}).value==='Dr. Patel','an in-network Intake doctor with an owner comes over');
 var left=(document.querySelector('.rv-cleft')||{}).textContent||''; ok(/Dr\. Lee — not in network/.test(left)&&/Kids Clinic — no “whose” picked/.test(left),'Intake doctors left out are named with the reason: '+left);
 var box=document.querySelector('.rv-care'); ok(!!box,'care card box on the Benefits Review');
 ok(!document.querySelector('[data-care="sp_doc"]'),'no spouse box for a single client');
 var put=function(k,v){ var e=document.querySelector('[data-care="'+k+'"]'); e.value=v; e.dispatchEvent(new Event('input')); };
 put('me_doc','Dr. Rivera'); put('me_doc_ph','5125550101'); put('urgent','CareNow Main St'); await w(50);
 var J=JSON.parse(decodeURIComponent(escape(atob(careCardLink().split('#c=')[1].replace(/-/g,'+').replace(/_/g,'/')))));
 ok(J.f&&J.f.me_doc==='Dr. Rivera'&&J.f.urgent==='CareNow Main St'&&J.f.me_doc_ph==='5125550101','link carries the boxes: '+JSON.stringify(J.f));
 ok(J.t>0&&J.i&&J.i===S.review.cardId,'link carries the card id and the edit time');
 ok(J.f.agent==='Sam Agent'&&J.f.agent_ph==='5552013344','link carries the agent');
 var ta=document.getElementById('rvEmailTxt'), v=ta.value;
 ok(v.indexOf(careCardLink())>=0,'email has the up-to-date card link');
 ok(/My doctor: Dr\\. Rivera · 512-555-0101/.test(v)&&/Urgent care: CareNow Main St/.test(v),'email lists what was filled');
 ok(v.indexOf('Hospital / ER')<0,'email has no line for an empty box');
 ok(v.indexOf('https://optimumprotects.com/manhattanlife')>=0,'email has the page to bookmark');
 ok(/STILL TO DO[^]*easyupload/.test(v),'unticked set-ups go under Still to do');
 reviewTick('upload',true); await w(50); v=ta.value;
 ok(/SET UP ON OUR CALL[^]*easyupload/.test(v)&&!/STILL TO DO[^]*easyupload/.test(v),'ticking moves it to Set up on our call');
 ok(v.indexOf('myrxvalet')<0&&v.indexOf('Jesse')<0,'no direct Rx Valet link, no author name');
 /* a link from the card page, with the client's additions */
 var back={i:S.review.cardId,f:{me_doc:'Dr. Rivera',hosp:'St. David’s',hosp_ph:'5125550199',pharm:'HEB Pharmacy'},t:Date.now()};
 var url='https://optimumprotects.com/card/#c='+btoa(unescape(encodeURIComponent(JSON.stringify(back)))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
 document.getElementById('rvCarePaste').value=url; document.getElementById('rvCareImport').click(); await w(300);
 ok(/Brought in 3 box/.test(document.getElementById('rvCareMsg').textContent)||(document.querySelector('[data-care="hosp"]')||{}).value==='St. David’s','paste-back reports what came in');
 ok((document.querySelector('[data-care="hosp"]')||{}).value==='St. David’s'&&S.review.pharmacy==='HEB Pharmacy','pasted boxes land in the form and the pharmacy');
 ok(/Hospital \\/ ER: St\\. David’s/.test(document.getElementById('rvEmailTxt').value),'email picks up the pasted hospital');
 ok(careImport('https://example.com/nothing')===0,'a non-card link is refused');
 ta=document.getElementById('rvEmailTxt'); ta.value+='\\nP.S. hand edit'; ta.dispatchEvent(new Event('input')); reviewTick('cg',true); await w(50);
 ok(/hand edit/.test(ta.value),'a hand-edited email is not overwritten');
 return {n:n,fails:fails,link:careCardLink()}; })()`;
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
  /* the real card page, opened from that link */
  const hash = r.link.split('#')[1];
  await send('Page.navigate', { url: 'file://' + encodeURI(CARD) + '#' + hash }); await sleep(1500);
  const got = await ev(`({me:document.getElementById('me_doc').value, ph:document.getElementById('me_doc_ph').value, hosp:document.getElementById('hosp').value, ag:document.getElementById('agent').value, card:document.getElementById('preview').textContent})`);
  r.n += 3;
  if (got.me !== 'Dr. Rivera' || got.hosp !== 'St. David’s') r.fails.push('card page did not open with the boxes: ' + JSON.stringify(got).slice(0, 200));
  if (got.ag !== 'Sam Agent') r.fails.push('card page has no agent: ' + got.ag);
  if (!/Dr\. Rivera/.test(got.card)) r.fails.push('the printed card does not show the doctor');
  const bad = r.fails.concat(errs.map(e => 'page error: ' + String(e).slice(0, 160)));
  console.log(bad.length ? `CARE FAILED ${bad.length}:\n  ` + bad.join('\n  ') : `CARE ok - ${r.n} checks`);
  process.exitCode = bad.length ? 1 : 0;
} catch (e) { console.log('CARE FAILED ' + e.message); process.exitCode = 1; }
finally { try { ws && ws.close(); } catch {} chrome.kill(); await sleep(300); fs.rmSync(prof, { recursive: true, force: true }); }
