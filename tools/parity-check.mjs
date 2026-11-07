// REDESIGN PARITY - the redesign changes how MyPopPro LOOKS, never what it DOES. This opens the live site and the
// redesign side by side, builds the same clients in both through the tool's own code, walks every step in the agent
// and the client view, and fails on any difference in what the tool produces.
// Jesse, 7 Nov 2026: "We regression test against the live version ... make sure it's doing all the things properly and
// that it can load properly ... because people are using this. It's open enrollment."
//
//   node tools/parity-check.mjs [A] [B]
//     A = the reference (default https://mypoppro.com/tool/ - the live site)
//     B = the candidate (default http://127.0.0.1:8795/tool/ - the redesign preview, launch config "poppro-redesign")
//
// STRICT (any difference fails): every package total, the client's chosen plan and lineup, the saved client file,
//   save -> reload round trip, the enroll email, the enroll text, the Benefits Review email, the follow-up email, the
//   post-call text, the plan extras email, page errors.
// CONTENT (fails when A's words go missing in B): the visible text of every step, agent view and client view. A line
//   the redesign deliberately rewords goes in tools/parity-allow.json ({"lines":["exact old line", ...]}) - each one
//   is a decision Jesse can see, never a silent drop. Lines B adds are listed for review, not failed.
// CLIENT VIEW (fails on any): an agent-only element (.hidein-client) showing while the client view is on.
// LOAD: time until the tool is usable, both sides, reported.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const A = process.argv[2] || 'https://mypoppro.com/tool/';
const B = process.argv[3] || 'http://127.0.0.1:8795/tool/';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ALLOW = (() => { try { return new Set(JSON.parse(fs.readFileSync(new URL('./parity-allow.json', import.meta.url))).lines || []); } catch { return new Set(); } })();

