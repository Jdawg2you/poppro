// The two example cards on the Quote step, driven in headless Chrome against a local preview.
//   node tools/event-check.mjs [port]     (default 8766)
// Checks: both cards carry identical controls; every scenario in both cards renders a table for three
// Manhattan packages with payouts Essential <= Complete <= Comprehensive; an add-on raises the bill and the
// payout and keeps the scenario; the Bill Saver master drives both cards and a Client View card toggle
// changes only that card; an old save (big/reg) loads with the same "you pay" figures the old engine gave.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = process.argv[2] || '8766';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DBG = 9300 + Math.floor(Math.random() * 500);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'evcheck-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + DBG, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(), errs = [];
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };

const TEST = `(async function(){
  var fails=[], ok=function(c,m){ if(!c) fails.push(m); }, wait=function(ms){ return new Promise(function(r){ setTimeout(r,ms); }); };
  window.confirm=function(){ return true; }; window.alert=function(){};
  S=blankState(); applySuiteClient({first:'Ev',last:'Check',state:'TX',age:'45',dob:'01/01/1981',kids:[],health:{}});
  ['good','better','best'].forEach(function(t){ S.include[t]=true; }); autoPriceTiers(); compute(); goStep('quote'); await wait(600);
  ok(evIncluded().length===3, 'three packages priced (' + evIncluded().length + ')');

  /* identical controls */
  var ctl=function(i){ return Array.prototype.map.call(document.querySelectorAll('#ev'+i+'_editor [data-f]'),function(e){ return e.dataset.f; }).sort().join(','); };
  ok(ctl(0)&&ctl(0)===ctl(1), 'both cards carry the same controls');
  ok(document.querySelectorAll('#ev0_editor [data-f=preset] option').length===12&&document.querySelectorAll('#ev1_editor [data-f=preset] option').length===12, 'both dropdowns: 11 scenarios + Custom');

  /* every scenario in both cards */
  var n=0;
  for(var i=0;i<2;i++) for(var k=0;k<EV_SCENARIOS.length;k++){ var id=EV_SCENARIOS[k].id; evApplyPreset(i,id); await wait(30);
    var out=document.getElementById('evOut'+i), tab=out&&out.querySelector('.evtab');
    ok(tab&&/You pay/.test(out.innerText), 'card '+(i+1)+' '+id+' renders a table');
    var p=['good','better','best'].map(function(t){ return evEvent(S.ev[i],evTierPack(t)).pays; });
    ok(p[0]<=p[1]+0.01&&p[1]<=p[2]+0.01, 'card '+(i+1)+' '+id+' pays step up: '+p.join(' / '));
    ok(S.ev[i].preset===id, 'card '+(i+1)+' keeps scenario '+id); n++; }

  /* an add-on raises the bill and the payout and keeps the scenario */
  evApplyPreset(1,'urgent'); await wait(30);
  var b0=evScnBill(S.ev[1]).total, p0=evEvent(S.ev[1],evTierPack('best')).pays, inp=document.querySelector('#ev1_editor [data-f="add.visit.n"]');
  inp.value='2'; inp.dispatchEvent(new Event('input',{bubbles:true})); await wait(60);
  var b1=evScnBill(S.ev[1]).total, p1=evEvent(S.ev[1],evTierPack('best')).pays;
  ok(b1===b0+250&&p1>p0&&S.ev[1].preset==='urgent', 'add-on: +2 doctor visits adds $250 and visit benefits, scenario kept ('+b0+'->'+b1+', '+p0+'->'+p1+', '+S.ev[1].preset+')');
  ok(/2 doctor visits at \\$125/.test(document.getElementById('evOut1').innerText), 'the card describes the add-on');

  /* Bill Saver: one master, per-card on Client View */
  evApplyPreset(0,'hosp'); evApplyPreset(1,'heart'); await wait(30);
  $('neg_pct').value='40'; $('neg_pct').dispatchEvent(new Event('input')); $('neg_on').checked=true; $('neg_on').dispatchEvent(new Event('change')); await wait(60);
  var bill=function(i){ return evScnBill(S.ev[i]).total; };
  ok(negApplies(0,bill(0))&&negApplies(1,bill(1)), 'master on: Bill Saver applies to both cards');
  setView('client'); buildPrintout(); await wait(60);
  var btn=document.querySelector('#printout [data-negtog="1"]'); ok(!!btn&&!!document.querySelector('#printout [data-negtog="0"]'), 'Client View shows an On/Off button on each card');
  if(btn){ btn.click(); await wait(60); }
  ok(negApplies(0,bill(0))&&!negApplies(1,bill(1)), 'Client View toggle on card 2 turns off card 2 only');
  setView('agent'); await wait(30);
  $('neg_on').checked=false; $('neg_on').dispatchEvent(new Event('change')); await wait(30);
  ok(!negApplies(0,bill(0))&&!negApplies(1,bill(1)), 'master off: neither card');
  $('neg_on').checked=true; $('neg_on').dispatchEvent(new Event('change')); await wait(30);
  ok(negApplies(0,bill(0))&&negApplies(1,bill(1)), 'master back on resets the per-card choices: both cards');

  /* a quote with nothing in either card still prints */
  var keepEv=JSON.stringify(S.ev); S.ev=[evScn(''),evScn('')]; var perr=null; try{ setView('client'); buildPrintout(); }catch(e){ perr=e.message; } setView('agent');
  ok(!perr&&!document.querySelector('#printout .po-event'), 'empty examples: the printout builds without them'+(perr?' ('+perr+')':''));
  S.ev=JSON.parse(keepEv);
  /* an old save keeps its numbers */
  var raw={client:{pname:'Old Save',state:'TX',page:'45',age:'45'},intake:{who:{app:true}},
    big:{desc:'Hospital stay — national average',charge:69847,disc:41809,days:5,er:1,amb:0,acc:0,dx:'',preset:'hosp',src:'x'},
    reg:{desc:'Outpatient knee surgery',type:'osurg',count:1,charge:7595,acc:0,preset:'knee',src:'y'},
    negot:{on:true,onEvery:false,pct:40,min:2500}};
  var oldNet=['good','better','best'].map(function(t){ var o=evTierPack(t); return [
     evMajor({bal:28038,days:5,er:1,amb:0,acc:0,dx:'',afc:o.afc,his:o.his,gap:o.gap,accU:o.accU,chas:o.chas,major:o.major,negotPct:40}).net,
     evEveryday({type:'osurg',charge:7595,count:1,afc:o.afc,hisOutp:o.hisOutp,gapOutp:o.gapOutp,acc:0,accU:o.accU,gapEa:o.gap&&o.gap.ea,major:o.major,negotPct:0}).net]; });
  var keepPk=JSON.stringify(S.packages), keepCfg=JSON.stringify(S.cfg);
  S=deepMerge(blankState(),raw); migrateEvents(raw); S.packages=JSON.parse(keepPk); S.cfg=JSON.parse(keepCfg); S.client.state='TX'; S.client.page='45';
  ok(!('big' in S)&&!('reg' in S)&&S.ev.length===2, 'old save converted to two cards');
  ok(S.negot.on===true&&S.negot.cards[1]===false&&S.negot.cards[0]!==false, 'old save: Bill Saver stays on the first card and off the second');
  var newNet=['good','better','best'].map(function(t){ var o=evTierPack(t); return [0,1].map(function(i){ return evEvent(S.ev[i],Object.assign({},o,{negotPct:negApplies(i,evScnBill(S.ev[i]).total)?S.negot.pct:0})).net; }); });
  var same=oldNet.every(function(r,ti){ return Math.abs(r[0]-newNet[ti][0])<0.01&&Math.abs(r[1]-newNet[ti][1])<0.01; });
  ok(same, 'old save: same "you pay" per package as before '+JSON.stringify(oldNet)+' vs '+JSON.stringify(newNet));
  return {n:n, fails:fails};
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
  console.log(bad.length ? `EVENTS UI FAILED ${bad.length}:\n  ` + bad.join('\n  ') : `EVENTS UI ok scenarios=${r.n} (11 per card)`);
  process.exitCode = bad.length ? 1 : 0;
} catch (e) { console.log('EVENTS UI FAILED ' + e.message); process.exitCode = 1; }
finally { try { ws && ws.close(); } catch {} chrome.kill(); await sleep(300); fs.rmSync(prof, { recursive: true, force: true }); }
