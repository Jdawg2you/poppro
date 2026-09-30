// Post-ship checks against the LIVE sites, in a throwaway Chrome profile (no real data touched).
//   node tools/live-check.mjs files   mypoppro.com serves exactly ~/Documents/poppro's page and data
//   node tools/live-check.mjs nav     script.ffloptimum.com serves exactly ~/script-navigator/index.html
//   node tools/live-check.mjs push    a real push: live navigator -> live POP Pro, acknowledged, fields land, no page errors
//   node tools/live-check.mjs dvh [base]  every state: DVH priced only from its own table, else 'not sold'/'not loaded' (base defaults to live)
//   node tools/live-check.mjs load    live Load Quote of a navigator profile file keeps the agent's details across a refresh; pill present
// Note: each run is a real page view on both sites' analytics.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MODE = process.argv[2] || 'files';
const POP = 'https://mypoppro.com', NAV = 'https://script.ffloptimum.com';
const HOME = os.homedir();
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const bust = () => '?live=' + Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function same(url, file) {
  const r = await fetch(url + bust(), { cache: 'no-store' });
  const live = Buffer.from(await r.arrayBuffer()), local = fs.readFileSync(file);
  const ok = r.ok && sha(live) === sha(local);
  console.log(`${ok ? 'same ' : 'DIFF '} ${url}  (live ${r.status} ${live.length}b, local ${local.length}b)`);
  return ok;
}

if (MODE === 'files') {
  const P = path.join(HOME, 'Documents/poppro');
  const pairs = [[`${POP}/tool/index.html`, 'tool/index.html'], [`${POP}/tool/benefits/lb.json`, 'tool/benefits/lb.json'], [`${POP}/tool/rates/portal-rates.json`, 'tool/rates/portal-rates.json']];
  let n = 0; for (const [u, f] of pairs) if (await same(u, path.join(P, f))) n++;
  console.log(n === pairs.length ? `LIVE FILES MATCH ${n}/${pairs.length}` : `LIVE FILES DIFFER ${n}/${pairs.length}`);
  process.exit(n === pairs.length ? 0 : 1);
}
if (MODE === 'nav') {
  const ok = await same(`${NAV}/index.html`, path.join(HOME, 'script-navigator/index.html'));
  console.log(ok ? 'LIVE NAV MATCHES' : 'LIVE NAV DIFFERS'); process.exit(ok ? 0 : 1);
}

/* ---- push: the real thing, button to acknowledgement ---- */
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DBG = 9300 + Math.floor(Math.random() * 500);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'livecheck-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-popup-blocking', '--remote-debugging-port=' + DBG, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });

function tab(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(), errs = [];
  ws.addEventListener('message', m => { const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    if (d.method === 'Runtime.exceptionThrown') errs.push('exception: ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).slice(0, 160));
    if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/favicon|goatcounter|gc\.zgo/i.test(d.params.entry.url || d.params.entry.text)) errs.push('console: ' + (d.params.entry.text + ' ' + (d.params.entry.url || '')).slice(0, 160));
  });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
  return { open: new Promise(r => ws.addEventListener('open', r)), send, ev, errs, close: () => ws.close() };
}
const list = () => fetch(`http://127.0.0.1:${DBG}/json/list`).then(r => r.json());

/* A fictional client (555-01xx is the reserved fictional range). */
const CLIENT = `({first:'Livecheck',last:'Probe',dob:'07/03/1981',age:'45',sex:'Female',phone:'5550100199',email:'livecheck@example.com',
  state:'FL',zip:'33101',married:'Married',sp_name:'Sam',sp_age:'46',kids:'2',why_note:'Live ship check - premium went up at renewal',
  losing:'Yes',last_day:'12/31/2026',cur_carrier:'Florida Blue',cur_plan:'Bronze',cur_prem:'150',cur_ded:'7000',cur_oop:'9000',cur_copay:'60',
  cur_visits:'8',cur_is_aca:'Yes',cur_subsidy:'300',has_hsa:'Yes',pregnant:'Yes',want_dental:'Yes',hosp_stay:'Yes',stay_what:'Kidney stones',
  recent_stay:'Yes',recent_what:'Knee scope',next_same:'Different',income_next:'52000',income_this:'60000',hh_income:'60000',
  appt_date:'10/02/2026',appt_time:'6pm',appt_who:'Sam',emp_offer:'Yes',bank_kind:'Credit union',bill_tomorrow:'1500',
  budget_comfort:'450',budget_max:'600',docs:[{n:'Dr. Lee',prac:'Family',aca:'Yes',keep:'Yes'}]})`;

