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

const TEST = `(async function(){ var w=ms=>new Promise(r=>setTimeout(r,ms)); await w(1200); window.confirm=()=>true; var fails=[], ok=function(c,m){ if(!c) fails.push(m); };
 var sm=document.getElementById('setupModal'); if(sm) sm.classList.remove('open');
 S=blankState(); applySuiteClient({first:'Pat',last:'Review',state:'TX',age:'45',dob:'01/01/1981',kids:[],health:{}});
 S.intake.medList=[{name:'Lipitor (Atorvastatin)',disc:12,cur:40,forP:true},{name:'Metformin',disc:9,cur:15,forP:true}];
 S.client.agent='Jesse Stamm'; S.agency='Optimum Health'; S.agentBenefits='optimumprotects.com/manhattanlife';
 ['good','better','best'].forEach(function(t){ S.include[t]=true; }); autoPriceTiers(); compute(); S.chosen={tier:'better'}; S.recommended='best'; compute();
 ok(Array.prototype.map.call(document.querySelectorAll('#stepper button'),function(b){ return b.dataset.step; }).pop()==='review','Benefits Review is step 6');
 ok(!!document.querySelector('#step-enroll .rv-next'),'Enroll links on to the Benefits Review');
 goStep('review'); await w(1800);
 var fr=document.getElementById('rvFrame'), d=fr&&fr.contentDocument; ok(d&&d.body&&d.body.dataset.rvp==='1','the script loads and is paged');
 if(!d||!d.body) return {n:0,fails:fails};
 var set=function(id,v){ var e=document.getElementById(id); e.value=v; e.dispatchEvent(new Event('change')); };
 set('rv_eff','2026-11-01'); set('rv_prem','$412.50'); await w(100);
 var T=reviewTokens('better'); ok(T['policy.draft_date']==='','draft date is never defaulted to the effective date: '+T['policy.draft_date']);
 ok(/Draft date is empty/.test(document.getElementById('rv_warn').textContent),'an empty draft date is flagged');
 set('rv_draft','2026-11-03'); set('rv_pharm','Walgreens'); await w(100); T=reviewTokens('better');
 ok(T['policy.effective_date']==='November 1, 2026'&&T['policy.draft_date']==='November 3, 2026'&&T['policy.premium']==='$412.50','policy figures fill: '+[T['policy.effective_date'],T['policy.draft_date'],T['policy.premium']].join(' / '));
 ok(/Custom draft date/.test(document.getElementById('rv_warn').textContent),'a custom draft date says so');
 ok(T['review.month']==='November','review month defaults to the effective month: '+T['review.month']);
 var saved=JSON.parse(localStorage.getItem('hf_pop_last')||'{}').review||{}; ok(saved.eff==='2026-11-01'&&saved.draft==='2026-11-03'&&saved.prem===412.5,'the panel saves into the client file');
 ok(T['plan.rx_per_day']==='$50'&&T['plan.rx_annual_max']==='$750'&&+T['plan.visits']>0,'plan figures read from the tier: '+[T['plan.rx_per_day'],T['plan.rx_annual_max'],T['plan.visits']].join(' / '));
 ok(T['tier.elected']==='Complete'&&T['tier.recommended']==='Comprehensive','tiers named');
 /* prescriptions: the true sentence only */
 ok(T['client.rx_gain']==='$29.00'&&!T['client.rx_short'],'under the daily benefit: a real gain ($21 of fills vs $50): '+T['client.rx_gain']);
 var keep=S.intake.medList; S.intake.medList=[{name:'Eliquis',disc:48,forP:true},{name:'Metformin',disc:9,forP:true}]; var T2=reviewTokens('better'), X2=reviewRx('better');
 ok(X2.math==='partial'&&!T2['client.rx_gain']&&T2['client.rx_short']==='$7.00','over the daily benefit: never a gain, the shortfall instead');
 S.intake.medList=[{name:'Eliquis',forP:true}]; ok(reviewRx('better').math==='','an unpriced med list serves neither sentence');
 S.intake.medList=[{name:'Eliquis',disc:41,forP:true},{name:'Metformin',disc:9,forP:true}]; ok(reviewRx('better').math==='wash','fills of exactly the daily benefit serve the wash sentence');
 S.intake.medList=keep;
 var pages=reviewPages('better').map(function(p){ return p.t; });
 ok(pages.indexOf('Dental')<0,'no dental screen when no dental was elected'); ok(pages.indexOf('If they elected below')>=0,'tier-below screen when they took less than recommended');
 S.chosen={tier:'best'}; ok(reviewPages('best').map(function(p){ return p.t; }).indexOf('If they elected below')<0,'no tier-below screen when they took the recommendation'); S.chosen={tier:'better'};
 var ag=S.agency; S.agency='HealthFirst'; reviewWire(d,'better'); ok(Array.prototype.every.call(d.querySelectorAll('[data-needs="agent.agency"]'),function(x){ return x.classList.contains('pp-off'); })&&d.querySelectorAll('[data-needs="agent.agency"]').length===2,'no agency: both agency phrases drop out'); S.agency=ag;
 reviewWire(d,'better');
 ok(Array.prototype.every.call(d.querySelectorAll('[data-needs="agent.agency"]'),function(x){ return !x.classList.contains('pp-off'); }),'agency set: its phrases show');
 var vis=function(sel){ var e=d.querySelector(sel); return !!e&&!e.classList.contains('pp-off'); };
 ok(!vis('[data-rx-math="partial"]')&&vis('[data-rx-math="gain"]'),'gain branch shown, partial hidden');
 ok(!vis('[data-rx-math="wash"]'),'wash hidden when it is a gain');
 ok(Array.prototype.every.call(d.querySelectorAll('[data-author="note"]'),function(x){ return x.classList.contains('pp-off'); })&&!vis('p.sub0'),'agent-only notes and the build line are hidden');
 var a=d.querySelectorAll('.btnrow a'); ok(a.length===5&&a[0].href.indexOf('clients.manhattanlife.com')>0&&a[4].href==='https://optimumprotects.com/manhattanlife','buttons are real links; the resource page is the Setup link: '+(a[4]&&a[4].href));
 set('rv_link','client-own.example/page'); await w(50); reviewWire(d,'better'); ok(d.querySelectorAll('.btnrow a')[4].href==='https://client-own.example/page','a client-specific page overrides the Setup link'); set('rv_link','');
 /* the four ticks */
 var pg=pages.indexOf('Portal — do it live'); reviewGo(pg); await w(100); var tk=d.querySelector('.rv-tick[data-tick="portal"]'); ok(tk&&tk.style.display!=='none','the portal tick sits on the portal screen');
 tk.querySelector('input').click(); await w(50); ok(!!(JSON.parse(localStorage.getItem('hf_pop_last')).review.ticks||{}).portal,'a tick is saved with the client');
 ok(/1 of 4/.test(document.getElementById('rvTicks').textContent),'the rail counts it');
 ok(['ecg','upload','cg'].every(function(k){ return !!d.querySelector('.rv-tick[data-tick="'+k+'"]'); }),'all four registration screens carry a tick');
 /* each registration: open / text / copy, and the one the script is on is boxed (Jesse, 16 Oct) */
 S.intake.phone='(555) 010-2030'; reviewRail(); var rows=document.querySelectorAll('#rvTicks .rv-row');
 ok(rows.length===4&&Array.prototype.every.call(rows,function(r){ return r.querySelectorAll('.rv-acts a').length===3&&r.querySelector('a[href^="sms:+15550102030?&body="]')&&r.querySelector('[data-copy]'); }),'every registration has open, text (to +1 number) and copy');
 ok(decodeURIComponent(document.querySelector('#rvTicks [data-row="cg"] a[href^="sms:"]').getAttribute('href')).indexOf('mypoppro.com/tool/careguide.vcf')>0,'CareGuide text carries the contact-card link');
 var cur=function(t){ reviewGo(pages.indexOf(t)); var c=document.querySelector('#rvTicks .rv-row.cur'); return c?c.dataset.row:''; };
 ok(cur('Telehealth — do it live')==='ecg'&&cur('CareGuide')==='cg'&&cur('The money line')==='','the row being talked about is boxed, and only then');
 /* recommended vs elected: locked when they happen (Jesse, 16 Oct) */
 S.rec=null; S.elected=null; S.decl={}; S.chosen={tier:'best'}; presentOpen(); await w(300);
 ok(S.rec&&S.rec.tier==='best'&&S.rec.products.length>2,'Present locks the recommendation with its products');
 S.chosen={tier:'better'}; presentOpen(); await w(200); ok(S.rec.tier==='best','presenting a lower package later does not move the recommendation');
 goStep('enroll'); await w(300); ok(S.elected&&S.elected.tier==='better','Enroll locks what they bought');
 var g=recGap(); ok(g[0]&&g[0].kind==='below'&&g.some(function(x){ return x.kind==='declined'||x.kind==='lowered'; }),'Enroll lists the gap: package and products ('+g.length+')');
 ok(document.querySelectorAll('#enDiff [data-gk]').length===g.length,'one acknowledgment line per gap');
 var cb=document.querySelector('#enDiff [data-gk="tier"]'); cb.click(); ok(!!(JSON.parse(localStorage.getItem('hf_pop_last')).decl.tier||{}).ack,'an acknowledgment is saved with the client');
 S.recommended='better'; ok(reviewBelow('better')===true,'the Benefits Review reads the locked recommendation, not the tool\u2019s REC');
 S.chosen={tier:'best'}; goStep('enroll'); await w(200); ok(recGap().length===0&&/took what you recommended/.test(document.getElementById('enDiff').textContent),'no gap when they take the recommendation');
 S.rec=null; renderRecGap(); ok(/No recommendation on record/.test(document.getElementById('enDiff').textContent),'never presented: says so, offers the tool\u2019s REC');
 S.chosen={tier:'better'}; S.recommended='best';
 /* Direction Rx block inside screen 7: only for a weight-loss GLP-1, with the agent's code */
 S.agentDrxCode='OPT35'; S.agentDrxLink='bit.ly/x'; S.intake.glp1={p:{on:'Yes',for:'Weight loss',drug:'Zepbound'},s:{}}; reviewWire(d,'better');
 var db=d.querySelector('[data-needs="drx.howto"]'); ok(db&&!db.classList.contains('pp-off')&&/OPT35/.test(db.textContent)&&/30%/.test(db.textContent),'Benefits Review: the Direction Rx block shows with the code and 30%');
 S.intake.glp1={}; reviewWire(d,'better'); ok(db&&db.classList.contains('pp-off'),'no weight-loss GLP-1: the block is gone');
 /* setup asks for the benefits page */
 S.agentBenefits=''; ok(agentSetupMissing().indexOf('benefits page')>=0,'Setup counts the benefits page until it is filled');
  /* What they actually have (Jesse, 17 Oct): a copy of their plan, edited off the approval; quote and recommendation untouched */
 S.chosen={tier:'better'}; S.rec=pkSnap('best'); S.rec.by='presented'; S.elected=pkSnap('better'); delete S.actual; renderReview(); await w(1500);
 var host=document.getElementById('rvActual'), col=host&&host.querySelector('.pbcol.actual');
 ok(!!col&&actualOn(),'the What-they-have card is on the review, seeded from their choice');
 ok(Math.abs(tierTotals('actual').mo-tierTotals('better').mo)<0.01,'seeded at the chosen plan price');
 var betterBefore=JSON.stringify(S.packages.better.products), recBefore=JSON.stringify(S.rec), elBefore=JSON.stringify(S.elected);
 var rmAcc=col.querySelector('[data-act="rm"][data-k="acc"]'); ok(!!rmAcc,'the card has the builder controls (✕ on Accident)'); if(rmAcc) rmAcc.click(); await w(300);
 ok(!(S.packages.actual.products||[]).some(function(p){ return p.k==='acc'; }),'✕ removes Accident from what they have');
 ok(JSON.stringify(S.packages.better.products)===betterBefore&&JSON.stringify(S.rec)===recBefore&&JSON.stringify(S.elected)===elBefore,'the quote, the recommendation and the Enroll choice are untouched');
 ok(/Changed since Enroll:.*Accident/.test(host.textContent),'the card lists the difference from what they chose');
 var G=gapOf(S.rec,actualSnap()); ok(G.some(function(g){ return g.key==='p:acc'; }),'the gap against the recommendation names Accident');
 ok(reviewTokens('better')['gap.missing'].indexOf('Accident')>=0,'gap.missing token: '+reviewTokens('better')['gap.missing']);
 S.actual.tier='best'; ok(reviewBelow('best'),'same plan name but a product missing still opens the below-recommendation page');
 S.rec=actualSnap(); S.rec.by='presented'; ok(!reviewBelow('best'),'matching the recommendation skips it');
 set('rv_prem','$1.00'); await w(100); ok(/Confirm the premium/.test(document.getElementById('rv_warn').textContent),'a typed premium that does not match the plan asks to confirm it');
 var saved2=JSON.parse(localStorage.getItem('hf_pop_last')||'{}'); ok(saved2.actual&&saved2.packages&&saved2.packages.actual,'what they have is saved with the client');
  R=reviewState(); R.prem=0; renderReview(); await w(1200); ok(document.getElementById('rv_prem').value===fmtMoney2(reviewPremTool())&&reviewTokens('best')['policy.premium']===fmt2(reviewPremTool()),'a blank premium fills from the plan: '+document.getElementById('rv_prem').value);
 window.scrollTo(0,600); var y0=window.scrollY, rb=document.querySelector('#rvActual [data-act="rm"]'); if(rb) rb.click(); await w(300); ok(Math.abs(window.scrollY-y0)<5,'editing the plan keeps the page where it is ('+y0+' -> '+window.scrollY+')');
 ok(document.getElementById('rv_prem').value===fmtMoney2(reviewPremTool()),'the filled premium follows the plan');
  /* family history: cancer / heart cover or living benefits left out is flagged (Jesse, 17 Oct) */
 S.rec=pkSnap('best'); S.rec.by='presented'; S.intake.famcancer=true; var GH=gapOf(S.rec,actualSnap());
 ok(GH.some(function(g){ return g.key==='p:chas'&&/Family history of cancer/.test(g.hist||''); }),'cancer cover left out with a family history of cancer is flagged');
 ok(GH.filter(function(g){ return g.hist; }).every(function(g){ return /^[pl]:(chas|lbp|lbs)$|^lb$/.test(g.key); }),'only cancer/heart cover and living benefits carry the flag');
 renderActual(); ok(!!document.querySelector('#rvActual tbody.grp.h'),'the review card shows the flag in gold');
 S.intake.famcancer=false; ok(!gapOf(S.rec,actualSnap()).some(function(g){ return g.hist; }),'no family history: no flag');
  /* side by side: recommended vs what they have, products then events (Jesse, 17 Oct) */
 S.rec=pkSnap('best'); S.rec.by='presented'; actualSeed('better'); await benLoadSafe('afc'); var CX=cmpRows();
 ok(CX&&CX.own&&CX.ev.length===6,'the comparison prices the recommendation from its own saved settings, six events');
 var ev=function(id){ return CX.ev.filter(function(e){ return e.id===id; })[0]||{}; };
 ok(ev('hosp').r-ev('hosp').a>=1,'a hospital stay shows the difference: '+ev('hosp').r+' vs '+ev('hosp').a);
 ok(Math.abs(ev('urgent').r-ev('urgent').a)<1,'urgent care is the same on both');
 ok(!S.cfg.__rec&&!S.packages.__rec,'the comparison leaves nothing behind in the client file');
 renderActual(); ok(!!document.querySelector('#rvActual table.rv-cmp'),'the table sits beside the card');
  /* whose living benefits, and the benefits row by row */
 S.client.pname='Pat Review'; ok(prodName({k:'lbp'})==='Living benefits — primary (Pat)'&&/spouse/.test(prodName({k:'lbs'})),'living benefits say whose: '+prodName({k:'lbp'}));
 var hb=cmpBen('his',{his:{ben:5000,outp:500,amb:1}}); ok(hb[0][0]==='Day 1, per stay'&&hb[2][1]==='$150'&&hb[3][1]==='$200'&&hb[0][1]==='$5,000'&&hb[1][1]==='$500','hospital indemnity breaks into rows: '+JSON.stringify(hb));
 var ab=cmpBen('afc',{afc:'Elite'}); ok(ab.length===6&&ab[0][1]==='Elite'&&ab.some(function(x){ return /Doctor/.test(x[0]); }),'Affordable Choice lists its benefits from the brochure ('+ab.length+' rows)');
 renderActual(); var ghs=Array.prototype.map.call(document.querySelectorAll('#rvActual .rv-cmp tr.gh th'),function(x){ return x.textContent; }); ok(ghs.some(function(t){ return /Hospital Indemnity/.test(t); })&&document.querySelectorAll('#rvActual .rv-cmp tr.sub.d').length>0,'the table is grouped by product with changed rows marked');
  ok(cmpDir('$10,000','$5,000','Per hospital stay')==='dn'&&cmpDir('$500','$1,500','Outpatient surgery')==='up'&&cmpDir('Elite Plus','Elite','Plan')==='dn'&&cmpDir('$500','none','x')==='dn'&&cmpDir('Americo','Mutual of Omaha','Carrier')==='','less is red, more is green, a different carrier is neither');
 return {n:73, fails:fails}; })()`;
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