/* Clients built in the page with the tool's own functions - no real client data in this file. */
const CAPTURE = `(async function(){
  var wait=function(ms){ return new Promise(function(r){ setTimeout(r,ms); }); };
  window.confirm=function(){ return true; }; window.alert=function(){}; window.open=function(){ return null; };
  var T=function(f){ try{ var v=f(); return v==null?'(none)':(typeof v==='string'?v:JSON.stringify(v)); }catch(e){ return 'ERROR: '+e.message; } };
  var vis=function(el){ return !!(el&&el.offsetParent!==null&&el.getClientRects().length); };
  var SC=[
    {id:'single-tx-mh',     c:{first:'Pat',last:'Quill',state:'TX',age:'34',dob:'01/01/1992',kids:[],health:{}}, lineup:'mh', pick:'best'},
    {id:'family-fl-mh',     c:{first:'Dana',last:'Reyes',state:'FL',age:'41',dob:'03/14/1985',spouse:{first:'Sam',last:'Reyes',dob:'07/02/1984',age:'42'},kids:[{first:'Kit',last:'Reyes',dob:'05/05/2014',age:'12'},{first:'Lee',last:'Reyes',dob:'09/09/2017',age:'9'}],health:{married:'Married',kidsCount:'2'}}, lineup:'mh', pick:'better'},
    {id:'couple-ga-aca',    c:{first:'Ann',last:'Stone',state:'GA',age:'55',dob:'02/02/1971',spouse:{first:'Bo',last:'Stone',dob:'04/04/1969',age:'57'},kids:[],health:{married:'Married'}}, lineup:'aca', pick:'good'},
    {id:'single-nc-lxmhcg', c:{first:'Cy',last:'Tran',state:'NC',age:'29',dob:'06/06/1997',kids:[],health:{}}, lineup:'lx-mh-cg', pick:'best'},
    {id:'single-az-vb',     c:{first:'Di',last:'Uhl',state:'AZ',age:'47',dob:'08/08/1979',kids:[],health:{}}, lineup:'vb', pick:'better'},
    {id:'single-tx-cg',     c:{first:'Ed',last:'Vance',state:'TX',age:'38',dob:'10/10/1988',kids:[],health:{}}, lineup:'cg', pick:'best'},
    {id:'couple-tn-custom', c:{first:'Fay',last:'Wolfe',state:'TN',age:'61',dob:'12/12/1965',spouse:{first:'Gus',last:'Wolfe',dob:'01/20/1963',age:'63'},kids:[],health:{married:'Married'}}, lineup:'custom', pick:'good'}
  ];
  var STEPS=['intake','tree','quote','present','enroll','review'], out={};
  for(var i=0;i<SC.length;i++){ var sc=SC[i], R={};
    S=blankState(); applySuiteClient(sc.c); ['good','better','best'].forEach(function(t){ S.include[t]=true; });
    autoPriceTiers(); compute(); goStep('quote'); await wait(250);
    R.lineupApplied=T(function(){ pbApplyLineup(sc.lineup); return S.lineup; }); compute(); await wait(150);
    chooseTier(sc.pick); await wait(150);
    R.chosen=T(function(){ return {tier:chosenTier(),lineup:S.lineup,name:S.chosen&&S.chosen.name}; });
    R.totals=T(function(){ return ['good','better','best'].map(function(t){ var x=tierTotals(t); return t+':'+(+x.mo).toFixed(2); }); });
    R.file=T(function(){ return stripAgent(currentQuote()); });
    R.roundtrip=T(function(){ var f=JSON.stringify(stripAgent(currentQuote())); loadQuoteObject(JSON.parse(f)); fill(); compute(); return JSON.stringify(stripAgent(currentQuote()))===f?'same':'CHANGED'; });
    R.enrollEmail=T(function(){ return enrollEmail(); });
    R.enrollText=T(function(){ return enrollTextPlain(sc.pick); });
    R.reviewEmail=T(function(){ return reviewEmail(); });
    R.followupEmail=T(function(){ return buildEmail(); });
    R.postText=T(function(){ return textFromHTML(postTextHTML(sc.pick)); });
    R.extrasEmail=T(function(){ return mlExtrasEmail(sc.pick); });
    R.steps={}; R.leaks=[];
    for(var j=0;j<STEPS.length;j++){ var s=STEPS[j]; goStep(s); await wait(450);
      var el=document.getElementById('step-'+s); R.steps[s+'/agent']=el?el.innerText:'(no step element)';
      setView('client'); await wait(250);
      R.steps[s+'/client']=el?el.innerText:'(no step element)';
      document.querySelectorAll('.hidein-client').forEach(function(x){ if(vis(x)) R.leaks.push(s+': '+(x.id||x.className)+' "'+(x.innerText||'').slice(0,60)+'"'); });
      setView('agent'); }
    out[sc.id]=R; }
  return out;
})()`;

async function capture(url) {
  const DBG = 9300 + Math.floor(Math.random() * 600);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-'));
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1440,900', '--remote-debugging-port=' + DBG, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
  let ws, id = 0; const pending = new Map(), errs = [];
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };
  try {
    let l; for (let i = 0; i < 60 && !l; i++) { await sleep(150); l = await fetch(`http://127.0.0.1:${DBG}/json/list`).then(r => r.json()).catch(() => null); }
    ws = new WebSocket(l.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    ws.addEventListener('message', m => { const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
      if (d.method === 'Runtime.exceptionThrown') errs.push((d.params.exceptionDetails.exception || {}).description || d.params.exceptionDetails.text); });
    await send('Runtime.enable'); await send('Page.enable');
    const t0 = Date.now();
    await send('Page.navigate', { url });
    let ready = false; for (let i = 0; i < 100 && !ready; i++) { await sleep(100); ready = await ev(`typeof blankState==='function'&&typeof goStep==='function'&&document.readyState==='complete'`).catch(() => false); }
    const loadMs = Date.now() - t0;
    await sleep(2500);   // rate tables and med lists finish loading
    const data = await ev(CAPTURE);
    return { loadMs, errs, data };
  } finally { try { ws && ws.close(); } catch {} chrome.kill(); await sleep(300); fs.rmSync(prof, { recursive: true, force: true }); }
}

