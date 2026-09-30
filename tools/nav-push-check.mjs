// Script Navigator -> POP Pro field audit. Runs the navigator's real popClient() and this
// tool's real applySuiteClient(), one health-profile field at a time, and reports where each
// answer lands in POP Pro's state: a real field, the notes only, or nowhere.
//   node tools/nav-push-check.mjs [navigator-dir] [poppro-port]
// Defaults: ~/script-navigator, POP Pro B on 8766. Serves the navigator itself on a spare port.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const NAV = process.argv[2] || path.join(os.homedir(), 'script-navigator');
const PORT = process.argv[3] || '8766';
const NAVPORT = String(8870 + Math.floor(Math.random() * 60));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DBG = 9300 + Math.floor(Math.random() * 500);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const here = path.dirname(new URL(import.meta.url).pathname);
const srv = spawn('python3', [path.join(here, 'serve-nocache.py'), NAVPORT, NAV], { stdio: 'ignore' });
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'navpush-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + DBG, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });

let ws, id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600)); return r.result.value; };
const go = async url => { await send('Page.navigate', { url }); await sleep(2500); };

/* Navigator side: one client object per profile field, each with only that field (plus a name) filled. */
const BUILD = `(function(){
  curScript='health';
  var spec=PF_SPEC_HEALTH.filter(function(f){ return f.k; }), out=[], i=0;
  var sample=function(f){ i++;
    if(f.type==='conds') return {set:function(){ if(f.who==='sp'){ P.married='Married'; P.sp_conds=['Diabetes']; } else { P.conds=['Diabetes']; P.a1c='6.8'; } }, v:'Diabetes'};
    if(f.type==='meds')  return {set:function(){ P[f.who==='sp'?'sp_meds_list':'meds_list']=['Metformin']; }, v:'Metformin'};
    if(f.type==='deps')  return {set:function(){ P.deps=[{n:'KidMarker',dob:'03/04/2015',age:'11',sex:'Female'}]; }, v:'KidMarker'};
    if(f.type==='docs')  return {set:function(){ P.docs=[{n:'DrMarker',prac:'PracMarker',aca:'Yes',keep:'Yes',note:'DocNoteMarker'}]; }, v:'DrMarker'};
    var v;
    if(f.opt){ var o=f.opt.filter(Boolean); v=o.indexOf('Yes')>-1?'Yes':(f.k==='married'?'Married':o[o.length-1]); }
    else if(f.money) v=String(10000+i*7);
    else if(/dob|day|start_when|appt_date/.test(f.k)) v='07/03/1971';
    else if(/age|retire|visits|kids/.test(f.k)) v=String(40+i%30);
    else if(f.k==='height'||f.k==='sp_height') v="5'11\\"";
    else if(/weight/.test(f.k)) v=String(150+i);
    else v='M_'+f.k;
    return {set:function(){ P[f.k]=v; }, v:v};
  };
  /* A field that only shows under another answer gets that answer too (income_next needs next_same=Different). */
  var parent=function(f){ var w=f.showIf; if(!w||typeof w[0]!=='string') return; P[w[0]]=Array.isArray(w[1])?w[1][0]:(w[1]==='*'?'x':w[1]); };
  spec.forEach(function(f){ var s=sample(f); P={first:'Pat',last:'Probe'}; parent(f); s.set();
    out.push({k:f.k, l:f.l||f.type, v:s.v, client:popClient(), raw:JSON.parse(JSON.stringify(P))}); });
  /* Everything at once, for the transport test. */
  P={first:'Pat',last:'Probe'}; spec.forEach(function(f){ sample(f).set(); });
  return {items:out, all:popClient(), base:(P={first:'Pat',last:'Probe'}, popClient())};
})()`;

