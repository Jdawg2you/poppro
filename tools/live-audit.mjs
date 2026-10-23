// Ship audit (Jesse, 23 Oct): does the LIVE site have every feature we built? Runs against a base URL in a clean
// headless Chrome (fresh profile - nobody's saved clients). Modes:
//   node tools/live-audit.mjs files [base]      - every shipped file byte-identical to this checkout
//   node tools/live-audit.mjs features [base]   - each feature from the 23 Oct ship behaves on that site
// base defaults to https://mypoppro.com ; pass http://127.0.0.1:PORT to audit a local build (negative control).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const MODE = process.argv[2] || 'features';
const BASE = (process.argv[3] || 'https://mypoppro.com').replace(/\/$/, '');
const ROOT = new URL('..', import.meta.url).pathname;
const FILES = ['tool/index.html', 'tool/discovery.html', 'tool/presentation.html', 'tool/benefits-review.html', 'tool/afc-rules.js', 'tool/meds/fda-meds.json'];
const sha = b => crypto.createHash('sha1').update(b).digest('hex');

if (MODE === 'files') {
  let ok = 0; const bad = [];
  for (const f of FILES) {
    const r = await fetch(`${BASE}/${f}?cb=${Date.now()}`); const live = Buffer.from(await r.arrayBuffer());
    const local = fs.readFileSync(path.join(ROOT, f));
    if (r.ok && sha(live) === sha(local)) ok++; else bad.push(`${f} (${r.status}, ${live.length} vs ${local.length} bytes)`);
  }
  console.log(bad.length ? `FILES FAILED ${ok}/${FILES.length}:\n  ` + bad.join('\n  ') : `FILES ok ${ok}/${FILES.length}`);
  process.exit(bad.length ? 1 : 0);
}

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DBG = 9300 + Math.floor(Math.random() * 500);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'liveaudit-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + DBG, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(), errs = [];
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };

