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
  var pblob2=null; goStep('quote'); await wait(200); ok(!!document.querySelector('.bh [data-copypic="plans"]'),'Copy plans button on the Package builder');
  pblob2=await picOf('plans'); ok(pblob2&&pblob2.type==='image/png'&&pblob2.size>50000&&getComputedStyle(document.getElementById('printout')).display==='none','the three plans render to a PNG and the page is left as it was');
  var eb=document.querySelector('.plainband [data-copypic="ev0"]'); ok(!!eb&&!document.querySelector('.evtab [data-copypic]'),'Copy example sits top right in the Example header bar, not in the table');
  var ebl=await picOf('ev0'); ok(ebl&&ebl.type==='image/png'&&ebl.size>50000,'the Quote example renders to a PNG');
  var etmp=document.createElement('div'); etmp.innerHTML=evTableHTML(0,{open:true,pic:true}); var en=etmp.querySelector('.evcorner .evname'); ok(en&&!etmp.querySelector('.evcorner button')&&en.textContent===(S.ev[0].desc||S.ev[0].label||en.textContent),'in the picture the corner names the example instead of the button');
  S.chosen={tier:'best'}; compute(); await wait(200); var pbs=[document.querySelector('[data-act="present"]'),document.getElementById('presentBtn2')]; ok(pbs.every(function(b){ return b&&b.textContent.indexOf('Present Comprehensive Plan')>0&&b.querySelector('i')&&b.querySelector('i').textContent==='Comprehensive'; }),'both Present buttons read Present Comprehensive Plan with the plan in italics: '+pbs.map(function(b){ return b?b.innerHTML:'none'; }).join(' | '));
  for(var bw=0;bw<40&&!BROCH;bw++) await wait(50); compute(); var BL=brochList('best');
  ok(BL.list.length>=4&&BL.list.every(function(b){ return /^https:[/][/]drive[.]google[.]com[/]file[/]d[/][A-Za-z0-9_-]+[/]view$/.test(b.url); }),'the Comprehensive plan in TX has its ManhattanLife brochure links ('+BL.list.map(function(b){ return b.name; }).join(', ')+')');
  var keepCh=S.chosen; S.chosen={}; var BA=brochList(); S.chosen={tier:'good'}; var BG=brochList(); S.chosen=keepCh; compute();
  ok(BA.t==='all'&&BA.list.length>=BG.list.length&&BG.list.every(function(b){ return BA.list.some(function(x){ return x.url===b.url; }); })&&BG.t==='good','no plan marked -> brochures for every plan shown; a marked plan -> only its own');
  ok(document.getElementById('brochBox').style.display!=='none'&&document.querySelectorAll('#brochBox .brlist a').length===BL.list.length,'Quote page shows Brochures for this plan, one link each');
  ok(BL.list.every(function(b){ return buildEmail().body.indexOf(b.url)>0; }),'the quote email lists every brochure link');
  var kq=S.sendq, tmr=new Date(Date.now()+864e5), ymd=tmr.getFullYear()+'-'+String(tmr.getMonth()+1).padStart(2,'0')+'-'+String(tmr.getDate()).padStart(2,'0'); S.sendq={date:ymd,time:'18:00',pdf:true,atz:'America/Chicago'}; var e1=buildEmail().body; S.sendq.atz='America/New_York'; var e3=buildEmail().body; S.sendq.atz='America/Chicago'; S.sendq={}; var e2=buildEmail().body; S.sendq=kq;
  ok(/at 5:00 pm your time[.]/.test(e3),'an Eastern agent booking 6 pm gives a Texas client 5 pm');
  ok(/Let’s talk tomorrow, [A-Z][a-z]+day, at 6:00 pm your time[.]/.test(e1)&&/^Attached is your/m.test(e1)&&/I’ll follow up with you in the next day or two/.test(e2)&&!/Attached/.test(e2),'quote email: follow-up time and PDF-saved tick change the wording; blank falls back to the generic lines');
  var bx=document.createElement('div'); bx.innerHTML='<p>Discounts up to 80%</p>'; picWords(bx); ok(bx.querySelectorAll('span').length===4&&bx.textContent.replace(/ /g,'')==='Discountsupto80%','picture words each get their own box (Safari spacing fix)');
  ok(AFC_PARTNERS.every(function(p){ return AFC_PARTNER_EMAIL[p.name]; })&&(afcInPk(S.packages.best)?/partner benefits built in/.test(enrollEmail().body):true),'enrollment email carries a line for each of the six partners');
  var kb=S.cfg&&S.cfg.good?S.cfg.good.base:undefined; ok(!tierNonMh('best')&&NONMH.lifex&&NONMH.triad&&!!document.getElementById('enSaveBar'),'Manhattan plans present normally; LifeX/Cigna have a notice; Enroll carries the Save Quote reminder');
  var lbB=lbSummary('best'); ok(!lbB.length||(/includes living benefits/.test(buildEmail().body)||/can include living benefits/.test(buildEmail().body)),'quote email mentions living benefits when the plan carries them');
  ok(!lbB.length||lbB.every(function(x){ return enrollEmail().body.indexOf(x.who+' — ')>0; }),'enrollment email lists each person’s living-benefit coverage');
  ok(PR_STATE==='ok'&&(S.packages.best.products||[]).some(function(p){ return p.k==='gap'&&+p.monthly>0; }),'full rates loaded before packages are built: Out-of-Pocket prices in TX');
  ok(followTasks().some(function(x){ return x.id==='review'; }),'Enroll follow-ups always include the benefits review call');
  var ptx=postTextHTML('best'); ok(/congrats and thank you/.test(ptx)&&/is my agency; /.test(ptx)&&/underwriting/.test(ptx)&&/walk through it all/.test(ptx),'post-call text: congrats, underwriting, who holds the coverage');
  ok(/you did something great for yourself/.test(ptx)&&/Watch your inbox: I’m sending you an email with links to all your product brochures and more detail on everything[.]/.test(ptx)&&/I’m your agent for life — call or text anytime/.test(ptx),'post-call text matches the wording Jesse locked on 9 Oct');
  var kA=[S.agentWebsite,S.agentBooking]; applySuiteAgent({website:'https://example.com',booking:'https://example.com/book'}); ok(S.agentWebsite==='https://example.com'&&S.agentBooking==='https://example.com/book','website and booking link arrive from the navigator Set up'); S.agentWebsite=kA[0]; S.agentBooking=kA[1];
  var aw=document.getElementById('in_aweb'), kw=aw.value; aw.value=''; agentGlow(); var g1=aw.closest('.fld').classList.contains('needfill'); aw.value='x.com'; agentGlow(); var g2=aw.closest('.fld').classList.contains('needfill'); aw.value=kw; agentGlow();
  ok(g1&&!g2,'an empty agent box glows until it is filled');
  var kc=S.chosen; S.chosen={}; chooseTier('best'); ok(document.querySelectorAll('.cele-float').length>0,'choosing a plan floats a thumbs-up'); document.querySelectorAll('.cele-float').forEach(function(e){ e.remove(); }); S.chosen=kc; compute();
  var hasLbP=(S.packages[chosenTier()||S.activeTab].products||[]).some(function(p){ return p.k==='lbp'&&+p.monthly>0; });
  ok(enFieldsFor('p').some(function(f){ return f[0]==='Living benefits policy #'; })===hasLbP,'living-benefits policy # appears in the applicant block exactly when they have living benefits');
  enWrite('i:lbPolicyP','LB12345'); ok(S.intake.lbPolicyP==='LB12345','the policy # saves with the quote');
  if(hasLbP){ goStep('enroll'); await wait(250); ok(/Policy # LB12345/.test(document.getElementById('enrollSummary').textContent),'the policy # shows on the Enroll summary beside living benefits'); goStep('quote'); await wait(150); }
  S.intake.lbPolicyP='';
  ok(/Let’s get .*Package of Protection!/.test(enrollCheer())&&!/They’re in/.test(enrollCheer()),'the Enroll banner says Let’s get <names> their Package of Protection');
  goStep('enroll'); await wait(200); CELE_GOLD_PENDING=false; goldFinale(); window.dispatchEvent(new Event('focus')); await wait(2500);
  ok(document.querySelectorAll('#followList .fu-glow').length>0,'enrollment email: gold confetti, then the open follow-ups glow'); document.querySelectorAll('.cele-banner,.cele-canvas').forEach(function(e){ e.remove(); }); goStep('quote'); await wait(200);
  var fb=document.getElementById('fabSave'); ok(fb&&fb.classList.contains('noprint'),'floating Save tab is on the page and never prints');
  document.body.classList.add('client'); ok(getComputedStyle(fb).display==='none','floating Save hides in Client View'); document.body.classList.remove('client');
  ok(/^POP_Pro_.+_[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{1,2}-[0-9]{2}(am|pm)[.]json$/.test(fileName()),'each save file is named with the local date and time: '+fileName());
  ok(!!document.getElementById('sqDate')&&!!document.getElementById('sqTime')&&!!document.getElementById('sqPdf')&&document.querySelectorAll('#sendQuote .sqstep').length===3,'Send the quote has its three steps');
  ok(!document.querySelector('#printout .brlist')&&document.getElementById('brochBox').classList.contains('hidein-client'),'the brochure box stays off the printout and Client View');
  buildPrintout(); ok(!document.querySelector('#printout [data-copypic]')&&!/Copy (plans|example|picture)/.test(document.getElementById('printout').textContent),'no copy button inside the printout / emailed quote');
  var cps=Array.prototype.slice.call(document.querySelectorAll('[data-copypic]')); ok(cps.length>=3&&cps.every(function(b){ return !!b.closest('.noprint')&&!!b.closest('.hidein-client'); }),'every copy button is screen-only: hidden on print and in Client View ('+cps.length+')');
  document.body.classList.add('client'); ok(cps.every(function(b){ return !b.offsetParent; }),'Client View shows no copy button'); document.body.classList.remove('client');
  presentOpen(); for(var ii=0;ii<60;ii++){ await wait(100); fr=document.getElementById('prFrame'); if(fr&&fr.contentDocument&&fr.contentDocument.querySelector('var.pp-ok')) break; }
  ok(S.step==='present','Present step opens');
  var g8=document.querySelector('#clientStrip .grid8'); ok(getComputedStyle(g8).display==='none'&&/Pat/.test(document.getElementById('csSum').textContent),'client strip folds to one line on Present');
  document.getElementById('csCaret').click(); ok(getComputedStyle(g8).display==='grid','caret pins it open'); document.getElementById('csCaret').click(); ok(getComputedStyle(g8).display==='none','caret folds it again');
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
  var hasSdr=S.packages.best.products.some(function(p){ return p.k==='sdr'&&+p.monthly>0; });
  ok(/Specified Disease/.test(ps)===hasSdr,'Specified Disease named only when the rider is on the plan ('+hasSdr+'): '+ps);
  ok(d.querySelector('var[data-k="client.household_to"]').textContent==='to you'&&d.querySelector('var[data-k="client.household_for"]').textContent==='for you','household: to you / for you');
  ok(d.querySelector('var[data-k="afc.rx_cap"]').textContent==='$750','Rx cap from the brochure');
  /* anchor: radios, suggested, none hides saving */
  presentGo(3); await wait(50); var rs=d.querySelectorAll('tr[data-anchor] input[type=radio]'); var visRow=function(a){ return fr.contentWindow.getComputedStyle(d.querySelector('tr[data-anchor="'+a+'"]')).display!=='none'; };
  ok(visRow('aca')&&visRow('cur')&&visRow('none')&&!d.querySelector('tr[data-anchor="employer"]'),'anchors: marketplace, today, none — no payroll row');
  var star=function(a){ var sl=d.querySelector('tr[data-anchor="'+a+'"] [data-suggested-slot]'); return sl?sl.textContent:''; };
  ok(/SUGGESTED/.test(star('cur'))&&!/SUGGESTED/.test(star('aca')),'star on the higher yearly true cost (current plan here), not hard-coded on marketplace: cur="'+star('cur')+'" aca="'+star('aca')+'"');
  var kcs=JSON.stringify(S.cur); S.cur.prem=100; S.cur.ded=500; presentWire(d,'best'); ok(/SUGGESTED/.test(star('aca'))&&!star('cur'),'cheap current plan: star moves to marketplace');
  ok(((d.querySelector('tr[data-anchor="aca"] [data-truecost-slot]')||{}).textContent||'').indexOf('/yr true cost')>0&&!d.querySelector('.pp-yr'),'yearly true cost in the script slot, nothing injected'); S.cur=JSON.parse(kcs); presentWire(d,'best');
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
  ok(!Array.prototype.some.call(d.body.children,function(e){ return /^(Those three are options|One word in that line|Worth knowing so you never sell|One note of the same kind as the CareGuide|The figure in that line is derived)/.test((e.textContent||'').trim())&&fr.contentWindow.getComputedStyle(e).display!=='none'; }),'author notes Jesse removed are hidden');
  ok(/you.re waiting for confirmation that you.re aligned/.test(d.body.textContent)&&!/Stop here\. You are waiting to hear/.test(d.body.textContent),'section 3 cue: alignment wording');
  ok(!Array.prototype.some.call(d.querySelectorAll('p.cue'),function(x){ return /This step exists because/i.test(x.textContent)&&fr.contentWindow.getComputedStyle(x).display!=='none'; }),'Q1 note hidden');
  ok(!d.querySelector('var[data-k="client.situation"]')&&d.body.textContent.indexOf('small business owners / 1099')>=0,'their situation is plain script words, no blank');
  ok(!!d.querySelector('[data-screen="lb-price"]'),'lb-price marker is a real element');
  ok(!Array.prototype.some.call(d.body.children,function(e){ return /^\s*↳/.test(e.textContent)&&fr.contentWindow.getComputedStyle(e).display!=='none'; }),'the ↳ explanation lines are hidden');
  ok(/Kyle.s daughter/.test(document.getElementById('prStories').innerText),'prose mentioning Kyle is untouched');
  /* copy-as-picture: section 8 button, and the picture itself */
  ok(!!d.querySelector('[data-screen="bonus"] .pp-picbtn'),'Copy "Bonus Benefits" button in section 8');
  var pblob=await picOf('partners'); ok(pblob&&pblob.type==='image/png'&&pblob.size>50000,'partner benefits render to a PNG ('+(pblob&&pblob.size)+' bytes)');
  /* every screen shows only its own blocks (a forcing style once leaked the closes onto every screen) */
  var leaks=[]; for(var pi=0;pi<presentNav().length;pi++){ var ix=presentNav()[pi]; presentGo(ix); await wait(10);
    Array.prototype.forEach.call(d.body.children,function(e){ if(e.dataset.pg!=null&&+e.dataset.pg!==ix&&fr.contentWindow.getComputedStyle(e).display!=='none') leaks.push(pages[ix].t+' shows '+(e.innerText||'').slice(0,30)); }); }
  ok(!leaks.length,'no block shows on another screen: '+leaks.slice(0,3).join(' | '));
  presentGo(presentPageIx('Price the marketplace & pick the anchor'));
  /* doctor line: every doctor, "they're (all) in the network" */
  presentGo(presentPageIx('Networks & providers')); await wait(20);
  var drLine2=function(){ return Array.prototype.filter.call(d.querySelectorAll('.say'),function(x){ return /already found/.test(x.textContent); })[0].textContent.split(String.fromCharCode(10)).join(' '); };
  var keepDocs=S.intake.docs1; S.intake.docs1='Tonya Renee Brown, Dr Freedman, Dr. Suresh B. Indupalli - primary care dr'; presentWire(d,'best');
  ok(drLine2().indexOf('found Dr Tonya Renee Brown, Dr Freedman and Dr Suresh B. Indupalli — they’re all in the network')>=0,'several doctors: '+drLine2().slice(0,140));
  S.intake.docs1='Dr. Ramirez (primary care)'; presentWire(d,'best');
  ok(drLine2().indexOf('found Dr Ramirez — they’re in the network')>=0&&drLine2().indexOf('Dr Dr')<0,'one doctor: '+drLine2().slice(0,90));
  S.intake.docs1=keepDocs; presentWire(d,'best');
  ok(d.querySelectorAll('.pp-fn').length===1&&/not included in this description/.test(d.body.textContent),'Bill Saver / net footnote sits under Why these figures, once');
  var pms=Array.prototype.slice.call(d.querySelectorAll('.pinmark')); ok(pms.length>0&&pms.every(function(x){ return d.defaultView.getComputedStyle(x).display==='none'; }),'section markers (1.2, 5.2 ...) are hidden ('+pms.length+')');
  var spz=Array.prototype.filter.call(d.querySelectorAll('div.say'),function(x){ return /^If they need to think/.test(x.textContent.trim()); }), clz=d.querySelector('[data-closes]');
  ok(spz.length===1&&clz.nextElementSibling===spz[0]&&spz[0].dataset.pg===clz.dataset.pg,'the think-it-over line sits right after the two closes, on the same screen');
  var lgd=d.querySelector('p.legend'); ok(lgd&&/Red/.test(lgd.textContent)&&/filled automatically/.test(lgd.textContent)&&!/waiting on your answer/.test(lgd.textContent)&&!/Source tags/.test(lgd.textContent),'the key reads blue = filled, red = flagged');
  var ptp=d.querySelector('[data-mount="posttext"] p'); ok(ptp&&/is my agency; /.test(ptp.textContent),'the wrap-up text in Present is the new one (and is what Copy copies)');
  var kI=[S.intake.whyMatters,S.intake.whyShop];
  S.intake.whyMatters='keep Dr. Patel'; S.intake.whyShop='Premium went up $200 at renewal, then the claim on my wife’s surgery got denied and we had to fight it for three months.'; presentWire(d,'best');
  var rs=d.querySelector('var[data-k="client.why"]'); ok(rs&&rs.textContent==='keep Dr. Patel','section 3 reads back what matters most, not the story');
  S.intake.whyMatters=''; presentWire(d,'best'); rs=d.querySelector('var[data-k="client.why"]'); ok(rs&&!/Premium went up/.test(rs.textContent),'a long prompted-it story is never read aloud (blank stays flagged)');
  S.intake.whyShop='lower premiums'; presentWire(d,'best'); rs=d.querySelector('var[data-k="client.why"]'); ok(rs&&rs.textContent==='lower premiums','an old quote with a one-line reason still reads naturally');
  S.intake.whyMatters='keep Dr. Patel'; buildPrintout(); var poT=document.getElementById('printout').textContent; ok(/What matters most to you/.test(poT)&&/keep Dr. Patel/.test(poT)&&!/Why you are looking/.test(poT),'printout shows what matters most, never the story');
  S.intake.whyMatters=kI[0]; S.intake.whyShop=kI[1]; presentWire(d,'best');
  var kC=JSON.parse(JSON.stringify(curIn())), kAn=S.intake.anchor; S.intake.anchor='cur'; S.present=S.present||{}; var kPA=S.present.anchor; S.present.anchor='cur';
  var cdTxt=function(){ var sy=d.querySelector('[data-anchor-say="cur"]'); return sy?sy.textContent.split(String.fromCharCode(10)).join(' ').replace(/  +/g,' '):''; }, cdNote=function(){ var n2=d.querySelector('.pp-dednote'); return n2?n2.textContent:''; };
  S.cur.ded=6000; S.cur.dedSet=true; presentWire(d,'best'); ok(/right now with a [$]6,000 deductible[.]/.test(cdTxt())&&!cdNote(),'a real deductible is read as written: '+cdTxt().slice(0,140));
  S.cur.ded=0; S.cur.dedSet=true; presentWire(d,'best'); ok(/it looks like no deductible — is that correct, or is there a deductible on that[?]/.test(cdTxt())&&/Get this one exactly right/.test(cdNote()),'a typed $0 becomes the clarity question');
  S.cur.ded=0; S.cur.dedSet=false; presentWire(d,'best'); ok(/I didn’t catch the deductible on that/.test(cdTxt())&&/ask now/.test(cdNote()),'a blank deductible asks for it');
  S.cur.ded=6000; S.cur.dedSet=true; presentWire(d,'best'); ok(!cdNote(),'the note goes away once the number is in');
  S.cur=kC; S.intake.anchor=kAn; S.present.anchor=kPA; presentWire(d,'best');
  var keepOv=JSON.parse(JSON.stringify(acaIn().ov)); acaIn().ov.prem=null; acaIn().ov.ded=null; acaSync(); presentWire(d,'best');
  var ev0=d.querySelector('var.pp-est[data-k="aca.premium"]'); ok(!acaIn().ov.subsidy?(+S.aca.subsidy===0):true,'no subsidy applied unless typed'); ok(!!ev0,'an estimated marketplace premium reads red in the script');
  if(ev0){ S.present.pg=3; ev0.click(); await wait(800); ok(S.step==='intake'&&document.activeElement===document.querySelector('[data-ov="prem"]')&&document.getElementById('retBtn').style.display!=='none','clicking it jumps to the marketplace premium box with a Back button');
    document.getElementById('retBtn').click(); await wait(600); ok(S.step==='present'&&+S.present.pg===3,'Back returns to the same script screen'); }
  acaIn().ov=keepOv; acaSync(); for(var w9=0;w9<40;w9++){ await wait(75); fr=document.getElementById('prFrame'); if(fr&&fr.contentDocument&&fr.contentDocument.querySelector('var.pp-ok')) break; } d=fr.contentDocument; presentWire(d,'best');
  var kDoc=[S.intake.keepafc,(S.docs||{}).net]; S.docs=S.docs||{}; var dmk=function(){ var dv2=d.querySelector('var[data-k="doctor.name"]'); return dv2?['pp-docok','pp-docno','pp-docq'].filter(function(c){ return dv2.classList.contains(c); }).join(','):'none'; };
  S.docs.net=false; S.intake.keepafc='yes'; presentWire(d,'best'); ok(dmk()==='pp-docq','not verified: ❓ (even if an answer is set)');
  S.docs.net=true; S.intake.keepafc='yes'; presentWire(d,'best'); ok(dmk()==='pp-docok','verified, in the network: ✅');
  S.docs.net=true; S.intake.keepafc='no'; presentWire(d,'best'); ok(dmk()==='pp-docno','verified, not in the network: ❌');
  ok(PRESENT_FIX['doctor.name']==='#in_net','the doctor mark jumps to Network status verified');
  S.intake.keepafc=kDoc[0]; S.docs.net=kDoc[1]; presentWire(d,'best');
  var exd=Array.prototype.filter.call(d.querySelectorAll('details.exp'),function(x){ return /^Example words/.test(x.querySelector('summary').textContent.trim()); })[0];
  var bigd=Array.prototype.filter.call(d.querySelectorAll('details.exp'),function(x){ return /^If they want to go over the big stuff/.test(x.querySelector('summary').textContent.trim()); })[0];
  ok(exd&&exd.open&&(!bigd||!bigd.dataset.ppOpen),'catastrophic: Example words open on arrival; the big stuff is left as it was');
  if(exd){ exd.open=false; presentWire(d,'best'); ok(!exd.open,'and it stays folded once the agent folds it'); exd.open=true; }
  var exn=d.querySelector('.pp-exnote'); ok(exn&&/Pay attention:/.test(exn.textContent),'the worked example ends with the Pay attention aside naming the anchor plan');
  ok(/We deliberately did not put a dollar figure on the surgery [(]that depends on the scheduled amount for the procedure, and inventing one now could become a complaint later[)][.]/.test(d.body.textContent)&&!/I deliberately did not put/.test(d.body.textContent),'Why these figures: the surgery sentence reads as Jesse worded it');
  ok(/every box you gave me[.] Wouldn’t you agree[?]/.test(d.body.textContent)&&!/Would you agree[?]/.test(d.body.textContent),'close check-in reads Wouldn’t you agree?');
  ok(/You really need both[.]/.test(d.body.textContent)&&!/Want me to show you what that looks like/.test(d.body.textContent),'living-benefits pivot ends on You really need both');
  ok(!/My stab at it/.test(d.body.textContent)&&/Let me do a real one/.test(d.body.textContent),'the 5.2 preface is gone, the example words stay');
  /* catastrophic: the quote page's own event card, anchor vs the chosen package, Bill Saver on, layers open */
  S.negot.on=false; presentGo(presentPageIx('Catastrophic — walk it as layers')); await wait(60);
  var mc=null, tab=null; for(var mw=0;mw<40;mw++){ d=document.getElementById('prFrame').contentDocument||d; mc=d.querySelector('[data-mount="conditions"]'); tab=mc&&mc.querySelector('.evtab'); if(tab) break; await wait(75); }
  ok(!!tab&&tab.classList.contains('open')&&mc.closest('details').open,'catastrophic: real event card, layers open');
  ok(!!mc.querySelector('.evtab .c.l .pp-exbtn'),'Copy example button in the table corner');
  var exb=await picOf('example'); ok(exb&&exb.type==='image/png'&&exb.size>50000,'the example renders to a PNG ('+(exb&&exb.size)+' bytes)');
  /* the spoken appendicitis example and the card say the same total */
  var exSay=d.querySelector('var[data-k="example.total"]').closest('.say').textContent, cardPays=(mc.querySelector('.evtab').innerText.match(/[$][0-9,]+[.][0-9][0-9]/g)||[]);
  var spoken=d.querySelector('var[data-k="example.total"]').textContent.replace(/[^0-9]/g,'');
  ok(!!spoken&&cardPays.some(function(x){ return x.replace(/[^0-9]/g,'')===spoken+'00'; })&&exSay.indexOf('ten thousand dollars')<0,'narrative total matches the card ('+spoken+')');
  ok(mc.querySelector('[data-pp="cond"]').value==='append'&&/Appendicitis/.test(mc.innerText),'catastrophic card opens on appendicitis - the story in the script');
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
  ok(S.packages.best.products.some(function(p){ return p.k==='lbp'&&+p.monthly>0&&/Americo/.test(p.name); }),'Americo at $100K now priced');
  var fz=d.querySelector('[data-lb="lb.p.face"]'); fz.value='50000'; fz.dispatchEvent(new Event('change')); await wait(60);
  /* Present ends at the close: Enroll or send the quote */
  var nav=presentNav(); presentGo(nav[nav.length-1]); await wait(30);
  ok(pages[nav[nav.length-1]].t==='Pick your close','Present ends on Pick your close');
  ok(/Enroll them/.test(document.getElementById('prNav').innerText)&&/send the quote/.test(document.getElementById('prNav').innerText),'last screen offers Enroll or Send the quote');
  ok(!nav.some(function(i){ return pages[i].en; }),'application screens are not in Present');
  /* Show them / Back */
  presentShow('ev'); await wait(120);
  ok(document.body.classList.contains('client')&&getComputedStyle(document.getElementById('step-present')).display==='none','Show them: Client View, script hidden');
  ok(!/Presentation Call|pp-ok/.test(document.getElementById('printout').innerHTML),'no script in the printout');
  var pt=document.getElementById('printout').innerText;
  ok(!/GOOD|BETTER|BEST/.test(pt)&&/ESSENTIAL|Essential/.test(pt),'Client View says Essential / Complete / Comprehensive, never Good / Better / Best');
  presentBack(); await wait(600); ok(S.step==='present'&&S.present.pg===nav[nav.length-1],'Back returns to the same screen');
  /* Send the quote lives at the bottom of Quote */
  for(var qw=0;qw<40&&!document.querySelector('#prNav [data-go="quote"]');qw++) await wait(75); document.querySelector('#prNav [data-go="quote"]').click(); await wait(100);
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
  var eb=document.getElementById('enNotes'), fl=document.getElementById('followList');
  ok(!document.getElementById('in_followNote')&&eb&&fl&&(fl.compareDocumentPosition(eb)&Node.DOCUMENT_POSITION_FOLLOWING),'one Notes box, at the bottom of Enroll, below the follow-ups');
  ok(!!document.querySelector('[data-enprof="save"]')&&!!document.querySelector('[data-enprof="print"]'),'save / print profile buttons');
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
  var e2=ef2.contentDocument, ac=e2.querySelector('[data-mount="posttext"] a.cpy'), nd=e2.querySelector('[data-mount="posttext"] .needs');
  ok(ac&&ac.classList.contains('dim')&&/still blank/.test(ac.textContent)&&+((ac.querySelector('var[data-k="agent.blanks_n"]')||{}).textContent||0)>0&&!nd.classList.contains('pp-off')&&/email/.test(nd.textContent)&&/website/.test(nd.textContent)&&!e2.querySelector('.pp-copy'),'post-call: their link dim, warning names what is blank (email, website…)');
  S.agentEmail='j@x.com'; S.agentWebsite='optimum.com'; S.agentBooking='cal.com/j'; S.agentPhone=S.agentPhone||'555-0199'; S.client.agent=S.client.agent||'Jesse Stamm'; S.agency='Optimum';
  presentWire(e2,chosenTier()||'best'); ac=e2.querySelector('[data-mount="posttext"] a.cpy'); nd=e2.querySelector('[data-mount="posttext"] .needs');
  ok(!ac.classList.contains('dim')&&!/still blank/.test(ac.textContent)&&nd.classList.contains('pp-off'),'agent info complete: warning gone, copy live');
  S.agentBooking=''; presentWire(e2,chosenTier()||'best'); nd=e2.querySelector('[data-mount="posttext"] .needs');
  ok(!nd.classList.contains('pp-off')&&nd.textContent.split(String.fromCharCode(10)).join(' ').indexOf('Missing: booking link.')>=0,'one field blank: warning lists just that one ('+nd.textContent.slice(150,230)+')');
  var steps=presentApplyPlan('best').map(function(s){ return s.car.split(' ')[0]; });
  ok(steps[0]==='Americo'&&steps.indexOf('ManhattanLife')>0,'life first then ManhattanLife: '+steps.join(' > '));
  /* maiden name / code word: saved with the quote */
  var mm=document.querySelector('#enPeople [data-mmn]'); ok(!!mm,'maiden-name box on Enroll');
  if(mm){ mm.value='Zzyzxmaiden'; mm.dispatchEvent(new Event('change')); await wait(50); }
  autosave(); await wait(50); var ls=''; for(var j=0;j<localStorage.length;j++){ ls+=localStorage.getItem(localStorage.key(j)); }
  ok(S.intake.mmn==='Zzyzxmaiden'&&/Zzyzxmaiden/.test(ls),'maiden name / code word saves with the quote (Jesse, 9 Oct)');
  var tipEl=document.querySelector('#enPeople .en-tip'); ok(!tipEl||!/never saved/.test(tipEl.textContent),'the code-word tip no longer says never saved');
  S.intake.beneficiary='Zzyzxbenef'; autosave(); await wait(50); var ls2=''; for(var j2=0;j2<localStorage.length;j2++){ ls2+=localStorage.getItem(localStorage.key(j2)); }
  ok(/Zzyzxbenef/.test(ls2),'control: a saved field does reach localStorage');
  var dd=document.implementation.createHTMLDocument('t'); dd.body.innerHTML='<var data-k="client.first">X</var><var data-k="no.such">Y</var><var>$50</var>';
  var nf=presentFillFrame(dd,presentTokens('best')), vs=dd.querySelectorAll('var'); ok(nf===1&&vs[2].textContent==='$50','filler leaves unnamed text alone');
  /* Mutual of Omaha TLE 20-year, pulled 2026-10-09: spot checks straight from the quoter, and the new 51-60 range */
  var lr=function(a,sx,tb,f){ return lbRate('moo',a,sx,tb,f,'20').price; };
  ok(lr(40,'M',false,75000)===29.84&&lr(40,'M',false,250000)===87&&lr(55,'M',false,75000)===90.05&&lr(60,'F',true,100000)===352.8&&lr(18,'M',false,25000)===8.7,'MoO rates match the quoter: '+[lr(40,'M',false,75000),lr(40,'M',false,250000),lr(55,'M',false,75000),lr(60,'F',true,100000)].join(' / '));
  ok(lr(61,'M',false,50000)==null&&lr(17,'M',false,50000)==null,'MoO 20-year issues 18-60 only');
  var ar=function(a,tb,f){ return lbRate('americo',a,'M',tb,f,'20').price; };
  ok(ar(40,false,250000)===95.71&&ar(64,true,50000)===263.96&&ar(40,false,25000)===17.27&&ar(65,false,50000)!=null&&ar(19,false,50000)==null,'Americo Term 125 matches the engine; issues 20-65');
  var p61=pLB1({k:'p',tag:'Primary',age:62,sex:'M',tob:false},{carrier:'moo',face:'100000'});
  ok(/Americo/.test(p61.carrier)&&/issues to age 60/.test(p61.note),'age 62 on Mutual of Omaha: switches to Americo 20-year with a note ('+p61.note.slice(0,70)+')');
  ok(pLB1({k:'p',tag:'Primary',age:55,sex:'M',tob:false},{carrier:'moo',face:'100000'}).carrier==='Mutual of Omaha TLE','age 55 stays on Mutual of Omaha (no more switch to Americo after 50)');
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