/* POP Pro side: apply each into a blank state and list the paths that changed from the name-only push. */
const APPLY = items => `(function(items){
  window.confirm=function(){ return true; };
  var flat=function(o,p,acc){ acc=acc||{}; if(o&&typeof o==='object'){ Object.keys(o).forEach(function(k){ flat(o[k],p?p+'.'+k:k,acc); }); } else acc[p]=o; return acc; };
  var run=function(c){ S=blankState(); applySuiteClient(JSON.parse(JSON.stringify(c))); return flat(JSON.parse(JSON.stringify(S)),''); };
  var base=run(items.base);
  /* The same answers loaded from a saved navigator profile file must land exactly where the push puts them. */
  var fileDiff=[]; items.items.forEach(function(it){ var a=run(it.client), b=run(suiteFromNavProfile(it.raw));
    Object.keys(Object.assign({},a,b)).forEach(function(p){ if(/^(intake\.conds\.\d+\.(yr|mo)|intake\.routeNote)$/.test(p)) return;
      if(JSON.stringify(a[p])!==JSON.stringify(b[p])) fileDiff.push(it.k+':'+p+' push='+String(a[p]).slice(0,30)+' file='+String(b[p]).slice(0,30)); }); });
  window.__fileDiff=fileDiff;
  return items.items.map(function(it){ var s=run(it.client), ch=[];
    Object.keys(s).forEach(function(p){ if(JSON.stringify(s[p])!==JSON.stringify(base[p]) && !/^step$/.test(p)) ch.push(p+'='+String(s[p]).slice(0,70)); });
    return {k:it.k,l:it.l,v:it.v,changed:ch}; }).concat([{fileDiff:window.__fileDiff}]);
})(${JSON.stringify(items)})`;

