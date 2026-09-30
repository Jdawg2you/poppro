// Post-ship checks against the LIVE sites, in a throwaway Chrome profile (no real data touched).
//   node tools/live-check.mjs files   mypoppro.com serves exactly ~/Documents/poppro's page and data
//   node tools/live-check.mjs nav     script.ffloptimum.com serves exactly ~/script-navigator/index.html
//   node tools/live-check.mjs push    a real push: live navigator -> live POP Pro, acknowledged, fields land, no page errors
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
try {
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