let code = 1;
if (MODE === 'dvh') try {
  const BASE = (process.argv[3] || POP).replace(/\/$/, '');
  let l; for (let i = 0; i < 60 && !l; i++) { await sleep(150); l = await list().catch(() => null); }
  const t = tab(l.find(x => x.type === 'page').webSocketDebuggerUrl); await t.open; await t.send('Runtime.enable'); await t.send('Page.enable');
  await t.send('Page.navigate', { url: BASE + '/tool/' }); await sleep(4500);
  const r = await t.ev(`(function(){ var ALL='AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
    S.dentalCo=undefined; var sold=ML_OFFERED.dvh.split(' '), bad=[], priced=0, notsold=0, p7=0, sp=0;
    ALL.forEach(function(st){ ['i','s','c','f'].forEach(function(hh){ [['1000','0'],['1500','100'],['3000','0'],['5000','100']].forEach(function(c){ [30,50,70].forEach(function(age){
      var r=pDVH(HF_RATES,age,hh,{max:c[0],ded:c[1]},st), g=prGroup(301,st);
      if(sold.indexOf(st)>=0){ var t=g&&g.plans['$'+c[0]+' Benefit - $'+c[1]+' Deductible | $'+c[1]+' Deductible'], a=t&&t[hh.toUpperCase()], want=a?a[1][age-a[0]]:null;
        if(r.price==null||want==null||r.price!==want) bad.push(st+' '+hh+' '+c+' '+age+' got '+r.price+' want '+want); else priced++; }
      else if(typeof dvhIs7016==='function'&&prGroup(150,st)){ var mx=dvh7016Max(c[0],st), k7='$'+Number(mx).toLocaleString('en-US')+' Benefit | $'+Number(mx).toLocaleString('en-US')+' Benefit', a7=prGroup(150,st).plans[k7][hh.toUpperCase()], w7=a7?a7[1][age-a7[0]]:null;
        w7=w7===undefined?null:w7;
        if(r.price!==w7||!(w7==null||r.plan7016)) bad.push(st+' 7016 '+hh+' '+c+' '+age+' got '+r.price+' want '+w7); else p7++; }
      else if(typeof sparkleSold==='function'&&sparkleSold(st)){ if(r.price!==SPARKLE.rates[hh]||!r.sparkle) bad.push(st+' sparkle '+hh+' got '+r.price); else sp++; }
      else { if(r.price!=null||!/not sold in/.test(r.note)) bad.push(st+' should be not sold: '+JSON.stringify(r)); else notsold++; } }); }); }); });
    return {sold:sold.length, priced:priced, p7:p7, s7:(ML_OFFERED.dvh7016||'').split(' ').filter(Boolean).length, sp:sp, notsold:notsold, bad:bad.slice(0,5), nbad:bad.length}; })()`);
  console.log(`DVH ${r.nbad ? 'FAILED ' + r.nbad + ': ' + r.bad.join(' ; ') : 'ok'} sold-states=${r.sold} priced=${r.priced} plan7016-states=${r.s7} plan7016=${r.p7} sparkle-only=${r.sp} not-sold=${r.notsold}`);
  code = r.nbad ? 1 : 0; t.close();
} catch (e) { console.log('DVH FAILED ' + e.message); }
else if (MODE === 'load') try {
  let l; for (let i = 0; i < 60 && !l; i++) { await sleep(150); l = await list().catch(() => null); }
  const t = tab(l.find(x => x.type === 'page').webSocketDebuggerUrl); await t.open; await t.send('Runtime.enable'); await t.send('Log.enable'); await t.send('Page.enable');
  await t.send('Page.navigate', { url: POP + '/tool/' }); await sleep(3500);
  await t.ev(`window.confirm=()=>true; window.alert=()=>{}; goStep('intake'); ['in_agency:Probe Agency','in_agent:Agent Probe','in_aphone:5550100111','in_aemail:agent@example.com'].forEach(function(x){ var p=x.split(':'), e=$(p[0]); e.value=p[1]; e.dispatchEvent(new Event('input',{bubbles:true})); }); true`);
  await t.ev(`loadFile(new File([JSON.stringify(${CLIENT})],'Livecheck Probe Profile - HEALTH.json')); true`); await sleep(1500);
  await t.send('Page.reload', {}); await sleep(3500);
  const r = await t.ev(`({client:S.client.pname, agency:S.agency, agent:S.client.agent, phone:S.agentPhone, email:S.agentEmail, kids:(S.intake.kids||[]).length, oop:+(S.cur||{}).oop,
    pill:(document.querySelector('.goatpill')||{}).href||'', pillShown:getComputedStyle(document.querySelector('.goatpill')).display!=='none'})`);
  const ok = r.client === 'Livecheck Probe' && r.agency === 'Probe Agency' && r.agent === 'Agent Probe' && !!r.phone && r.email === 'agent@example.com' && r.kids >= 2 && r.oop === 9000
    && /goatleads\.com\/registration\/new\?affiliate_id=66c4aa379e0123651ad2f0e6/.test(r.pill) && r.pillShown && !t.errs.length;
  t.errs.forEach(e => console.log('  ' + e));
  console.log(`LIVE LOAD ${ok ? 'ok' : 'FAILED ' + JSON.stringify(r)}`); code = ok ? 0 : 1; t.close();
} catch (e) { console.log('LIVE LOAD FAILED ' + e.message); }
else try {
  let l; for (let i = 0; i < 60 && !l; i++) { await sleep(150); l = await list().catch(() => null); }
  const nav = tab(l.find(t => t.type === 'page').webSocketDebuggerUrl); await nav.open;
  await nav.send('Runtime.enable'); await nav.send('Log.enable'); await nav.send('Page.enable');
  await nav.send('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
  await nav.send('Page.navigate', { url: NAV + '/' }); await sleep(3500);
  await nav.ev(`openScript('health'); P=${CLIENT}; popOpen(); true`);
  let note = ''; for (let i = 0; i < 30; i++) { await sleep(400); note = await nav.ev(`(document.getElementById('popnote')||{}).innerText||''`); if (/Sent to MyPOP Pro|kept the case|cannot take/.test(note)) break; }
  const acked = /Sent to MyPOP Pro/.test(note);

  /* The window the button opened: reload it so its own load errors are caught, then read what it kept. */
  const popT = (await list()).find(t => t.type === 'page' && /mypoppro\.com\/tool/.test(t.url));
  if (!popT) throw new Error('POP Pro window never opened; navigator said: ' + note);
  const pop = tab(popT.webSocketDebuggerUrl); await pop.open;
  await pop.send('Runtime.enable'); await pop.send('Log.enable'); await pop.send('Page.enable');
  await pop.send('Page.reload', { ignoreCache: true }); await sleep(4000);
  const got = await pop.ev(`(function(){ var I=S.intake||{}, C=S.cur||{}, A=S.acaIn||{}, n=I.notes||'';
    var t={ name:S.client.pname==='Livecheck Probe', phone:I.phone==='5550100199', why:/Live ship check/.test(I.whyShop||''),
      spouse:!!(I.who||{}).spouse, kids:(I.kids||[]).length>=2, isAca:C.isAca===true, acaStatus:A.status==='onaca', oop:+C.oop===9000,
      subsidy:+((A.ov||{}).subsidy)===300, dental:I.dv===true, pregnant:I.maternityP===true, hosp:I.surg2yrP===true, keepaca:I.keepaca==='yes',
      booked:/PRESENTATION BOOKED: .*10\\/02\\/2026 6pm/.test(n), losing:/Losing current coverage: done deal/.test(n), nextyr:/Income next year is different/.test(n),
      surg5:/last 5 yrs/.test(n), hsa:/HSA/.test(n), work:/offered through work/.test(n), bank:/Premium drafts from: Credit union/.test(n) };
    return t; })()`);
  const miss = Object.keys(got).filter(k => !got[k]);
  const errors = [...nav.errs, ...pop.errs];
  errors.forEach(e => console.log('  ' + e));
  console.log('navigator said: ' + note.replace(/\s+/g, ' ').slice(0, 140));
  console.log(`LIVE PUSH ${acked ? 'ok' : 'NOT-ACKED'} landed=${Object.keys(got).length - miss.length}/${Object.keys(got).length} missing=${miss.length ? miss.join(',') : 'none'} errors=${errors.length}`);
  code = acked && !miss.length && !errors.length ? 0 : 1;
  nav.close(); pop.close();
} catch (e) { console.log('LIVE PUSH FAILED ' + e.message); }
finally { chrome.kill(); await sleep(300); fs.rmSync(prof, { recursive: true, force: true }); }
process.exit(code);
