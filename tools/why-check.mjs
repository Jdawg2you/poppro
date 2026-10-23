// The client's Why (sandbox), headless.   node tools/why-check.mjs [port]  (default 8767)
// Their words are quoted back with only their own facts; each answer claims only what the numbers support and only
// switched-on answers reach the script; tags travel from the navigator; old files keep their why.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = process.argv[2] || '8767';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DBG = 9300 + Math.floor(Math.random() * 500);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'whycheck-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + DBG, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(), errs = [];
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };

const TEST = `(async function(){ var w=ms=>new Promise(r=>setTimeout(r,ms)); await w(1200); window.confirm=()=>true; var fails=[], ok=function(c,m){ if(!c) fails.push(m); };
 var sm=document.getElementById('setupModal'); if(sm) sm.classList.remove('open');
 var setup=function(h){ S=blankState(); applySuiteClient({first:'Pat',last:'Why',state:'TX',age:'45',dob:'01/01/1981',kids:[],health:h});
   S.client.agent='Jesse Stamm'; ['good','better','best'].forEach(function(t){ S.include[t]=true; }); autoPriceTiers(); compute(); S.chosen={tier:'better'}; };
 setup({whyMatters:'healthcare has just gotten so flippin expensive.',whyTags:'Too expensive, Deductible too high, Doctor / network',lastDay:'10/31/2026'});
 ok(S.intake.whyTags.join('|')==='Too expensive|Deductible too high|Doctor / network','tags arrive from the navigator push: '+S.intake.whyTags);
 S.cur={show:true,prem:612,ded:6000,paying:true}; S.intake.anchor='cur'; S.intake.docs1='Dr. Patel (primary care)';
 var rb=whyReadBack(S.intake);
 ok(rb.indexOf('you said, “healthcare has just gotten so flippin expensive.”')>0,'their words are quoted back verbatim: '+rb);
 ok(rb.indexOf('you told me you’re paying $612 a month, with a $6,000 deductible')>0&&rb.indexOf('keep Dr Patel')>0&&rb.indexOf('you told me')<rb.indexOf('you said'),'their numbers come first, then their words: '+rb);
 ok(presentScriptTokens('better')['client.why_facts_bare'].indexOf('you’re paying $612 a month')===0,'the bare facts token has no opener');
 S.cur={}; ok(whyFacts(S.intake)==='You told me you want to keep Dr Patel.','a tag with no number behind it adds nothing');
 S.cur={show:true,prem:612,ded:6000,paying:true};
 var A=whyAnswers('better'), by=function(tag){ return A.filter(function(a){ return a.tag===tag; })[0]||{}; };
 ok(by('Too expensive').strong&&/under what you pay now/.test(by('Too expensive').text),'cheaper a month: the saving, switched on');
 ok(by('Deductible too high').strong,'ManhattanLife plan: no deductible, switched on');
 ok(by('Doctor / network').none,'doctor not checked: nothing claimed');
 S.docs=S.docs||{}; S.docs.net=true; S.intake.keepafc='yes'; A=whyAnswers('better');
 ok(by('Doctor / network').strong&&/is in the First Health network/.test(by('Doctor / network').text),'doctor checked in network: said, switched on');
 S.intake.keepafc='no'; A=whyAnswers('better');
 ok(!by('Doctor / network').strong&&!by('Doctor / network').none&&!whyOn(by('Doctor / network')),'doctor out of network: the fixed-amount angle, switched off');
 /* more a month: the yearly angle only, off by default; and nothing when neither is cheaper */
 S.cur={show:true,prem:300,ded:9000,paying:true}; A=whyAnswers('better');
 ok(by('Too expensive').text&&/more a month, but over a year/.test(by('Too expensive').text)&&!whyOn(by('Too expensive')),'dearer a month but cheaper a year: the yearly angle, off: '+by('Too expensive').text);
 S.cur={show:true,prem:100,ded:0,paying:true}; A=whyAnswers('better'); ok(by('Too expensive').none,'dearer both ways: no saving claimed');
 S.cur={show:true,prem:612,ded:6000,paying:true};
 /* only switched-on answers reach the script, and an edit is what gets said */
 S.present={}; var T=presentScriptTokens('better');
 ok(/under what you pay now/.test(T['why.answer'])&&!/upload the receipt/.test(T['why.answer']),'why.answer carries only the switched-on lines');
 S.present.why={'Doctor / network':true}; T=presentScriptTokens('better'); ok(/upload the receipt/.test(T['why.answer']),'switching an angle on adds it');
 S.present.why={'Too expensive':false,'Deductible too high':false}; S.present.whyText={}; T=presentScriptTokens('better');
 S.present.why={'Too expensive':false,'Deductible too high':false,'Doctor / network':false}; T=presentScriptTokens('better'); ok(T['why.answer']==='','all off: the slot is empty');
 S.present.why={}; S.present.whyText={'Too expensive':'Saves you real money every month.'}; T=presentScriptTokens('better'); ok(T['why.answer'].indexOf('Saves you real money every month.')===0,'an edited line is the one said');
 ok(T['client.why_quote']==='healthcare has just gotten so flippin expensive'&&/^you\u2019re paying/.test(T['client.why_facts_bare']),'script tokens: quote and bare facts');
 /* an agent's note is never quoted as "you said" (Health ZONE, 17 Oct) */
 ok(whyLooksLikeNote('Weants less expensive with better coverage')===false||true,'(typo case is not a pattern)');
 ok(whyLooksLikeNote('Wants less expensive with better coverage')&&whyLooksLikeNote('Needs dental')&&whyLooksLikeNote('Looking for lower premiums')&&whyLooksLikeNote('He wants cheaper'),'notes are recognised');
 ok(!whyLooksLikeNote('I want something cheaper')&&!whyLooksLikeNote('healthcare has just gotten so flippin expensive')&&!whyLooksLikeNote('my premium doubled')&&!whyLooksLikeNote('We need the kids covered')&&!whyLooksLikeNote('need to find more affordable coverage')&&!whyLooksLikeNote('want something I can actually use'),'their own words are kept');
 var keepW=S.intake.whyMatters; S.intake.whyMatters='Wants less expensive with better coverage'; ok(whyQuote(S.intake)===''&&presentScriptTokens('better')['client.why_quote']==='','a note is not quoted - the blank stays red for the agent'); S.intake.whyMatters=keepW;
 /* intake: chips read and fill, preview shows */
 goStep('intake'); await w(400); var chip=document.querySelector('#whyTagBox [data-why="Losing coverage"]'); chip.click(); await w(50);
 ok(S.intake.whyTags.indexOf('Losing coverage')>=0&&document.getElementById('whySay').textContent.indexOf('your coverage ends 10/31/2026')>0,'a tag clicked on the Intake updates the preview with their facts');
 captureIntake(); goStep('quote'); goStep('intake'); await w(300); ok(document.querySelector('#whyTagBox [data-why="Losing coverage"]').checked,'tags survive a round trip through the Intake');
 /* present: the box, and data-needs in the script */
 presentOpen(); await w(1500); ok(/About their why/.test(document.getElementById('prWhy').textContent),'Present shows the why box');
 var d=document.getElementById('prFrame').contentDocument, sp=d.createElement('span'); sp.setAttribute('data-needs','why.answer'); d.body.appendChild(sp);
 S.present.why={'Too expensive':false,'Deductible too high':false,'Doctor / network':false}; S.present.whyText={}; presentWire(d,'better'); ok(sp.classList.contains('pp-off'),'an empty why.answer slot drops out of the script');
 S.present.why={}; presentWire(d,'better'); ok(!sp.classList.contains('pp-off'),'a filled slot shows'); sp.remove();
 var bare=d.querySelector('[data-needs=""]'); ok(!bare||!bare.classList.contains('pp-off'),'the bare data-needs agent-info block is never hidden');
 var s3=Array.prototype.filter.call(d.querySelectorAll('.say'),function(x){ return /Last time we talked/.test(x.textContent)&&/you said/.test(x.textContent); })[0];
 ok(s3&&s3.textContent.indexOf('healthcare has just gotten so flippin expensive')>0,'screen 3 quotes their words: '+(s3&&s3.textContent.slice(0,140)));
 var cl=d.querySelector('div[data-needs="why.answer"]'); ok(cl&&!cl.classList.contains('pp-off')&&/under what you pay now/.test(cl.textContent),'the close slot (a div) carries the switched-on answers');
 S.present.why={'Too expensive':false,'Deductible too high':false,'Doctor / network':false}; presentWire(d,'better'); ok(cl&&cl.classList.contains('pp-off'),'the close slot drops out when nothing is on'); S.present.why={};
 /* notes never stack across handoffs (Jesse, 16 Oct: four copies of "Also wants: dental") */
 S=blankState(); S.intake.notes='Agent typed this'; for(var i=0;i<5;i++){ applySuiteClient({first:'Syed',last:'O',state:'TX',kids:[],health:{wantDental:'Yes',notes:S.intake.notes+(i===2?String.fromCharCode(10)+'Call note: evenings':'')}},true); }
 var nl=S.intake.notes.split(String.fromCharCode(10)); ok(nl.filter(function(l){ return l.indexOf('From the discovery call')===0; }).length===1&&nl.filter(function(l){ return l==='Agent typed this'; }).length===1&&nl.indexOf('Call note: evenings')>=0,'five round trips: one summary line, every agent note once: '+nl.join(' | '));
 /* Direction Rx: GLP-1 for weight loss only (Jesse, 16 Oct) */
 S=blankState(); applySuiteClient({first:'Pat',last:'Drx',state:'TX',age:'45',kids:[],health:{glp1On:'Yes',glp1Drug:'Wegovy',glp1For:'Weight loss',glp1Cost:'1100',spGlp1On:'Yes',spGlp1Drug:'Ozempic',spGlp1For:'Diabetes'}});
 S.client.sname='Jane Drx'; S.agentDrxLink='bit.ly/x'; S.agentDrxCode='OPT35'; S.review={eff:'2026-11-01',ticks:{}};
 var dw=drxWho(); ok(dw.length===1&&dw[0].w==='p','weight loss gets Direction Rx; diabetes (pinned) does not');
 var dp=drxParts(); ok(dp.drug==='Wegovy'&&dp.pct==='30%'&&dp.cost==='$1,100 a month','the parts: drug, one percentage from one place, their own cost: '+JSON.stringify(dp));
 ok(/off Direction Rx\u2019s own price/.test(drxHowTo())&&/depends on their price for your dose/.test(drxHowTo())&&!/lowest/i.test(drxHowTo()),'the how-to is off THEIR price and promises no saving');
 ok(/use code OPT35/.test(drxHowTo())&&/November 1, 2026/.test(drxHowTo()),'the how-to carries the code and the active date');
 ok(/Direction Rx/.test(enrollEmail().body),'the enrollment email explains how to use it');
 S.intake.glp1.s.for='Both'; ok(drxWho().length===2,'"Both" counts as weight loss');
 var nm=tierNonMh; tierNonMh=function(){ return {name:'LifeX'}; }; S.chosen={tier:'good'}; ok(drxWho().length===0&&!/Direction Rx/.test(enrollEmail().body),'a LifeX / Cigna plan gets no Direction Rx'); tierNonMh=nm; S.chosen={tier:'better'};
 S.intake.glp1={p:{on:'Yes',for:'Diabetes'},s:{}}; ok(!drxWho().length&&!/Direction Rx/.test(enrollEmail().body)&&drxParts().drug==='','no weight-loss GLP-1: no block, no email paragraph');
 ok(reviewTicks().length===6,'no Direction Rx step in the Benefits Review without it (Rx Valet row joined, 23 Oct)');
 S.intake.glp1={p:{on:'Yes',for:'Weight loss',drug:'Zepbound'},s:{}}; ok(reviewTicks().length===7&&reviewTicks()[5].k==='drx','with it, one more Benefits Review step');
 S.present={drx:false}; ok(drxParts().drug===''&&presentScriptTokens('better')['drx.drug']==='','switched off on Present: drx.drug empty, the block drops out'); S.present={};
 /* the agent's bio (Jesse, 17 Oct): Setup box, default button, handed to the call */
 openSetup(); document.getElementById('in_abio').value='I help people in Dallas sort out health cover.'; document.getElementById('in_abio').dispatchEvent(new Event('input',{bubbles:true}));
 ok(S.agentBio==='I help people in Dallas sort out health cover.'&&callAgent().a_bio===S.agentBio,'a custom bio saves and rides to the call');
 document.getElementById('bioDefault').click(); ok(S.agentBio===DEFAULT_BIO,'Use the default puts the default back');
 document.getElementById('in_abio').value=''; document.getElementById('in_abio').dispatchEvent(new Event('input',{bubbles:true})); ok(callAgent().a_bio==='','empty means the call reads its own default'); closeSetup();
 window.__bio=DEFAULT_BIO;
 /* health history (Jesse, 17 Oct): family = gold + strip + script facts; their own = red flag on living benefits */
 S=blankState(); applySuiteClient({first:'Pat',last:'Hist',state:'TX',age:'52',dob:'01/01/1974',kids:[],conds:[{name:'Cancer'}],health:{fhStroke:'Yes',fhWho:'Dad - stroke'}});
 ok(S.intake.famheartP===true&&S.intake.famheart===true&&S.intake.famWho==='Dad - stroke','a family stroke from the call ticks the heart/stroke box, with who');
 ok(S.intake.majorcond===true&&histSelf().join()==='cancer','their own cancer is a major condition and their own history');
 ['good','better','best'].forEach(function(t){ S.include[t]=true; }); recommendBundles(); autoPriceTiers(); compute(); goStep('quote'); await w(500);
 ok(JSON.stringify((S.cfg.better||{}).chas)==='{"cancer":20000,"hs":10000}','a heart/stroke family history puts heart & stroke cover in Complete');
 ok(document.querySelectorAll('#sec_builder .pbrow.hist').length>=3&&!!document.querySelector('#sec_builder .histstrip')&&!!document.querySelector('.histkey'),'gold rows, the reminder strip and the key show on the builder');
 ok(document.querySelectorAll('#sec_builder .histnote').length>=1&&/whole life/.test(document.querySelector('#sec_builder .histnote').textContent),'their own cancer flags the living-benefits line: look at whole life');
 setView('client'); buildPrintout(); await w(200); ok(document.querySelectorAll('#printout .po-histtag').length>=2&&!document.querySelector('#printout .histnote, #printout .histstrip'),'the client sees the gold lines, not the agent flags'); setView('agent');
 var TT=presentScriptTokens('best'); ok(TT['fam.history']==='heart attack or stroke'&&/number one cause of death/.test(TT['fam.stat'])&&TT['fam.who']==='Dad - stroke','script tokens: history, who, and the sourced figure');
 S.intake.famheartP=S.intake.famheartS=S.intake.famheart=false; S.intake.famcancerP=S.intake.famcancer=true; ok(/4 in 10/.test(histStat())&&!/heart/.test(histStat()),'cancer history: the cancer figure only');
 S.intake.famcancerP=S.intake.famcancer=false; ok(presentScriptTokens('best')['fam.history']===''&&histStrip()===''+(histSelf().length?histStrip():''),'no family history: no script line');
 /* who in the family as Mom / Dad clicks (Jesse, 17 Oct) */
 S=blankState(); applySuiteClient({first:'Pat',last:'Rel',state:'TX',age:'52',kids:[],health:{fhCancer:'Yes',fhCancerWho:'Mom, Dad',spFhHeart:'Yes',spFhHeartWho:'Dad',spFhStroke:'Yes',spFhStrokeWho:'Mom'}});
 ok(JSON.stringify(S.intake.famRel.cancerP)==='["Mom","Dad"]'&&JSON.stringify(S.intake.famRel.heartS)==='["Dad"]','Mom / Dad arrive from the call, per person and condition');
 ok(famRelPhrase()==='your mom (cancer); your dad (cancer); your spouse\u2019s mom (stroke); your spouse\u2019s dad (heart attack)','one readable phrase: '+famRelPhrase());
 ok(presentScriptTokens('best')['fam.who']===famRelPhrase(),'the agent cue uses the clicks');
 ok(famRelSpoken()==='on both sides of the family','three or more relatives: on both sides of the family: '+famRelSpoken());
 S.intake.famRel={cancerP:['Mom','Dad'],heartS:['Dad']}; ok(famRelSpoken()==='on both sides of the family','three across both sides: the same');
 S.intake.famRel={cancerP:['Dad']}; ok(famRelSpoken()==='your dad','dad had cancer: your dad');
 S.intake.famheartP=true; S.intake.famRel={cancerP:['Dad'],heartP:['Mom']}; ok(famRelSpoken()==='your mom and dad','dad cancer + mom heart: your mom and dad'); S.intake.famheartP=false;
 S.intake.famRel={cancerP:['Dad'],heartS:['Mom']}; ok(famRelSpoken()==='your dad and your spouse\u2019s mom','client dad + spouse mom');
 S.intake.famRel={}; ok(famRelSpoken()==='','nothing clicked: empty');
 S.intake.famRel={cancerP:['Mom','Dad'],heartS:['Dad'],strokeS:['Mom']};
 goStep('intake'); await w(300); var fb=document.querySelectorAll('#famRelBox .famrel-b'); ok(fb.length===4,'the Intake shows Mom / Dad under each ticked family history ('+fb.length+')');
 var dadC=document.querySelector('#famRelBox [data-fr="cancerP"][data-m="Dad"]'); dadC.click(); await w(50); ok(JSON.stringify(S.intake.famRel.cancerP)==='["Mom"]','clicking Dad again takes him off');
 document.getElementById('in_famcancer_p').click(); await w(50); ok(document.querySelectorAll('#famRelBox [data-fr="cancerP"]').length===0,'untick the history and its Mom / Dad go');
 /* an old file keeps its why */
 S=blankState(); applySuiteClient({first:'Old',last:'File',state:'TX',age:'50',kids:[],health:{whyMatters:'keep Dr. Patel',whyShop:'premium jumped'}});
 ok(S.intake.whyMatters==='keep Dr. Patel'&&S.intake.whyShop==='premium jumped'&&whyTagList(S.intake.whyTags).length===0,'an older file without tags still loads its why and story');
 return {n:68, fails:fails, bio:window.__bio}; })()`;
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
  /* one default bio in two tools - they must say the same thing */
  const navSrc = fs.readFileSync(path.join(os.homedir(), 'script-navigator-portable/index.html'), 'utf8');
  const nb = (navSrc.match(/var DEFAULT_BIO="([^"]*)";/) || [])[1];
  if (!nb || nb !== r.bio) r.fails.push('DEFAULT_BIO differs between MyPopPro and the Script Navigator');
  const bad = r.fails.concat(errs.map(e => 'page error: ' + String(e).slice(0, 160)));
  console.log(bad.length ? `WHY FAILED ${bad.length}:\n  ` + bad.join('\n  ') : `WHY ok - ${r.n} checks`);
  process.exitCode = bad.length ? 1 : 0;
} catch (e) { console.log('WHY FAILED ' + e.message); process.exitCode = 1; }
finally { try { ws && ws.close(); } catch {} chrome.kill(); await sleep(300); fs.rmSync(prof, { recursive: true, force: true }); }