try {
  let list; for (let i = 0; i < 60 && !list; i++) { await sleep(150); list = await fetch(`http://127.0.0.1:${DBG}/json/list`).then(r => r.json()).catch(() => null); }
  ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } });
  await send('Page.enable'); await send('Runtime.enable');

  await go(`http://127.0.0.1:${NAVPORT}/`);
  const built = await ev(BUILD);
  await go(`http://127.0.0.1:${PORT}/tool/`);
  const res0 = await ev(APPLY(built)); const fileDiff = res0.pop().fileDiff; const res = res0;

  const NOTES = /^intake\.(notes|routeNote|docnote|kidsNote)$/;
  let field = 0, notes = 0, dropped = 0;
  const rows = res.map(r => {
    const paths = r.changed.map(c => c.split('=')[0]);
    const real = paths.filter(p => !NOTES.test(p) && !/^intake\.who\./.test(p));
    const verdict = real.length ? 'FIELD' : (paths.length ? 'NOTES' : 'DROPPED');
    if (verdict === 'FIELD') field++; else if (verdict === 'NOTES') notes++; else dropped++;
    return { ...r, verdict };
  });
  const lines = rows.map(r => `${r.verdict.padEnd(8)} ${r.k.padEnd(16)} ${String(r.l).slice(0, 38).padEnd(38)} → ${r.changed.join(' | ').slice(0, 230) || '(nothing)'}`);

  /* Transport: the real postMessage, everything filled, then what the agent sees. */
  await go(`http://127.0.0.1:${PORT}/tool/`);
  const seen = await ev(`(async function(c){ localStorage.clear(); S=blankState(); window.confirm=function(){return true;};
    var ack=null; window.addEventListener('message',function(e){ if(e.data&&e.data.source==='optimum-poppro') ack=e.data; });
    window.postMessage({source:'optimum-suite',type:'client',v:1,tool:'poppro',client:c,agent:{name:'Agent Probe',agency:'Probe Agency',phone:'555-0100',email:'a@probe.test',npn:'999'}},'*');
    await new Promise(function(r){ setTimeout(r,800); });
    var v=function(id){ var el=document.getElementById(id); return el?(el.type==='checkbox'?el.checked:el.value):'(no box)'; };
    return {ack:ack, step:S.step, name:v('c_pname')||S.client.pname, phone:v('in_phone'), email:v('in_email'), carrier:v('in_carrier'), visits:S.intake.visits,
      cur:S.cur, acaStatus:(S.acaIn||{}).status, anchor:S.intake.anchor, keepafc:S.intake.keepafc, keepaca:S.intake.keepaca, dv:S.intake.dv,
      meds:(S.intake.medList||[]).map(function(m){return m.name+(m.forS?'(S)':'(P)');}), kids:S.intake.kids, agency:S.agency, agent:S.client.agent,
      priority:S.intake.priority, notesLen:(S.intake.notes||'').length, routeNote:S.intake.routeNote};
  })(${JSON.stringify(built.all)})`);
  /* Where each answer must land (Jesse's rulings, 2026-09-29). Each pattern must match the field's changes. */
  const EXP = {
    cur_oop: ['^cur\\.oop=10'], cur_is_aca: ['^cur\\.isAca=true', '^acaIn\\.status=onaca'], cur_subsidy: ['^acaIn\\.ov\\.subsidy=10'],
    has_hsa: ['notes=.*HSA'], pregnant: ['^intake\\.maternityP=true', 'notes=.*PREGNANT'], sp_pregnant: ['^intake\\.maternityS=true'],
    emp_offer: ['notes=.*offered through work'], planned: ['notes=.*Planned in the next 12'], life_now: ['notes=.*Life insurance now'],
    bill_tomorrow: ['notes=.*tomorrow'], bank_kind: ['notes=.*Premium drafts from'], losing: ['notes=.*Losing current coverage'],
    income_next: ['notes=.*Income next year is different'], sp_income_next: ['notes=.*Income next year is different'], hh_income_next: ['notes=.*Income next year is different'],
    hosp_stay: ['^intake\\.surg2yrP=true'], stay_what: ['notes=.*Hospital stay'], recent_stay: ['notes=.*last 5 yrs'],
    sp_hosp_stay: ['^intake\\.surg2yrS=true'], sp_stay_what: ['notes=.*Spouse hospital stay'],
    appt_date: ['notes=.*PRESENTATION BOOKED'], appt_time: ['notes=.*PRESENTATION BOOKED'], appt_who: ['notes=.*PRESENTATION BOOKED'],
    want_dental: ['^intake\\.dv=true'], want_vision: ['^intake\\.dv=true'], docs: ['^intake\\.keepaca=yes'],
    married: ['^intake\\.who\\.spouse=true'], kids: ['^intake\\.who\\.kids=true', '^intake\\.kids\\.0\\.n='],
  };
  const NOT = { recent_stay: ['^intake\\.surg2yrP=true'] };
  let ep = 0; const efail = [];
  for (const [k, pats] of Object.entries(EXP)) {
    const r = rows.find(x => x.k === k); if (!r) { efail.push(k + ' (not on the profile)'); continue; }
    const miss = pats.filter(p => !r.changed.some(c => new RegExp(p, 's').test(c)));
    const bad = (NOT[k] || []).filter(p => r.changed.some(c => new RegExp(p, 's').test(c)));
    if (miss.length || bad.length) efail.push(k + (miss.length ? ' missing ' + miss.join(',') : '') + (bad.length ? ' must not ' + bad.join(',') : '')); else ep++;
  }
  console.log(`FILELOAD ${fileDiff.length ? 'DIFFERS ' + fileDiff.length + ': ' + fileDiff.slice(0, 6).join(' ; ') : 'matches push'}`);
  console.log(`EXPECTS pass=${ep}/${Object.keys(EXP).length}${efail.length ? ' FAIL: ' + efail.join(' ; ') : ''}`);
  /* Round trip: POP Pro's save (after the full push) read back by the navigator's own fromPopPro(). */
  const saved = await ev(`JSON.stringify(S)`);
  await go(`http://127.0.0.1:${NAVPORT}/`);
  const rt = await ev(`(function(o){ curScript='health'; var back=fromPopPro(o), keys=['first','last','dob','age','sex','phone','email','state','zip','sp_name','sp_age','height','weight','sp_height','tobacco',
    'why_note','start_when','cur_carrier','cur_plan','cur_prem','cur_emp_prem','cur_ded','cur_oop','cur_copay','cur_visits','cur_is_aca','cur_subsidy','fh_cancer','fh_heart','mat_needs',
    'income_this','sp_income','hh_income','i_retire','i_liquid','asset_amt','budget_comfort','budget_max','want_dental','meds_list','deps','docs','kids','married'];
    var miss=keys.filter(function(k){ var v=back[k]; return v==null||v===''||(Array.isArray(v)&&!v.length); });
    return {n:keys.length, miss:miss}; })(${saved})`);
  console.log(`ROUNDTRIP ${rt.n - rt.miss.length}/${rt.n}${rt.miss.length ? ' missing ' + rt.miss.join(',') : ''}`);
  /* summary first - checkers read the head of the output */
  console.log(`NAVPUSH fields=${rows.length} field=${field} notes=${notes} dropped=${dropped} ack=${seen.ack && seen.ack.ok === true ? 'ok' : 'MISSING'}\n`);
  lines.forEach(l => console.log(l));
  console.log('\nTRANSPORT ' + JSON.stringify(seen));
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill(); srv.kill();
  await sleep(300); fs.rmSync(prof, { recursive: true, force: true });
}
