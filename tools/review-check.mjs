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
 ok(/1 of 5/.test(document.getElementById('rvTicks').textContent),'the rail counts it');
 ok(['ecg','upload','cg'].every(function(k){ return !!d.querySelector('.rv-tick[data-tick="'+k+'"]'); }),'all four registration screens carry a tick');
 /* each registration: open / text / copy, and the one the script is on is boxed (Jesse, 16 Oct) */
 S.intake.phone='(555) 010-2030'; reviewRail(); var rows=document.querySelectorAll('#rvTicks .rv-row');
 ok(rows.length===5&&Array.prototype.every.call(rows,function(r){ return r.querySelectorAll('.rv-acts a').length===3&&r.querySelector('a[href^="sms:+15550102030?&body="]')&&r.querySelector('[data-copy]'); }),'every registration has open, text (to +1 number) and copy');
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
 S.chosen={tier:'better'}; S.rec=pkSnap('best'); S.rec.by='presented'; S.elected=pkSnap('better'); delete S.actual; reviewState().appr='chg'; renderReview(); await w(1500);
 var host=document.getElementById('rvActual'), col=host&&host.querySelector('.pbcol.actual');
 ok(!!col&&actualOn(),'the What-they-have card is on the review, seeded from their choice');
 ok(Math.abs(tierTotals('actual').mo-tierTotals('better').mo)<0.01,'seeded at the chosen plan price');
 var betterBefore=JSON.stringify(S.packages.better.products), recBefore=JSON.stringify(S.rec), elBefore=JSON.stringify(S.elected);
 var rmAcc=col.querySelector('[data-act="rm"][data-k="acc"]'); ok(!!rmAcc,'the card has the builder controls (✕ on Accident)'); if(rmAcc) rmAcc.click(); await w(300);
 ok(!(S.packages.actual.products||[]).some(function(p){ return p.k==='acc'; }),'✕ removes Accident from what they have');
 ok(JSON.stringify(S.packages.better.products)===betterBefore&&JSON.stringify(S.rec)===recBefore&&JSON.stringify(S.elected)===elBefore,'the quote, the recommendation and the Enroll choice are untouched');
 ok(/Changed since Enroll:.*Accident/.test(host.textContent),'the card lists the difference from what they chose');
 var G=gapOf(S.rec,actualSnap()); ok(G.some(function(g){ return g.key==='p:acc'; }),'the gap against the recommendation names Accident');
 ok(/accident/i.test(reviewTokens('better')['gap.missing']),'gap.missing token: '+reviewTokens('better')['gap.missing']);
 S.actual.tier='best'; ok(reviewBelow('best'),'same plan name but a product missing still opens the below-recommendation page');
 S.rec=actualSnap(); S.rec.by='presented'; ok(!reviewBelow('best'),'matching the recommendation skips it');
 set('rv_prem','$1.00'); await w(100); ok(/Confirm the premium/.test(document.getElementById('rv_warn').textContent),'a typed premium that does not match the plan asks to confirm it');
 var saved2=JSON.parse(localStorage.getItem('hf_pop_last')||'{}'); ok(saved2.actual&&saved2.packages&&saved2.packages.actual,'what they have is saved with the client');
  R=reviewState(); R.prem=0; renderReview(); await w(1200); ok(document.getElementById('rv_prem').value===fmtMoney2(reviewPremTool())&&reviewTokens('best')['policy.premium']===fmt2(reviewPremTool()),'a blank premium fills from the plan: '+document.getElementById('rv_prem').value);
 window.scrollTo(0,600); var y0=window.scrollY, rb=document.querySelector('#rvActual [data-act="rm"]'); if(rb) rb.click(); await w(300); ok(Math.abs(window.scrollY-y0)<5,'editing the plan keeps the page where it is ('+y0+' -> '+window.scrollY+')');
 ok(document.getElementById('rv_prem').value===fmtMoney2(reviewPremTool()),'the filled premium follows the plan: '+document.getElementById('rv_prem').value+' vs '+fmtMoney2(reviewPremTool())+' appr='+reviewState().appr+' prem='+reviewState().prem);
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
  S.rec=null; renderActual(); ok(!!document.getElementById('rvRecSet')&&/What they chose/.test((document.querySelector('#rvActual table.rv-cmp')||{}).textContent||''),'no recommendation on record: compares with what they chose and offers to record one');
 document.getElementById('rvRecPick').value='best'; document.getElementById('rvRecSet').click(); await w(300); ok(S.rec&&S.rec.tier==='best'&&/Benefits Review/.test(S.rec.by)&&!!document.querySelector('#rvActual table.rv-cmp'),'recording it brings up the side-by-side');
  /* setup folds away after page 1 (Jesse, 17 Oct) */
 reviewGo(0); var cf=document.querySelector('#reviewHost .rv-conf'); ok(cf&&!cf.classList.contains('min'),'page 1: the setup is open');
 reviewGo(1); ok(cf.classList.contains('min')&&/Setup/.test(document.getElementById('rvConfBar').textContent),'page 2: the setup folds to one line');
 document.getElementById('rvConfBar').click(); ok(!cf.classList.contains('min'),'the caret opens it again'); reviewGo(2); ok(cf.classList.contains('min'),'moving on folds it again'); reviewGo(0);
  /* the review: the plan opens only when approved with a change */
 reviewState().appr='as'; RV_ACT_OPEN=false; renderActual(); ok(!!document.querySelector('#rvActual .rv-actmin')&&!document.querySelector('#rvActual .pbcol.actual'),'approved as applied: the plan is one line, not the card');
 reviewState().appr='chg'; renderActual(); ok(!!document.querySelector('#rvActual .pbcol.actual'),'approved with a change: the card opens');
 /* the end of Present: as presented, or with plan edits (Jesse, 17 Oct) */
 S.chosen={tier:'better'}; S.rec=pkSnap('best'); S.rec.by='presented'; delete S.actual; goStep('present'); await w(2500);
 var nav=presentNav(); presentGo(nav[nav.length-1]); await w(300);
 var eb=document.querySelector('#prNav [data-go="edits"]'), ab=document.querySelector('#prNav [data-go="enroll"]'); ok(!!eb&&!!ab&&/as presented/.test(ab.textContent),'the last screen offers as presented and with plan edits');
 eb.click(); await w(400); var pc=document.querySelector('#prEditBody .pbcol.actual'); ok(!!pc&&/enrolling in/i.test(pc.textContent)&&!!document.querySelector('#prEditBody table.rv-cmp'),'with plan edits: the card and the side-by-side open under the script');
 var betterQ=JSON.stringify(S.packages.better.products); var rx=pc.querySelector('[data-act="rm"][data-k="acc"]'); if(rx) rx.click(); await w(300);
 ok(JSON.stringify(S.packages.better.products)===betterQ,'editing never touches the quote');
 document.querySelector('[data-pe="go"]').click(); await w(500);
 ok(S.step==='enroll'&&S.actual.how==='edited'&&!S.elected.products.some(function(p){ return p.k==='acc'; }),'enroll with adjustments: Enroll records the edited plan');
 var es=document.getElementById('enrollSummary').textContent; ok(!/24-Hour Accident/.test(es)&&/with plan edits/.test(es)&&es.indexOf(fmt2(reviewPremTool()))>=0,'the Enroll summary is the plan they are actually enrolling in (premium '+fmt2(reviewPremTool())+')');
 ok(enrolledTier()==='actual'&&TIER_NAME.actual==='Complete'&&!lbSummary().some(function(x){ return false; }),'the email, follow-ups and wrap-up read the enrolled plan');
 goStep('present'); await w(2500); nav=presentNav(); presentGo(nav[nav.length-1]); await w(300); document.querySelector('#prNav [data-go="enroll"]').click(); await w(500);
 ok(S.step==='enroll'&&S.actual.how==='presented'&&S.elected.products.some(function(p){ return p.k==='acc'; }),'enroll as presented: the plan as presented, edits gone');
  goStep('present'); await w(2500); nav=presentNav(); presentGo(nav[nav.length-1]); await w(300); document.querySelector('#prNav [data-go="edits"]').click(); await w(400);
 var px=document.querySelector('#prEditBody [data-act="rm"][data-k="acc"]'); if(px) px.click(); await w(300); var cb2=document.querySelector('[data-pe="cancel"]');
 ok(/Cancel edits/.test(cb2.textContent)&&document.querySelectorAll('#prEdit [data-pe="go"]').length===2&&document.querySelectorAll('#prEdit [data-pe="cancel"]').length===2,'both buttons sit above and below the edit section'); cb2.click(); await w(500);
 ok(S.step==='enroll'&&S.actual.how==='presented'&&S.elected.products.some(function(p){ return p.k==='acc'; }),'cancel edits enrolls the plan as presented');
  /* section 11 says what they did (Jesse, 17 Oct) */
 S.chosen={tier:'better'}; S.client.sname='Kristal Stamm'; S.rec=pkSnap('best'); S.rec.by='presented'; actualSeed('best'); S.cfg.actual.afc='Elite'; priceTier('actual');
 var g1=gapSpoken(S.rec,actualSnap()); ok(g1.kind==='same'&&/Affordable Choice level/.test(g1.lowered),'same plan, a level lowered: '+JSON.stringify(g1));
 actualSeed('good'); var g2=gapSpoken(S.rec,actualSnap()); ok(g2.kind==='lower'&&!g2.added,'a lower plan as quoted: '+g2.kind);
 S.cfg.actual.his.ben=10000; S.cfg.actual.his.outp=1500; priceTier('actual'); var g3=gapSpoken(S.rec,actualSnap()); ok(g3.kind==='lowerplus'&&/hospital indemnity/.test(g3.added),'a lower plan with coverage added on top: '+JSON.stringify(g3));
 actualSeed('best'); (S.packages.actual.dropped=S.packages.actual.dropped||[]).push('lbs','lbp'); priceTier('actual'); ok(/living benefits/.test(gapSpoken(S.rec,actualSnap()).missing)&&gapSpokenName('lbp',['lbp','lbs'])==='living benefits for both of you'&&gapSpokenName('lbs',['lbp','lbs'])===''&&gapSpokenName('lbs',['lbs'])==='Kristal’s living benefits','living benefits say whose ("for both of you", "Kristal’s")');
 S.chosen={tier:'better'}; actualSeed('better'); goStep('review'); await w(1800); var rv=document.getElementById('rvFrame').contentDocument; reviewWire(rv,'better');
 var s11=Array.prototype.filter.call(rv.querySelectorAll('[data-tier="below"]'),function(x){ return x.dataset.ppEd; }); ok(s11.length===3&&/speed dial/.test(s11[2].textContent)&&!/own family/.test(rv.body.textContent)&&/When we first spoke/.test(s11[0].textContent),'section 11 is the softer version on screen');
 ok(s11.every(function(x){ return x.dataset.rv!=null; }),'the new lines stay on their own page');
  /* Present: switching the plan loads that package as built on the Quote (Jesse, 17 Oct) */
 S.chosen={tier:'better'}; delete S.actual; goStep('present'); await w(2500); var nv=presentNav(); presentGo(nv[nv.length-1]); await w(300); document.querySelector('#prNav [data-go="edits"]').click(); await w(400);
 var sel=document.querySelector('#prEditBody [data-act="actname"]'); sel.value='good'; sel.dispatchEvent(new Event('change')); await w(300);
 ok(S.actual.from==='good'&&Math.abs(tierTotals('actual').mo-tierTotals('good').mo)<0.01&&/Essential/.test(document.querySelector('#prEditBody .pbcol.actual').textContent),'picking Essential loads the Essential package from the Quote');
 document.querySelector('[data-pe="go"]').click(); await w(500); ok(S.step==='enroll'&&chosenTier()==='good'&&enrolledTier()==='actual','enrolling from it makes Essential their plan');
  /* Close: re-send the digital business card (Jesse, 17 Oct) */
 var rvd=document.getElementById('rvFrame').contentDocument; S.agentCard='mycard.example/jesse'; reviewWire(rvd,'better');
 var cbx=rvd.querySelector('.pp-cardbox'); ok(!!rvd.querySelector('.pp-cardsay')&&cbx&&cbx.textContent.indexOf('https:'+'//mycard.example/jesse')>=0&&!!cbx.querySelector('.pp-copy')&&!!cbx.querySelector('.pp-sms'),'the Close re-sends the business card: line, link, Copy and Text them');
 S.agentCard=''; reviewWire(rvd,'better'); ok(!!rvd.querySelector('.pp-cardbox .pp-setup')&&rvd.querySelectorAll('.pp-cardbox').length===1,'no card in Setup: a (set up) link instead, and the box is not duplicated');
  /* care card link (Jesse, 18 Oct): agent from Setup, people, dental, and only doctors ticked in network, in their slots */
 S.client.agent='Jesse Stamm'; S.agentPhone='(443) 895-1832'; S.intake.docs1='Dr. Lopez'; S.intake.docs1who='me'; S.intake.docs1net=true;
 S.intake.docs2='Dr. Kim'; S.intake.docs2who='sp'; S.intake.docs2net=false; S.intake.docs3='Lake Nona Pediatrics'; S.intake.docs3who='kid'; S.intake.docs3net=true;
 var cd=careCardData(); ok(/^[a-z0-9]{6,}$/.test(cd.i)&&careCardData().i===cd.i&&cd.a==='Jesse Stamm'&&cd.p==='4438951832'&&cd.md==='Dr. Lopez'&&cd.kd==='Lake Nona Pediatrics'&&!cd.sd&&cd.n>=1,'the care card carries the agent, people and only in-network doctors: '+JSON.stringify(cd));
 var lk=careCardLink(); ok((lk.indexOf('https:'+'//optimumprotects.com/card/#c=')===0||lk.indexOf('http:'+'//localhost:8790/card/#c=')===0)&&lk.indexOf('Lopez')<0,'the details ride after the # (encoded), not in the address the server sees');
 renderReview(); await w(800); ok(/Care card sent/.test(document.getElementById('rvTicks').textContent),'the rail offers the care card (open, text, copy)');
  /* screen 9 talks about the care card (Jesse, 18 Oct) */
 var rv9=document.getElementById('rvFrame').contentDocument; reviewWire(rv9,'better'); var cc=rv9.querySelectorAll('.pp-carecard');
 ok(cc.length===2&&/care card/.test(cc[0].textContent)&&/Care card sent/.test(cc[1].textContent)&&cc[0].dataset.rv!=null,'screen 9 has the care card line and the agent cue, on its own page');
 ok(reviewTokens('better')['card.doctor']==='Dr. Lopez and Lake Nona Pediatrics','the line names only the in-network doctors: '+reviewTokens('better')['card.doctor']);
  S.intake.who={app:true,spouse:true,kids:true}; S.client.sage='45'; S.intake.kids=[{n:'A',age:'19'},{n:'B',age:'12'}]; ok(careCardData().n===3,'cards count adults: primary + spouse + the 19-year-old, not the 12-year-old ('+careCardData().n+')');
  /* "lowered" is only said when a level was lowered (gut check, 18 Oct) */
 S.rec=pkSnap('best'); S.rec.by='presented'; actualSeed('best'); (S.packages.actual.dropped=S.packages.actual.dropped||[]).push('chas'); priceTier('actual'); S.chosen={tier:'best'};
 var rvx=document.getElementById('rvFrame').contentDocument; reviewWire(rvx,'best'); var sm11=rvx.querySelector('[data-gap="same"]'), c11=sm11.cloneNode(true); c11.querySelectorAll('.pp-off').forEach(function(e){ e.remove(); });
 ok(/left out/.test(c11.textContent)&&!/lowered/.test(c11.textContent),'only a product left out: section 11 does not say levels were lowered ('+c11.textContent.replace(/\s+/g,' ').trim()+')');
  /* gut-check fixes (18 Oct) */
 S.chosen={tier:'better'}; delete S.elected; actualSeed('better'); S.actual.how='presented'; electedLock(); var el0=JSON.stringify(S.elected.products);
 (S.packages.actual.dropped=S.packages.actual.dropped||[]).push('acc'); priceTier('actual'); goStep('enroll'); await w(300);
 ok(JSON.stringify(S.elected.products)===el0,'carrier edits on the review never rewrite what they chose at Enroll');
 S.chosen={tier:'good'}; renderReview(); await w(600); ok(S.actual.from==='good'&&reviewT()==='actual','a card from a package they are no longer on starts again from the chosen plan');
 S.intake.famcancerP=false; S.intake.famheartP=true; S.intake.famRel={cancerP:['Dad'],heartP:['Mom']}; ok(!/dad/i.test(famRelPhrase())&&/mom/.test(famRelPhrase()),'unticked condition: its Mom/Dad picks drop out ('+famRelPhrase()+')');
 S.chosen={tier:'better'}; renderReview(); await w(1500); var pg9=reviewPages('better').map(function(p){ return p.sc; }), ci=pg9.indexOf('close'); reviewGo(ci); S.rec=pkSnap('better'); reviewGo(ci,true);
 ok((reviewPages('better')[reviewState().pg]||{}).sc==='close','the review stays on the same screen when an optional page disappears');
 var R0=S.rec; S.rec=null; S.recommended='best'; actualSeed('good'); ok(!!reviewTokens('good')['gap.kind'],'older files without a saved recommendation still get the section 11 wording'); S.rec=R0;
  /* pocket reminder on the care card (Jesse, 18 Oct) */
 S.chosen={tier:'better'}; S.rec=pkSnap('best'); S.rec.by='presented'; actualSeed('better'); (S.packages.actual.dropped=S.packages.actual.dropped||[]).push('lbp','lbs'); priceTier('actual'); reviewState().month='November';
 var ccd=careCardData(); ok(ccd.g&&ccd.g.indexOf('lb')>=0&&ccd.rm==='November','the care card carries what is not on the plan yet and the review month: '+JSON.stringify({g:ccd.g,lw:ccd.lw,rm:ccd.rm}));
  /* Direction Rx defaults: ManhattanLife's tracking link and the shared member code (Kyle, 5 Aug; via Health ZONE 18 Oct) */
 var kL=S.agentDrxLink, kC=S.agentDrxCode; S.agentDrxLink=''; S.agentDrxCode=''; ok(drxLink()==='https:'+'//bit.ly/4wf5B7V'&&drxCode()==='4-MEM-26-6','blank Setup: the tracking link and the member code are used');
 S.agentDrxCode='OPT35'; ok(drxCode()==='OPT35','an agent’s own code still wins'); S.agentDrxLink=kL; S.agentDrxCode=kC;
 ok(/30% off/.test(document.getElementById('setupModal').textContent)&&!/35% off/.test(document.getElementById('setupModal').textContent),'Setup says 30%, not 35%');
  /* RxEDO is gone from everything the agent says and the client sees (Jesse, 18 Oct) */
 var rvR=document.getElementById('rvFrame').contentDocument; reviewWire(rvR,'better'); var spoken=Array.prototype.map.call(rvR.querySelectorAll('.say'),function(x){ return x.textContent; }).join(' ');
 ok(!/RxEDO/i.test(spoken)&&/EasyCare2go/.test(spoken),'no RxEDO in anything spoken on the Benefits Review; the prescriptions screen names EasyCare2go');
 ok(reviewTokens('better')['plan.has_afc']==='1','plan.has_afc is set when the plan includes Affordable Choice');
 ok(!AFC_PARTNERS.some(function(p){ return /rxedo/i.test(p.name+p.desc); })&&/prescription/i.test(afcPartnerLines()),'partner benefits: no RxEDO, EasyCare2go carries the prescription discounts');
  /* a client without Affordable Choice is never told about EasyCare2go pharmacy savings (Health ZONE gates on plan.has_afc) */
 S.chosen={tier:'better'}; actualSeed('better'); (S.packages.actual.dropped=S.packages.actual.dropped||[]).push('afc'); priceTier('actual');
 var rvA=document.getElementById('rvFrame').contentDocument; reviewWire(rvA,'better'); var gA=rvA.querySelector('[data-needs="plan.has_afc"]');
 ok(reviewTokens('better')['plan.has_afc']===''&&gA&&gA.classList.contains('pp-off'),'no Affordable Choice: the EasyCare2go pharmacy-savings sentence is hidden');
 actualSeed('better'); reviewWire(rvA,'better'); ok(!gA.classList.contains('pp-off'),'with Affordable Choice it shows');
  /* prescriptions are never in the premium; they sit under the total with the Rx benefit taken off (Jesse, 19 Oct) */
 await benLoadSafe('afc'); var keepM=S.intake.medList; var m0=tierTotals('better').mo;
 S.intake.medList=[{name:'Eliquis',disc:300,forP:true}]; compute(); await w(200);
 var R1=rxPlan('better'); ok(Math.abs(tierTotals('better').mo-m0)<0.01,'adding a $300/mo prescription leaves the Monthly premium unchanged');
 ok(R1.afc&&R1.yr===3600&&R1.covered===R1.cap&&R1.pay===3600-R1.cap,'over the annual max: they pay the difference ('+JSON.stringify(R1)+')');
 ok(tierTrue('better').extra>=R1.payMo-0.01,'true cost still counts what prescriptions cost them after the benefit');
 S.intake.medList=[{name:'A',disc:4,forP:true},{name:'B',disc:11,forP:true}]; compute(); var R15=rxPlan('better'); ok(R15.yr===180&&R15.pay===0,'$4 + $11 a month = $180 a year, under the max: fully covered');
 S.intake.medList=[{name:'Metformin',disc:9,forP:true}]; compute(); await w(200); ok(rxPlan('better').pay===0&&/Covered by the plan/.test(rxLineHTML('better')),'cheap prescriptions: covered by the Rx benefit');
 S.intake.medList=keepM; compute();
  /* staying current: a step change checks the publish time; nothing happens when it hasn't changed */
 ok(typeof ppUpdateCheck==='function'&&PP_VER.at>0,'the update check knows this copy’s publish time');
 PP_VER.last=0; var before=location.href; ppUpdateCheck(); await w(1500); ok(location.href===before,'no newer version: no reload');
  /* underwriting watch (Jesse, 20 Oct): pregnancy -> "Consider a non-ManhattanLife plan"; over build -> red box */
 S=blankState(); applySuiteClient({first:'Preg',last:'Test',state:'FL',age:'30',dob:'01/01/1996',kids:[],health:{pregnant:'Yes'}}); goStep('intake'); await w(400);
 var mn=document.getElementById('matNote'); ok(document.getElementById('in_maternity_p').checked&&mn&&mn.style.display!=='none'&&/ManhattanLife unlikely for this household/.test(mn.textContent)&&/All household applicants will be declined/.test(mn.textContent),'pregnant on the call: Needs maternity ticked and "Consider a non-ManhattanLife plan" shows');
 document.getElementById('in_maternity_p').checked=false; document.getElementById('in_maternity_p').dispatchEvent(new Event('change')); await w(100); ok(mn.style.display==='none','unticked: the line goes');
 var ps=document.getElementById('in_psex'); ps.value=ps.options[1].value; ps.dispatchEvent(new Event('change')); var ph=document.getElementById('in_pheight'); ph.value=ph.options[Math.floor(ph.options.length/2)].value; ph.dispatchEvent(new Event('change'));
 var pw=document.getElementById('in_pweight'); pw.value='480'; pw.dispatchEvent(new Event('input')); await w(150);
 var uw=document.getElementById('uwWatch'); ok(uw.style.display!=='none'&&/build chart/.test(uw.textContent),'over the build chart: the red underwriting box shows under Anything else ('+uw.textContent.slice(0,90)+')');
 pw.value='150'; pw.dispatchEvent(new Event('input')); await w(150); ok(uw.style.display==='none','within build: no box');
 /* ManhattanLife medication check (sandbox, 21 Oct): drug -> what's it for -> red / check with underwriting */
 S.intake.conds=[]; S.intake.medList=[{name:'Copaxone',forP:true},{name:'Prednisone',forP:true},{name:'Insulin glargine (Lantus)',forP:true},{name:'Atorvastatin (Lipitor)',forP:true}]; renderMeds(); await w(150);
 var af=document.getElementById('afcFlags'); ok(af&&af.querySelectorAll('.afcflag.ask').length===3,'three listed drugs ask what they are for, atorvastatin does not ('+(af?af.querySelectorAll('.afcflag').length:'none')+')');
 ok(/decline list when it’s for <b>Parkinson’s, multiple sclerosis/.test(af.innerHTML),'Copaxone asks about Parkinson’s / MS / ALS / epilepsy');
 ok(document.querySelectorAll('#medList .mname.afcwarn').length===3,'the three med boxes go amber');
 af.querySelector('[data-afc="0"][data-v="y"]').click(); await w(150);
 ok(af.querySelector('.afcflag.bad')&&/don’t submit to ManhattanLife/.test(af.textContent),'Yes: red, don’t submit');
 ok((S.intake.conds||[]).some(function(c){ return c.name==="Parkinson's / MS / ALS / epilepsy"; }),'Yes adds the condition to the Intake');
 ok(document.querySelectorAll('#medList .mname.afcbad').length===1,'Copaxone box goes red');
 document.getElementById('afcFlags').querySelector('[data-afc="1"][data-v="n"]').click(); await w(150); af=document.getElementById('afcFlags');
 ok(/Prednisone<\\/b> is on ManhattanLife’s decline list when it’s for ongoing treatment/.test(af.innerHTML)&&/check with underwriting/.test(af.textContent)&&/short steroid burst/.test(af.textContent),'No: amber, check with underwriting, with the short-course note');
 af.querySelector('[data-afc="2"][data-v="g"]').click(); await w(150); af=document.getElementById('afcFlags');
 ok(/gestational diabetes — ManhattanLife postpones/.test(af.textContent),'Insulin: gestational only gets the postpone rule');
 S.intake.medList.push({name:'Enbrel',forP:true}); S.intake.conds.push({name:'Rheumatoid arthritis',forP:true}); renderMeds(); await w(150); af=document.getElementById('afcFlags');
 ok(af.innerHTML.indexOf('Enbrel</b> for rheumatoid arthritis (on the Intake)')>=0,'a listed condition already on the Intake answers it');
 goStep('call'); await w(200); var cu=document.getElementById('callUw'); ok(cu&&/ManhattanLife medication check — 2 don’t-submit/.test(cu.textContent),'Discovery shows the same check above the call: '+(cu?cu.textContent.slice(0,60):'none'));
 goStep('intake'); await w(150);
 document.querySelector('[data-afcinfo]').click(); await w(150); var dr=document.getElementById('uwDrawer'); ok(dr.classList.contains('open')&&dr.querySelectorAll('.uwrow').length===71,'ⓘ opens the full list of 71');
 ok(dr.querySelectorAll('.uwrow.hit').length>=3,'the client’s drugs sit at the top, highlighted');
 var us=document.getElementById('uwSearch'); us.value='restless'; us.dispatchEvent(new Event('input')); await w(50); ok(dr.querySelectorAll('.uwrow').length===2,'search finds Requip and Mirapex by "restless"');
 us.value='zzzz'; us.dispatchEvent(new Event('input')); await w(50); ok(/Not on ManhattanLife’s list/.test(dr.textContent),'no match says not on the list');
 dr.querySelector('[data-uwx]').click(); await w(50); ok(!dr.classList.contains('open'),'× closes it');
 S.intake.medList=[]; S.intake.conds=[]; renderMeds(); await w(100);
 var mhn=document.getElementById('mentNote'), mhc=document.getElementById('in_mental_s'); ok(mhn&&mhn.style.display==='none','mental health unticked: no line');
 mhc.checked=true; mhc.dispatchEvent(new Event('change')); await w(150); ok(mhn.style.display!=='none'&&/Serious mental-health conditions may decline; general depression is typically okay/.test(mhn.textContent)&&mhc.closest('.ps-ctrl').classList.contains('on'),'mental health ticked: turns red with the one line');
 mhc.checked=false; mhc.dispatchEvent(new Event('change')); await w(150); ok(mhn.style.display==='none','mental health unticked again: line gone');
 /* Right-fit path (sandbox, 20 Oct): follows the decision tree from what the Intake knows */
 var rfBase=JSON.parse(JSON.stringify(S)); var rf=function(mod){ S=JSON.parse(JSON.stringify(rfBase)); S.client.state='FL'; S.client.page=40; Object.assign(S.intake,{maternityP:false,maternityS:false,maternity:false,pregNowP:false,pregNowS:false,keepaca:'',diabetic:false,majorcond:false,mental:false,surg2yr:false,budget:0,budgetComfort:0}); S.aca.prem=0; S.aca.subsidy=0; S.rightFit={}; ['in_pbuild','in_sbuild'].forEach(function(i){ document.getElementById(i).classList.remove('bad'); }); mod(); return rightFitPath(rightFitFacts()); };
 ok(rf(function(){})==='pop','right-fit: nothing on file → ManhattanLife POP');
 ok(rf(function(){ S.intake.pregNowS=true; })==='aca','right-fit: pregnancy → ACA (household decline)');
 ok(rf(function(){ document.getElementById('in_pbuild').classList.add('bad'); })==='gi','right-fit: over build → exception path');
 ok(rf(function(){ S.packages.good={products:[{k:'afc',monthly:200}],lb:0}; S.intake.budget=50; })==='budget','right-fit: Essential over budget → BrightLife');
 ok(rf(function(){ S.rightFit.mm=true; })==='triad','right-fit: wants major medical → Triad');
 ok(rf(function(){ S.aca.prem=900; S.aca.subsidy=880; })==='aca','right-fit: subsidy covers most of it → ACA');
 S=JSON.parse(JSON.stringify(rfBase)); S.intake.pregNowP=true; goStep('quote'); compute(); await w(200); var rfe=document.getElementById('rightFit');
 ok(rfe&&rfe.textContent.indexOf('ACA + optional HI Select')>=0&&rfe.textContent.indexOf('p.23')>=0&&/Amerus VL/.test(rfe.textContent)&&/not an underwriting decision/.test(rfe.textContent),'right-fit panel renders on Quote with the path, the guide cite, GI names and the disclaimer: '+(rfe?'':'none'));
 S=JSON.parse(JSON.stringify(rfBase));
 return {n:157, fails:fails}; })()`;
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