/* the two sites live at different addresses - links to the site itself are the same link */
/* the care-card link carries a random card id ("i") each time it is made - compare what the card holds, not its id */
const card = s => s.replace(/#c=([A-Za-z0-9_\-+/=%]+)/g, (m, p) => { try { const o = JSON.parse(Buffer.from(decodeURIComponent(p).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); delete o.i; return '#c=' + JSON.stringify(o); } catch { return m; } });
const norm = s => card(String(s)).replace(/https?:\/\/(sandbox\.)?mypoppro\.com(\/redesign)?/g, 'SITE').replace(/http:\/\/127\.0\.0\.1:[0-9]+/g, 'SITE');
const lines = s => norm(s).split('\n').map(x => x.trim()).filter(Boolean);
const STRICT = ['lineupApplied', 'chosen', 'totals', 'file', 'roundtrip', 'enrollEmail', 'enrollText', 'reviewEmail', 'followupEmail', 'postText', 'extrasEmail'];

const firstDiff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return `at char ${i}: A "${a.slice(Math.max(0, i - 40), i + 60)}" | B "${b.slice(Math.max(0, i - 40), i + 60)}"`; };

try {
  console.log(`A (reference): ${A}\nB (candidate): ${B}\n`);
  const [ra, rb] = await Promise.all([capture(A), capture(B)]);
  const fails = [], notes = [];
  console.log(`Load: A ${ra.loadMs} ms, B ${rb.loadMs} ms`);
  if (rb.loadMs > Math.max(4000, ra.loadMs * 1.5)) fails.push(`B is slow to load: ${rb.loadMs} ms vs A ${ra.loadMs} ms`);
  ra.errs.forEach(e => notes.push('A page error (live has it too): ' + String(e).slice(0, 160)));
  rb.errs.filter(e => !ra.errs.includes(e)).forEach(e => fails.push('B page error: ' + String(e).slice(0, 160)));
  let checks = 0;
  for (const sc of Object.keys(ra.data)) {
    const a = ra.data[sc], b = rb.data[sc];
    if (!b) { fails.push(`${sc}: missing in B`); continue; }
    for (const k of STRICT) { checks++; const x = norm(a[k]), y = norm(b[k]); if (x !== y) fails.push(`${sc} ${k} differs ${firstDiff(x, y)}`); }
    if (norm(a.roundtrip) !== 'same') notes.push(`${sc}: save→reload changes the file on A too (${a.roundtrip})`);
    for (const st of Object.keys(a.steps)) { checks++;
      const lb = new Set(lines(b.steps[st] || '')), la = new Set(lines(a.steps[st]));
      const lost = [...la].filter(x => !lb.has(x) && !ALLOW.has(x)), added = [...lb].filter(x => !la.has(x));
      if (lost.length) fails.push(`${sc} ${st}: ${lost.length} line(s) of A missing in B: ` + lost.slice(0, 4).map(x => JSON.stringify(x.slice(0, 80))).join(', ') + (lost.length > 4 ? ' …' : ''));
      if (added.length) notes.push(`${sc} ${st}: B adds ${added.length} line(s): ` + added.slice(0, 3).map(x => JSON.stringify(x.slice(0, 60))).join(', '));
    }
    b.leaks.forEach(l => fails.push(`${sc} CLIENT VIEW shows agent-only: ${l}`)); checks++;
    a.leaks.forEach(l => notes.push(`${sc} live also shows in client view: ${l}`));
  }
  const n = Object.keys(ra.data).length;
  if (notes.length) console.log('\nNotes (' + notes.length + '):\n  ' + notes.slice(0, 40).join('\n  ') + (notes.length > 40 ? '\n  …' : ''));
  console.log(fails.length ? `\nPARITY FAILED ${fails.length} of ${checks} checks across ${n} clients:\n  ` + fails.join('\n  ') : `\nPARITY ok - ${checks} checks across ${n} clients: B does everything A does`);
  process.exitCode = fails.length ? 1 : 0;
} catch (e) { console.log('PARITY FAILED ' + e.message); process.exitCode = 1; }
