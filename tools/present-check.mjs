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
  ok(S.step==='present','Present step opens');
  ok(/^Presenting the Comprehensive plan to Pat$/.test(document.querySelector('.pr-top h3').innerText)&&!!document.querySelector('.pr-top h3 .pr-plan'),'title: Presenting the *Comprehensive* plan to Pat'); var d=fr.contentDocument;
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
  presentWire(d,'best'); var miss={}; d.querySelectorAll('var.pp-miss:not(.pp-off)').forEach(function(v){ miss[v.title.replace(/^.*: /,'')]=1; });
  var allowed=['drug.now','client.ht','client.wt','client.email','client.phone','agent.email','agent.website','agent.booking'];
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
  ok(Array.prototype.every.call(d.querySelectorAll('.who'),function(x){ return fr.contentWindow.getComputedStyle(x).display==='none'; }),'MIKE / JESSE / KYLE tags hidden');
  ok(!/Source tags show/.test(d.body.innerText)&&/filled automatically/.test(d.querySelector('p.legend').innerText),'tag legend line removed, the rest of the legend kept');
  ok(fr.contentWindow.getComputedStyle(d.querySelector('p.sub0')).display==='none','build note under the title hidden');
  presentGo(presentPageIx('Networks & providers')); await wait(30);
  var drLine=Array.prototype.filter.call(d.querySelectorAll('.say'),function(x){ return /already found Dr/.test(x.innerText); })[0];
  ok(drLine&&!/ on /.test(drLine.innerText.split('—')[0].replace(/^.*already found Dr/,''))&&!/street/i.test(drLine.innerText),'doctor line has no street: '+(drLine&&drLine.innerText.slice(0,90)));
  /* exactly one anchor block is spoken, chosen from the data */
  presentGo(presentPageIx('Price the marketplace & pick the anchor')); await wait(20);
  var shownSay=function(){ return Array.prototype.filter.call(d.querySelectorAll('[data-anchor-say]'),function(x){ return fr.contentWindow.getComputedStyle(x).display!=='none'; }).map(function(x){ return x.getAttribute('data-anchor-say'); }).join(); };
  ok(shownSay()==='cur','paying for it themselves: only the today version ('+shownSay()+')');
  ok(Array.prototype.every.call(d.querySelectorAll('[data-leadin]'),function(x){ return fr.contentWindow.getComputedStyle(x).display==='none'; })&&d.querySelectorAll('[data-leadin]').length===2,'the If-they lead-ins are hidden');
  var kc=JSON.stringify(S.cur); S.cur.emp=400; presentWire(d,'best'); ok(shownSay()==='aca','employer pays part: the marketplace version ('+shownSay()+')');
  S.cur={}; presentWire(d,'best'); ok(shownSay()==='aca','no current plan: the marketplace version ('+shownSay()+')');
  var aside=function(){ var x=Array.prototype.filter.call(d.querySelectorAll('.say'),function(y){ return /to the side/.test(y.textContent); })[0]; return x&&x.textContent; };
  S.cur=JSON.parse(kc); S.cur.paying=true; presentWire(d,'best'); ok(/put those to the side/.test(aside()),'two plans: put those to the side');
  S.cur.paying=false; presentWire(d,'best'); ok(/put that one to the side/.test(aside()),'one plan: put that one to the side');
  S.cur=JSON.parse(kc); S.cur.paying=false; presentWire(d,'best'); ok(shownSay()==='aca'&&fr.contentWindow.getComputedStyle(d.querySelector('tr[data-anchor="cur"]')).display==='none','premium on file but not paying now: marketplace version, no today anchor ('+shownSay()+')');
  S.cur.paying=true; presentWire(d,'best'); ok(shownSay()==='cur','paying now: the today version');
  S.cur=JSON.parse(kc); presentWire(d,'best');
  ok(!!d.querySelector('.say b > i')&&/insert their situation/.test(d.querySelector('.say b > i').textContent),'(insert their situation) in bold italic');
  ok(!Array.prototype.some.call(d.body.children,function(e){ return /^(Those three are options|One word in that line|Worth knowing so you never sell)/.test((e.textContent||'').trim())&&fr.contentWindow.getComputedStyle(e).display!=='none'; }),'author notes Jesse removed are hidden');
  ok(!d.querySelector('var[data-k="client.situation"]')&&d.body.textContent.indexOf('small business owners / 1099')>=0,'their situation is plain script words, no blank');
  ok(!!d.querySelector('[data-screen="lb-price"]'),'lb-price marker is a real element');
  ok(!Array.prototype.some.call(d.body.children,function(e){ return /^\s*↳/.test(e.textContent)&&fr.contentWindow.getComputedStyle(e).display!=='none'; }),'the ↳ explanation lines are hidden');
  ok(/Kyle.s daughter/.test(document.getElementById('prStories').innerText),'prose mentioning Kyle is untouched');
  /* every screen shows only its own blocks (a forcing style once leaked the closes onto every screen) */
  var leaks=[]; for(var pi=0;pi<presentNav().length;pi++){ var ix=presentNav()[pi]; presentGo(ix); await wait(10);
    Array.prototype.forEach.call(d.body.children,function(e){ if(e.dataset.pg!=null&&+e.dataset.pg!==ix&&fr.contentWindow.getComputedStyle(e).display!=='none') leaks.push(pages[ix].t+' shows '+(e.innerText||'').slice(0,30)); }); }
  ok(!leaks.length,'no block shows on another screen: '+leaks.slice(0,3).join(' | '));
  presentGo(presentPageIx('Price the marketplace & pick the anchor'));
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
  ok(rx.indexOf('Losartan')>=0&&rx.indexOf('$50.00')>=0>=0&&rx.indexOf('Metformin runs about $30.00')>=0&&rx.indexOf('Vyvanse runs about $320.00')>=0,'every medication gets its own line: '+rx.split(String.fromCharCode(10)).join(' ').slice(0,260));
  ok(rx.indexOf('Vyvanse')<rx.indexOf('The plan carries'),'the list comes before the plan benefit sentence');
  presentWire(d,'best'); ok(d.querySelectorAll('.pp-medclone').length===2&&d.querySelectorAll('[data-repeat="meds"]').length===1,'the script sentence repeats once per medication; re-filling does not duplicate');
  S.intake.medList=[{name:'Lipitor (Atorvastatin)',disc:12,cur:40,forP:true}]; presentWire(d,'best'); ok(!d.querySelector('.pp-medlist')&&!d.querySelector('.pp-medclone'),'one medication: just the sentence');
  /* prescriptions, closes */
  ok(d.querySelector('[data-rx="none"]').classList.contains('pp-off')&&!d.querySelector('[data-rx="has"]').classList.contains('pp-off'),'Rx: the has-prescriptions version is served');
  var closeIx=presentPageIx('Pick your close'); presentGo(closeIx); await wait(30);
  var cl=d.querySelectorAll('[data-close]'), or=Array.prototype.filter.call(d.querySelectorAll('[data-closes] > *'),function(x){ return !x.hasAttribute('data-close')&&/^\s*OR\s*$/i.test(x.textContent); })[0]||d.querySelector('.pp-or');
  ok(d.querySelectorAll('.pp-or').length+(d.querySelector('[data-closes]')?1:0)===1,'exactly one OR');
  ok(cl.length===2&&Array.prototype.every.call(cl,function(x){ return x.offsetParent!==null; })&&!!or&&cl[0].getBoundingClientRect().left<or.getBoundingClientRect().left&&or.getBoundingClientRect().left<cl[1].getBoundingClientRect().left,'Assumptive | OR | Bold side by side: '+Array.prototype.map.call(cl,function(x){ return x.getAttribute('data-close')+'@'+Math.round(x.getBoundingClientRect().left)+(x.offsetParent?'':'(hidden)'); }).join(' ')+' or='+(or?Math.round(or.getBoundingClientRect().left):'none')+' pg='+S.present.pg);
  ok(!d.querySelector('.pp-pick'),'no "use this close" buttons');
  /* LB in the script writes back to the builder */
  presentGo(presentPageIx('Living benefits — price it & do the numbers')); await wait(30);
  var sel=d.querySelector('[data-lb="lb.p.face"]'); sel.value='25000'; sel.dispatchEvent(new Event('change')); await wait(80);
  ok(effCfg('best').lb.p.face==='25000','LB in the script writes back to the package');
  sel=d.querySelector('[data-lb="lb.p.face"]'); sel.value='50000'; sel.dispatchEvent(new Event('change')); await wait(80);
  var pkb=S.packages.best; pkb.dropped=(pkb.dropped||[]).concat(['lbp']); pbReprice(); presentWire(d,'best'); await wait(40);
  var addB=d.querySelector('[data-lbadd="p"]'); ok(!!addB&&/\$/.test(d.querySelector('[data-mount="lb"]').innerText),'not in the package: priced live with an Add button');
  addB.click(); await wait(80);
  ok(S.packages.best.products.some(function(p){ return p.k==='lbp'&&+p.monthly>0; })&&/In the package/.test(d.querySelector('[data-mount="lb"]').innerText),'Add puts it on the package and shows it as in');
  /* Other carrier, typed in the script, is the same setting the builder shows */
  var cs=d.querySelector('[data-lb="lb.p.carrier"]'); cs.value='other'; cs.dispatchEvent(new Event('change')); await wait(60);
  var fi=function(n2){ return d.querySelector('[data-lb="lb.p.'+n2+'"]'); };
  ok(!!fi('otherName')&&!!fi('otherMonthly')&&fi('face').tagName==='INPUT','Other opens carrier / coverage / monthly in the script');
  fi('face').value='100,000'; fi('face').dispatchEvent(new Event('change')); await wait(40);
  fi('otherName').value='Corebridge QoL Flex'; fi('otherName').dispatchEvent(new Event('change')); await wait(40);
  fi('otherMonthly').value='52.10'; fi('otherMonthly').dispatchEvent(new Event('change')); await wait(80);
  var lpr=S.packages.best.products.filter(function(p){ return p.k==='lbp'; })[0];
  ok(lpr&&lpr.monthly===52.1&&lpr.name.indexOf('$100K (Corebridge QoL Flex)')>=0&&effCfg('best').lb.p.otherName==='Corebridge QoL Flex','script Other writes the builder setting: '+(lpr&&lpr.name));
  cs=d.querySelector('[data-lb="lb.p.carrier"]'); cs.value='americo'; cs.dispatchEvent(new Event('change')); await wait(60);
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
  goStep('enroll'); await wait(300);
  var pp=document.getElementById('enPeople');
  ok(!document.getElementById('enFrame')&&!document.getElementById('enScriptApp'),'no script application card - the person blocks are section 2');
  var val=function(path){ var el=pp.querySelector('[data-enw="'+path+'"]'); return el&&el.value; };
  ok(val('name:p:0')==='Pat'&&val('name:p:1')==='Present','first / last name are their own boxes');
  ok(pp.querySelectorAll('.en-person').length>=1&&!pp.querySelector('details'),'blocks are open, not collapsed');
  var em=pp.querySelector('[data-enw="i:email"]'); em.value='pat@example.com'; em.dispatchEvent(new Event('change'));
  ok(S.intake.email==='pat@example.com','a typed box writes back to the profile');
  var ln=pp.querySelector('[data-enw="name:p:1"]'); ln.value='Presently'; ln.dispatchEvent(new Event('change'));
  ok(S.client.pname==='Pat Presently','editing the last name updates the profile name');
  /* smart fields */
  ok(smartDOB('63078')==='06/30/1978'&&smartDOB('6/30/78')==='06/30/1978'&&smartDOB('06301978')==='06/30/1978'&&smartDOB('9214')===''&&smartDOB('13/40/90')==='','smart DOB: 63078 / 6/30/78 / 06301978 -> 06/30/1978; 4 digits and nonsense refused');
  ok(smartHeight('52')==='62'&&smartHeight('511')==='71'&&smartHeight("5'2")==='62'&&smartHeight('5 2')==='62'&&smartHeight('99')==='','smart height: 52 -> 5ft2, 511 -> 5ft11');
  var db=pp.querySelector('[data-enw="c:dob"]'); db.value='63078'; db.dispatchEvent(new Event('change')); pp=document.getElementById('enPeople');
  ok(pp.querySelector('[data-enw="c:dob"]').value==='06/30/1978'&&+S.client.page>=47,'Enroll DOB becomes 06/30/1978 and fills the age ('+S.client.page+')');
  var hb=pp.querySelector('[data-enw="ht:pheight"]'); hb.value='52'; hb.dispatchEvent(new Event('change')); pp=document.getElementById('enPeople');
  ok(S.intake.pheight==='62'&&/5.2/.test(pp.querySelector('[data-enw="ht:pheight"]').value),'Enroll height 52 -> 5ft2in');
  var tb=pp.querySelector('[data-enw="tob:tobaccoP"]'); tb.value='Yes'; tb.dispatchEvent(new Event('change')); ok(S.intake.tobaccoP===true,'tobacco Yes/No writes back');
  var nm=pp.querySelector('[data-enl="med:p:new"]'); nm.value='Metformin'; nm.dispatchEvent(new Event('change')); pp=document.getElementById('enPeople');
  ok(pp.querySelectorAll('[data-enl^="med:p:"]:not([data-enl$=":new"])').length===2&&S.intake.medList.some(function(m){ return m.name==='Metformin'&&m.forP; }),'medications: a row each, and a new one lands in the profile');
  var bn=pp.querySelector('[data-bene="p:0:name"]'); bn.value='Sam Present'; bn.dispatchEvent(new Event('change'));
  var bp=pp.querySelector('[data-bene="p:0:pct"]'); bp.value='100'; bp.dispatchEvent(new Event('change'));
  ok(S.intake.benes&&S.intake.benes[0].name==='Sam Present'&&S.intake.benes[0].pct==='100','beneficiary name and % save to the profile');
  /* Enroll's Notes box mirrors the Intake notes both ways (it is the same field) */
  goStep('intake'); await wait(100); $('in_notes').value='from the navigator: wants low deductible'; $('in_notes').dispatchEvent(new Event('input')); goStep('enroll'); await wait(200);
  ok(document.getElementById('enNotes').value==='from the navigator: wants low deductible','Intake notes show in the Enroll notes box');
  var mainN=document.getElementById('enNotes'); mainN.value='code word: bluebird'; mainN.dispatchEvent(new Event('input'));
  var pn=pp.querySelector('[data-pnote="p"]'); pn.value='prefers texts after 5pm'; pn.dispatchEvent(new Event('input'));
  goStep('intake'); await wait(100); ok(/Pat: prefers texts/.test($('in_notes').value),'Enroll notes and person notes show back on the Intake notes'); goStep('enroll'); await wait(200); pp=document.getElementById('enPeople');
  ok(/code word: bluebird/.test(S.intake.notes)&&/— From the application —/.test(S.intake.notes)&&/Pat: prefers texts after 5pm/.test(S.intake.notes),'person notes land in the one main notes field as "Name: …"');
  pn.value='prefers texts after 6pm'; pn.dispatchEvent(new Event('input'));
  ok((S.intake.notes.match(/Pat: /g)||[]).length===1&&/after 6pm/.test(S.intake.notes),'editing a person note replaces its line, never stacks');
  for(var ws=0;ws<40&&!/For security purposes/.test(pp.querySelector('.en-say').innerText);ws++) await wait(100);
  ok(/For security purposes/.test(pp.querySelector('.en-say').innerText)&&!/notes field/i.test(pp.querySelector('.en-say').innerText),'security question rendered from the script beside the maiden-name box (no write-it-in-notes tip)');
  ok(['lnkMutual','lnkNLG','lnkAmerico','lnkManhattan','lnkCigna','lnkLifex'].every(function(id){ return document.getElementById(id).style.display!=='none'; }),'standard life and health links always shown');
  ok(document.getElementById('lnkNLG').href.indexOf('nationallife.com/agent')>=0,'National Life Group agent login');
  var order=['enLife','enPeople','enScriptEnd','enHealth'].map(function(id){ return document.getElementById(id).getBoundingClientRect().top; });
  ok(order.every(function(v,i){ return !i||v>order[i-1]; }),'Enroll order: life → each person → wrapping up → health');
  var fl=document.getElementById('followList').innerText;
  ok(/Tax-Free Retirement Account/.test(fl)&&/employer/.test(fl)&&/beneficiaries are often your first referrals/.test(fl),'follow-ups: TFRA, employer, referrals');
  ok(!/discuss Living Benefits/.test(fl),'LB on the plan: no living-benefits follow-up');
  var ef2=document.getElementById('enFrame2'); for(var k3=0;k3<40;k3++){ await wait(100); if(ef2.contentDocument&&ef2.contentDocument.querySelector('.pp-copy')) break; }
  ok(!Array.prototype.some.call(ef2.contentDocument.querySelectorAll('[data-close]'),function(x){ return ef2.contentWindow.getComputedStyle(x).display!=='none'&&x.closest('body>*').style.display!=='none'; })&&!/Assumptive Sale Close/.test(ef2.contentDocument.body.innerText),'no closes under Wrapping things up');
  ok(/That.s everything I need/.test(ef2.contentDocument.body.innerText)&&!/For security purposes/.test(ef2.contentDocument.body.innerText),'wrapping up starts with That is everything I need');
  ok(/Text them the moment/.test(ef2.contentDocument.body.innerText)&&Array.prototype.every.call(ef2.contentDocument.body.children,function(e){ return !/^For security purposes/.test((e.innerText||'').trim())||e.classList.contains('pp-off'); }),'wrapping up on Enroll; security question moved to the maiden-name box');
  var pc=ef2.contentDocument.querySelector('.pp-copy'); ok(pc&&pc.disabled&&/email/.test(pc.nextSibling.textContent),'post-call copy dimmed, names what is missing');
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
  /* the navigator's answer travels in the push (last: a push switches POP Pro to the Intake step) */
  var nOk=d.querySelectorAll('var.pp-ok').length;
  applySuiteClient({first:'Pat',last:'Present',state:'TX',age:'45',health:{curPrem:'900',curPaying:'No'}}); ok(curIn().paying===false,'navigator "No" lands as not paying');
  applySuiteClient({first:'Pat',last:'Present',state:'TX',age:'45',health:{curPrem:'900',curPaying:'Yes'}}); ok(curIn().paying===true,'navigator "Yes" lands as paying');
  return {n:nOk, fails:fails};
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
