// Present mode (sandbox), driven in headless Chrome against a local preview.
//   node tools/present-check.mjs [port]     (default 8767)
// Checks: the stepper reads Intake, Quote, Present, Enroll; every blank in the script fills from the chosen
// package (no [missing:]); Present never shows on Client View; "Show them" + Back returns to the same section;
// the Apply list puts life first, then ManhattanLife, then the base plan; the mother's maiden name is shown
// while typed but is never in the saved state, localStorage or the printout.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = process.argv[2] || '8767';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DBG = 9300 + Math.floor(Math.random() * 500);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'prcheck-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + DBG, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(), errs = [];
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };

const TEST = `(async function(){
  var fails=[], ok=function(c,m){ if(!c) fails.push(m); }, wait=function(ms){ return new Promise(function(r){ setTimeout(r,ms); }); };
  window.confirm=function(){ return true; }; window.alert=function(){};
  S=blankState(); applySuiteClient({first:'Pat',last:'Present',state:'TX',age:'45',dob:'01/01/1981',kids:[],health:{}});
  S.intake.whyShop='lower premiums'; S.intake.anchor='cur'; S.cur={show:true,prem:1400,ded:6000}; S.aca.prem=897; S.aca.ded=10000;
  S.intake.medList=[{name:'Lipitor (Atorvastatin)',disc:12,cur:40,forP:true}]; S.intake.docs1='Dr. Ramirez (primary care)';
  S.client.agent='Jesse Stamm'; S.agentPhone='555-0199'; S.agentEmail='';
  ['good','better','best'].forEach(function(t){ S.include[t]=true; }); autoPriceTiers(); compute(); goStep('quote'); await wait(300);
  var c=effCfg('best'); c.lb=c.lb||{}; c.lb.p={carrier:'americo',face:'50000'}; autoPriceTiers(); compute(); await wait(100);
  ok(Array.prototype.map.call(document.querySelectorAll('#stepper button'),function(b){ return b.dataset.step; }).join()==='intake,quote,present,enroll','stepper order');
  chooseTier('best'); var pb=document.querySelector('[data-act="present"]'); ok(!!pb,'Present button on the Quote step'); pb.click();
  var fr; for(var i=0;i<60;i++){ await wait(100); fr=document.getElementById('prFrame'); if(fr&&fr.contentDocument&&fr.contentDocument.querySelector('var.pp-ok')) break; }
  ok(S.step==='present','Present step opens'); var d=fr.contentDocument;
  /* screens */
  var pages=presentPages(), shown=function(){ return Array.prototype.filter.call(d.body.children,function(e){ return e.style.display!=='none'&&e.dataset.pg!=null; }); };
  ok(presentNav().length>=15,'script cut into screens ('+presentNav().length+')');
  ok(shown().every(function(e){ return e.dataset.pg==='0'||fr.contentWindow.getComputedStyle(e).display==='none'; })&&/BEFORE YOU DIAL/i.test(d.body.innerText),'screen 1 is Before you dial only');
  ok(/Next: The opening — your first words on the call/.test(document.getElementById('prNav').innerText),'Next says what opens: '+document.getElementById('prNav').innerText);
  var cut=pages.map(function(p,i){ return Array.prototype.filter.call(d.body.children,function(e){ return e.dataset.pg===String(i); }).length; });
  ok(cut.every(function(n){ return n>0; }),'every screen has content (no marker lost): '+cut.join(','));
  ok(Array.prototype.some.call(d.body.children,function(e){ return e.dataset.pg==='-1'&&/Story repository/.test(e.innerText); }),'stories and objections are rail-only');
  ok(document.querySelectorAll('#prQA details').length>=10,'objections in the rail ('+document.querySelectorAll('#prQA details').length+')');
  ok(document.querySelectorAll('#prStories [data-story]').length>=1,'stories in the rail');
  document.querySelector('#prStories [data-story]').click(); ok(/Never a client/.test(document.getElementById('prPop').innerText),'a story pops with the naming rule');
  /* blanks */
  presentWire(d,'best'); var miss={}; d.querySelectorAll('var.pp-miss').forEach(function(v){ miss[v.title.replace(/^.*: /,'')]=1; });
  var allowed=['client.situation','doctor.street','drug.cash','cur.copay','client.ht','client.wt','client.email','client.phone','agent.email','agent.website','agent.booking'];
  var bad=Object.keys(miss).filter(function(k){ return allowed.indexOf(k)<0; });
  ok(!bad.length,'blanks the quote can fill are filled; unexpected gaps: '+bad.join(', '));
  var ps=d.querySelector('var[data-k="plan.products_spoken"]').textContent;
  ok(/health plan/.test(ps)&&/, and /.test(ps)&&!/Living Benefits/i.test(ps),'close lists the package in plain English: '+ps);
  ok(d.querySelector('var[data-k="client.household_to"]').textContent==='to you'&&d.querySelector('var[data-k="client.household_for"]').textContent==='for you','household: to you / for you');
  ok(d.querySelector('var[data-k="afc.rx_cap"]').textContent==='$750','Rx cap from the brochure');
  /* anchor: radios, suggested, none hides saving */
  presentGo(3); await wait(50); var rs=d.querySelectorAll('tr[data-anchor] input[type=radio]'); var visRow=function(a){ return fr.contentWindow.getComputedStyle(d.querySelector('tr[data-anchor="'+a+'"]')).display!=='none'; };
  ok(visRow('aca')&&visRow('cur')&&visRow('none')&&!d.querySelector('tr[data-anchor="employer"]'),'anchors: marketplace, today, none — no payroll row');
  ok(/Suggested/.test(d.querySelector('tr[data-anchor="cur"]').innerText),'highest yearly true cost suggested (current plan here)');
  d.querySelector('tr[data-anchor="aca"]').click(); await wait(30); ok(S.intake.anchor==='aca','picking marketplace sets POP Pro anchor');
  d.querySelector('tr[data-anchor="cur"]').click(); await wait(30); ok(S.intake.anchor==='cur','picking today sets POP Pro anchor');
  var keepCur=S.cur; S.cur={}; presentWire(d,'best'); ok(!visRow('cur')&&presentAnchor()==='aca'&&d.querySelector('tr[data-anchor="aca"] input').checked,'no current premium: today row gone, marketplace selected');
  S.cur=keepCur; presentWire(d,'best');
  d.querySelector('tr[data-anchor="none"]').click(); await wait(30);
  ok(d.querySelector('tr[data-anchor="none"] input').checked&&Array.prototype.every.call(d.querySelectorAll('[data-saving]'),function(x){ return fr.contentWindow.getComputedStyle(x).display==='none'; }),'none: radio ticked and both saving lines hidden');
  d.querySelector('tr[data-anchor="cur"]').click(); await wait(30);
  /* catastrophic: the quote page's own event card, anchor vs the chosen package, Bill Saver on, layers open */
  S.negot.on=false; presentGo(presentPageIx('Catastrophic — walk it as layers')); await wait(60);
  var mc=d.querySelector('[data-mount="conditions"]'), tab=mc&&mc.querySelector('.evtab');
  ok(!!tab&&tab.classList.contains('open')&&mc.closest('details').open,'catastrophic: real event card, layers open');
  ok(tab&&/repeat\\(2,/.test(tab.getAttribute('style'))&&tab.querySelectorAll('.c.h.anc').length===1,'two columns: their anchor and the chosen package');
  ok(/Bill after Medical Bill Saver/.test(tab.innerText),'Bill Saver applied even with the quote-page switch off');
  ok(fr.contentWindow.getComputedStyle(tab).display==='grid','the quote page styling reaches the frame');
  var cs=mc.querySelector('[data-pp="cond"]'); cs.value='arm'; cs.dispatchEvent(new Event('change')); await wait(40);
  ok(!Array.prototype.some.call(d.querySelectorAll('p'),function(p2){ return /same drop-list as the quote page/.test(p2.textContent)&&fr.contentWindow.getComputedStyle(p2).display!=='none'; }),'the mock "Condition" line is gone - only the working picker');
  ok(S.present.cond==='arm'&&/Broken arm|2,209/i.test(d.querySelector('[data-mount="conditions"]').innerText),'picking what happened redraws the card');
  S.negot.on=true;
  /* several medications: one line each, before the plan's prescription benefit */
  S.intake.medList=[{name:'Losartan (Cozaar)',cur:50,disc:15,forP:true},{name:'Metformin (Glucophage)',cur:30,disc:8,forP:true},{name:'Vyvanse (Lisdexamfetamine)',cur:320,disc:95,forP:true}];
  presentGo(presentPageIx('Prescriptions')); await wait(40); var rx=d.querySelector('[data-rx="has"]').innerText;
  ok(rx.indexOf('Losartan runs about $50.00')>=0&&rx.indexOf('Metformin runs about $30.00')>=0&&rx.indexOf('Vyvanse runs about $320.00')>=0,'every medication gets its own line: '+rx.split(String.fromCharCode(10)).join(' ').slice(0,260));
  ok(rx.indexOf('Vyvanse')<rx.indexOf('The plan carries'),'the list comes before the plan benefit sentence');
  presentWire(d,'best'); ok(d.querySelectorAll('.pp-medlist').length===1&&d.querySelectorAll('.pp-medlist li').length===2,'re-filling does not duplicate the list');
  S.intake.medList=[{name:'Lipitor (Atorvastatin)',disc:12,cur:40,forP:true}]; presentWire(d,'best'); ok(!d.querySelector('.pp-medlist'),'one medication: just the sentence');
  /* prescriptions, closes */
  ok(d.querySelector('[data-rx="none"]').classList.contains('pp-off')&&!d.querySelector('[data-rx="has"]').classList.contains('pp-off'),'Rx: the has-prescriptions version is served');
  var closeIx=presentPageIx('Pick your close'); presentGo(closeIx); await wait(30);
  ok(Array.prototype.every.call(d.querySelectorAll('[data-close]'),function(x){ return x.offsetParent!==null; }),'both closes side by side before picking');
  d.querySelector('[data-close="bold"] .pp-pick').click(); await wait(30);
  ok(fr.contentWindow.getComputedStyle(d.querySelector('[data-close="assumptive"]')).display==='none','picking Bold hides Assumptive');
  /* LB in the script writes back to the builder */
  presentGo(presentPageIx('Living benefits — price it & do the numbers')); await wait(30);
  var sel=d.querySelector('[data-lb="lb.p.face"]'); sel.value='25000'; sel.dispatchEvent(new Event('change')); await wait(80);
  ok(effCfg('best').lb.p.face==='25000','LB in the script writes back to the package');
  sel=d.querySelector('[data-lb="lb.p.face"]'); sel.value='50000'; sel.dispatchEvent(new Event('change')); await wait(80);
  var pkb=S.packages.best; pkb.dropped=(pkb.dropped||[]).concat(['lbp']); pbReprice(); presentWire(d,'best'); await wait(40);
  var addB=d.querySelector('[data-lbadd="p"]'); ok(!!addB&&/\$/.test(d.querySelector('[data-mount="lb"]').innerText),'not in the package: priced live with an Add button');
  addB.click(); await wait(80);
  ok(S.packages.best.products.some(function(p){ return p.k==='lbp'&&+p.monthly>0; })&&/In the package/.test(d.querySelector('[data-mount="lb"]').innerText),'Add puts it on the package and shows it as in');
  /* Present ends at the close: Enroll or send the quote */
  var nav=presentNav(); presentGo(nav[nav.length-1]); await wait(30);
  ok(pages[nav[nav.length-1]].t==='Pick your close','Present ends on Pick your close');
  ok(/Enroll them/.test(document.getElementById('prNav').innerText)&&/send the quote/.test(document.getElementById('prNav').innerText),'last screen offers Enroll or Send the quote');
  ok(!nav.some(function(i){ return pages[i].en; }),'application screens are not in Present');
  /* Show them / Back */
  presentShow('ev'); await wait(120);
  ok(document.body.classList.contains('client')&&getComputedStyle(document.getElementById('step-present')).display==='none','Show them: Client View, script hidden');
  ok(!/Presentation Call|pp-ok/.test(document.getElementById('printout').innerHTML),'no script in the printout');
  presentBack(); await wait(600); ok(S.step==='present'&&S.present.pg===nav[nav.length-1],'Back returns to the same screen');
  /* Send the quote lives at the bottom of Quote */
  document.querySelector('#prNav [data-go="quote"]').click(); await wait(100);
  ok(S.step==='quote'&&!!document.querySelector('#step-quote #sendQuote #emailBtn')&&!document.querySelector('#step-enroll #emailBtn'),'Not today → Quote, where Send the quote now lives');
  /* Enroll in call order */
  goStep('enroll'); var ef; for(var k2=0;k2<60;k2++){ await wait(100); ef=document.getElementById('enFrame'); if(ef.contentDocument&&ef.contentDocument.querySelector('var.pp-ok')) break; }
  var ed=ef.contentDocument, vis=function(doc){ return Array.prototype.filter.call(doc.body.children,function(e){ return e.dataset.pg!=null&&e.style.display!=='none'; }).map(function(e){ return +e.dataset.pg; }); };
  await wait(100); ok(ed.querySelector('[data-mount="lifeapp"]').closest('div').classList.contains('pp-off'),'script blue panel replaced on Enroll');
  var pp=document.getElementById('enPeople');
  ok(/First name/.test(pp.innerText)&&/Last name/.test(pp.innerText)&&/Pat/.test(pp.innerText)&&/Present/.test(pp.innerText),'name split into first / last');
  var em=pp.querySelector('[data-enw="i:email"]'); ok(!!em,'blank email is typeable'); em.value='pat@example.com'; em.dispatchEvent(new Event('change'));
  ok(S.intake.email==='pat@example.com','typed blank writes back to the profile');
  var ln=document.querySelector('#enPeople [data-copy="Present"]'); ok(!!ln,'last name has its own copy button');
  var bn=document.querySelector('#enPeople [data-bene="0:name"]'); bn.value='Sam Present'; bn.dispatchEvent(new Event('change'));
  var bp=document.querySelector('#enPeople [data-bene="0:pct"]'); bp.value='100'; bp.dispatchEvent(new Event('change'));
  ok(S.intake.benes&&S.intake.benes[0].name==='Sam Present'&&S.intake.benes[0].pct==='100','beneficiary name and % save to the profile');
  var nt=document.getElementById('enNotes'); nt.value='code word: bluebird'; nt.dispatchEvent(new Event('input'));
  ok(S.intake.notes==='code word: bluebird'&&document.querySelectorAll('#step-enroll textarea#enNotes').length===1,'one Notes box, writing the profile notes');
  ok(!!document.querySelector('[data-enprof="save"]')&&!!document.querySelector('[data-enprof="print"]'),'save / print profile at the end');
  var ef2=document.getElementById('enFrame2'); for(var k3=0;k3<40;k3++){ await wait(100); if(ef2.contentDocument&&ef2.contentDocument.querySelector('.pp-copy')) break; }
  ok(/For security purposes/.test(ef2.contentDocument.body.innerText)&&/Text them the moment/.test(ef2.contentDocument.body.innerText),'security question and wrap-up on Enroll');
  var pc=ef2.contentDocument.querySelector('.pp-copy'); ok(pc&&pc.disabled&&/email/.test(pc.nextSibling.textContent),'post-call copy dimmed, names what is missing');
  ok(document.getElementById('lnkAmerico').style.display!=='none'&&document.getElementById('lnkMutual').style.display==='none','life links: only the carrier priced (Americo)');
  ok(document.getElementById('lnkManhattan').style.display!=='none','health carrier links after');
  var order=['enLife','enScriptApp','enPeople','enScriptEnd','enHealth'].map(function(id){ return document.getElementById(id).getBoundingClientRect().top; });
  ok(order.every(function(v,i){ return !i||v>order[i-1]; }),'Enroll order: life → application → people → finish → health');
  var steps=presentApplyPlan('best').map(function(s){ return s.car.split(' ')[0]; });
  ok(steps[0]==='Americo'&&steps.indexOf('ManhattanLife')>0,'life first then ManhattanLife: '+steps.join(' > '));
  /* maiden name: memory only */
  var mm=document.querySelector('#enPeople [data-mmn]'); ok(!!mm,'maiden-name box on Enroll');
  if(mm){ mm.value='Zzyzxmaiden'; mm.dispatchEvent(new Event('change')); await wait(50); }
  autosave(); await wait(50); var ls=''; for(var j=0;j<localStorage.length;j++){ ls+=localStorage.getItem(localStorage.key(j)); }
  ok(PRESENT_MMN==='Zzyzxmaiden'&&!/Zzyzxmaiden/.test(JSON.stringify(S))&&!/Zzyzxmaiden/.test(ls),'maiden name held, never saved');
  S.intake.beneficiary='Zzyzxbenef'; autosave(); await wait(50); var ls2=''; for(var j2=0;j2<localStorage.length;j2++){ ls2+=localStorage.getItem(localStorage.key(j2)); }
  ok(/Zzyzxbenef/.test(ls2),'control: a saved field does reach localStorage');
  var dd=document.implementation.createHTMLDocument('t'); dd.body.innerHTML='<var data-k="client.first">X</var><var data-k="no.such">Y</var><var>$50</var>';
  var nf=presentFillFrame(dd,presentTokens('best')), vs=dd.querySelectorAll('var'); ok(nf===1&&vs[2].textContent==='$50','filler leaves unnamed text alone');
  return {n:d.querySelectorAll('var.pp-ok').length, fails:fails};
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
  console.log(bad.length ? `PRESENT FAILED ${bad.length}:\n  ` + bad.join('\n  ') : `PRESENT ok blanks=${r.n}`);
  process.exitCode = bad.length ? 1 : 0;
} catch (e) { console.log('PRESENT FAILED ' + e.message); process.exitCode = 1; }
finally { try { ws && ws.close(); } catch {} chrome.kill(); await sleep(300); fs.rmSync(prof, { recursive: true, force: true }); }