const LIVE = /^https:/.test(BASE);
const TEST = `(async function(){ var w=ms=>new Promise(r=>setTimeout(r,ms)); await w(1500); window.confirm=()=>true; var fails=[], n=0, ok=function(c,m){ n++; if(!c) fails.push(m); };
 var has=function(name){ return typeof window[name]==='function'; };
 var sm=document.getElementById('setupModal'); if(sm) sm.classList.remove('open');
 ${LIVE ? `ok(!RIGHT_FIT_ON&&!TRIAD_FLOW_ON,'live: decision tree and Triad flow are off');
 ok(getComputedStyle(document.getElementById('verBanner')).display==='none','live: no sandbox banner');` : ''}
 ok(NEWS[0].d==='2026-10-23','What’s new has the 23 Oct release (top: '+NEWS[0].d+')');
 var src=document.documentElement.outerHTML;
 ok(/hasn’t raised the rate on it since 2023/.test(src)&&src.indexOf('This renews at the same price')<0,'pricing: no “same price”, the 2023 line is in');
 S=blankState(); applySuiteClient({first:'Audit',last:'Client',state:'TX',age:'45',dob:'01/01/1981',kids:[],health:{}});
 S.client.agent='Sam Agent'; S.agency='Optimum Health'; S.agentPhone='555-201-3344'; S.agentBenefits='optimumprotects.com/manhattanlife'; S.agentBooking='calendly.com/sam/review';
 Object.assign(S.intake,{email:'a@example.com',phone:'5125550100',whyMatters:'need to find more affordable coverage',whyTags:['Too expensive','Deductible too high'],whyShop:'Premium jumped in January',docs1:'Dr. Patel',docs1who:'me',docs1net:true});
 var C=curIn(); C.prem=900; C.ded=0; C.dedSet=true; C.paying=true;
 ['good','better','best'].forEach(function(t){ S.include[t]=true; }); autoPriceTiers(); compute(); S.chosen={tier:'better'}; compute();
 ok(/up to 14 days/.test(enrollTextPlain('better')),'approval timing: “up to 14 days” in the enrollment text');
 ok(/myeasycare2go/.test(RXVALET_URL)&&!/myrxvalet/i.test(enrollEmail().body+enrollTextPlain('better')+textFromHTML(postTextHTML('better'))+afcPartnerLines())&&![].some.call(document.querySelectorAll('a'),function(x){ return /myrxvalet/.test(x.href); }),'Rx Valet through EasyCare2go: no myrxvalet in any link, email or text a client gets');
 /* Discovery is MyPopPro's own page */
 goStep('call'); await w(4500); var cf=document.getElementById('callFrame');
 ok(cf&&/\\/tool\\/discovery\\.html$/.test(cf.src.split('?')[0])&&new URL(cf.src).origin===location.origin,'Discovery frame is this site’s own tool/discovery.html ('+(cf&&cf.src.split('?')[0])+')');
 var fw=cf&&cf.contentWindow; ok(fw&&typeof fw.pStore==='function'&&/Discovery Call/.test(fw.document.body.innerText),'the Discovery call runs inside it');
 for(var i=0;i<20&&!(fw&&fw.AFC_MEDS);i++) await w(250); ok(fw&&fw.AFC_MEDS&&fw.AFC_MEDS.length>0,'AFC medication rules load inside Discovery');
 /* Intake: doctor toggle */
 goStep('intake'); await w(600); var seg=document.getElementById('in_docs1_net');
 ok(seg&&seg.classList.contains('netseg')&&seg.querySelectorAll('[data-net]').length===3&&seg.dataset.v==='in','doctor network is a three-way toggle (in / ? / out), and an in-network doctor reads ✓');
 ok(/Present will say|What you’ll say back/.test(document.getElementById('whySay').textContent)||/need to find more affordable coverage/.test(document.getElementById('whySay').textContent),'Intake why preview quotes a bare “need to…”');
 /* Present */
 goStep('present'); await w(2500); var pd=document.getElementById('prFrame').contentDocument;
 var wq=pd.querySelector('var[data-k="client.why_quote"]'); ok(wq&&wq.textContent==='need to find more affordable coverage'&&wq.classList.contains('pp-ok'),'Present quotes the why');
 var sh=pd.querySelector('.pp-shared'); ok(sh&&/Too expensive · Deductible too high/.test(sh.textContent)&&/Premium jumped/.test(sh.textContent),'screen 3: “What they shared on the discovery call”');
 ok(/Premium jumped/.test(document.getElementById('prWhy').textContent),'their story in the About their why box');
 var cd=pd.querySelector('var[data-k="cur.deductible"]'); ok(!cd||cd.textContent==='$0','a typed 0 deductible reads $0');
 var cl=pd.getElementById('ppClean'); ok(cl&&/TOP TIP/.test(cl.textContent)&&/display:none/.test(cl.textContent),'Top tips restyled; notes and flags hidden');
 ok(has('presentLbCue')&&has('peCue')&&has('presentShared'),'living-benefits prompts, plan-edits scroll cue present');
 /* Benefits Review */
 S.review={ticks:{},eff:'2026-11-01',draft:'',care:{}}; goStep('review'); await w(2500);
 var ap=document.getElementById('rvApproved'); ok(ap&&ap.style.display==='none','approval box waits for Approved = Yes');
 var sel=document.getElementById('rv_appr'); ok(sel&&[].map.call(sel.options,function(o){ return o.textContent; }).join('|')==='—|Yes|Yes — with a change|Not yet','Approved: Yes / Yes — with a change / Not yet');
 sel.value='no'; sel.dispatchEvent(new Event('change')); await w(200); ok(/You selected Not yet/.test(document.getElementById('rv_warn').textContent),'Not yet warns about promising coverage');
 sel.value='as'; sel.dispatchEvent(new Event('change')); await w(300); ap=document.getElementById('rvApproved');
 ok(ap.style.display!=='none'&&/1 · Text/.test(ap.textContent)&&/2 · Email/.test(ap.textContent)&&ap.querySelector('a[href^="https://mail.google.com"]')&&ap.querySelector('a[href^="https://outlook.office.com"]')&&/calendly\\.com\\/sam\\/review/.test(ap.textContent),'Approved = Yes shows the approval text + email with Gmail and Outlook, and the booking link');
 ok(document.querySelector('#rv_draft').closest('.fld').classList.contains('needfill'),'empty confirmation boxes glow green');
 reviewGo(1); await w(300); var apf=document.getElementById('rvApproved'); ok(apf.classList.contains('min')&&getComputedStyle(apf.querySelector('.rv-apall')).display==='none'&&/They’re approved/.test(document.getElementById('rvApBar').textContent),'past page 1 the approval box folds to one line, like Setup'); reviewGo(0); await w(200);
 ok(/Your client’s resource page/.test(document.querySelector('.rv-conf').textContent),'resource page label');
 var care=document.querySelector('.rv-care'); ok(care&&/Client care card/.test(care.textContent)&&(care.querySelector('[data-care="me_doc"]')||{}).value==='Dr. Patel','Client care card, with the in-network Intake doctor filled');
 var em=document.getElementById('rvEmailTxt').value; ok(/GOOD TO KNOW/.test(em)&&/about 10 days/.test(em)&&/Direction Rx member pricing/.test(em)&&em.indexOf(careCardLink())>=0,'recap email: card link, Good to know, Direction Rx');
 ok(reviewTicks().some(function(x){ return x.k==='drx'&&/hormone/.test(x.t); })&&reviewTicks().some(function(x){ return x.k==='rxv'; }),'checklist: Rx Valet and Direction Rx for every member');
 var rd=document.getElementById('rvFrame').contentDocument;
 ok(rd.querySelectorAll('[data-product]').length>=10&&rd.querySelector('[data-screen="labs"]')&&/getting used to/.test(rd.body.textContent)&&rd.body.textContent.indexOf('is a claim, not a greeting')<0,'Benefits Review script: product tags, labs screen, Dawn’s additions, old note gone');
 ok(/How to use your new health plan: https:\/\/optimumprotects\.com\/manhattanlife/.test(approvedMsgs().body),'approval email links “How to use your new health plan” to their resource page');
 reviewGo(3); await w(300); var cb=[].map.call(document.querySelectorAll('#rvChips button'),function(b){ return b.textContent.trim(); }); var p3=reviewPages(reviewT())[3];
 ok(cb[0]==='Before you dial'&&/^3\./.test(cb[3])&&(rd.querySelector('h2[data-screen="'+p3.sc+'"] .n')||{}).textContent==='3','step buttons and script headings agree: Before you dial unnumbered, Open is 1');
 var pl=reviewPages(reviewT()); ok(pl[pl.length-1].sc==='recap'&&!pl.some(function(p){ return p.sc==='notes'; }),'last review step is the recap email; coaching notes are no longer a step');
 reviewGo(0); await w(400); var nh=rd.querySelector('h2[data-screen="notes"]'); ok(nh&&nh.style.display!=='none'&&+nh.dataset.rv===0,'coaching notes show on page 1, under Before you dial');
 reviewGo(pl.length-1); await w(400); var mw=document.querySelector('#reviewHost .rv-mail'); ok(document.getElementById('rvFrame').style.display==='none'&&mw&&mw.style.display!=='none'&&document.getElementById('rvMailSms'),'the recap step shows the email and the recap text in place of the script'); reviewGo(0); await w(200);
 var tt=reviewT(), pk=S.packages[tt], orig=JSON.parse(JSON.stringify(pk.products));
 pk.products=orig.map(function(p){ return Object.assign({},p,{monthly:p.k==='his'?(+p.monthly||10):0}); });
 var pg=reviewPages(tt).map(function(p){ return p.sc||''; }); ok(pg.indexOf('careguide')<0&&pg.indexOf('telehealth')>=0,'reviews only what they bought: Hospital Indemnity only skips CareGuide ('+pg.join(',')+')');
 pk.products=orig;
 return {n:n,fails:fails}; })()`;

try {
  let l; for (let i = 0; i < 60 && !l; i++) { await sleep(150); l = await fetch(`http://127.0.0.1:${DBG}/json/list`).then(r => r.json()).catch(() => null); }
  ws = new WebSocket(l.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', m => { const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    if (d.method === 'Runtime.exceptionThrown') errs.push((d.params.exceptionDetails.exception || {}).description || d.params.exceptionDetails.text); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: `${BASE}/tool/?cb=${Date.now()}` }); await sleep(5000);
  const r = await ev(TEST);
  const bad = r.fails.concat(errs.map(e => 'page error: ' + String(e).slice(0, 160)));
  console.log(bad.length ? `FEATURES FAILED ${bad.length} of ${r.n} on ${BASE}:\n  ` + bad.join('\n  ') : `FEATURES ok - ${r.n} checks on ${BASE}`);
  process.exitCode = bad.length ? 1 : 0;
} catch (e) { console.log('FEATURES FAILED ' + e.message); process.exitCode = 1; }
finally { try { ws && ws.close(); } catch {} chrome.kill(); await sleep(300); fs.rmSync(prof, { recursive: true, force: true }); }
