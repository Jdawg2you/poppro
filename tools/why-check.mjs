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
 ok(rb.indexOf('You told me you’re paying $612 a month, with a $6,000 deductible')>0&&rb.indexOf('keep Dr Patel')>0,'their own facts follow: '+rb);
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
 ok(T['client.why_quote']==='healthcare has just gotten so flippin expensive'&&/^You told me/.test(T['client.why_facts']),'script tokens: quote and facts');
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
 var s3=Array.prototype.filter.call(d.querySelectorAll('.say'),function(x){ return /Last time we talked, you said/.test(x.textContent); })[0];
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
 ok(reviewTicks().length===4,'no Direction Rx step in the Benefits Review without it');
 S.intake.glp1={p:{on:'Yes',for:'Weight loss',drug:'Zepbound'},s:{}}; ok(reviewTicks().length===5&&reviewTicks()[4].k==='drx','with it, a fifth Benefits Review step');
 S.present={drx:false}; ok(drxParts().drug===''&&presentScriptTokens('better')['drx.drug']==='','switched off on Present: drx.drug empty, the block drops out'); S.present={};
 /* an old file keeps its why */
 S=blankState(); applySuiteClient({first:'Old',last:'File',state:'TX',age:'50',kids:[],health:{whyMatters:'keep Dr. Patel',whyShop:'premium jumped'}});
 ok(S.intake.whyMatters==='keep Dr. Patel'&&S.intake.whyShop==='premium jumped'&&whyTagList(S.intake.whyTags).length===0,'an older file without tags still loads its why and story');
 return {n:39, fails:fails}; })()`;
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
  console.log(bad.length ? `WHY FAILED ${bad.length}:\n  ` + bad.join('\n  ') : `WHY ok - ${r.n} checks`);
  process.exitCode = bad.length ? 1 : 0;
} catch (e) { console.log('WHY FAILED ' + e.message); process.exitCode = 1; }
finally { try { ws && ws.close(); } catch {} chrome.kill(); await sleep(300); fs.rmSync(prof, { recursive: true, force: true }); }
