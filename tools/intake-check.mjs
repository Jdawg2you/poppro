// Intake smart fields and agent setup (sandbox), headless.   node tools/intake-check.mjs [port]  (default 8767)
// Date of birth 63078 -> 06/30/1978 with age; money boxes read $1,234.00 and still save the number; agent setup folds
// once agency/name/phone/email are in and reopens when one goes; the NPN lives in setup, never the notes; Bill Saver
// starts ticked on an older quote.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = process.argv[2] || '8767';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DBG = 9300 + Math.floor(Math.random() * 500);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'intkcheck-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + DBG, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(), errs = [];
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };

const TEST = `(async function(){ var w=ms=>new Promise(r=>setTimeout(r,ms)); await w(1200); window.confirm=()=>true; var R={}, fails=[], ok=function(c,m){ if(!c) fails.push(m); };
 /* an old save: Bill Saver off, no version marker, an NPN line in the notes */
 var old=blankState(); old.negot.on=false; delete old.negotV; old.intake.notes='likes mornings\\nAgent NPN 1234567'; old.client.agent=''; S=old; fill(); goStep('intake'); await w(300);
 R.billSaverOnOldSave=$('neg_on').checked&&S.negot.on;
 applySuiteAgent({npn:'7654321'}); R.npnToSetup=S.agentNPN==='7654321'&&!/NPN/.test(S.intake.notes);
 R.setupOpenWhenMissing=$('agentSetup').open+' '+$('agentSetupState').textContent;
 $('in_agent').value='Jesse Stamm'; $('in_aphone').value='5550100'; $('in_aemail').value='j@x.com'; $('in_agency').value='Optimum'; captureIntake(); goStep('quote'); goStep('intake'); await w(100);
 /* The fold used to wait on these four. It now waits on all eight (Jesse, 2026-10-09), so the
    four alone must NOT fold it - that is the regression this line guards. */
 R.stillOpenOnFourOfEight=$('agentSetup').open+' '+$('agentSetupState').textContent;
 $('in_anpn').value='7654321'; $('in_aweb').value='x.com'; $('in_acard').value='x.com/card'; $('in_abook').value='x.com/book';
 captureIntake(); goStep('quote'); goStep('intake'); await w(100);
 R.setupFoldedWhenComplete=!$('agentSetup').open+' '+$('agentSetupState').textContent;
 $('in_aweb').value=''; $('in_acard').value=''; $('in_abook').value=''; captureIntake();
 R.reopensWhenLinksGone=$('agentSetup').open;
 $('goatSkip').click(); await w(50); R.foldsAfterGoatSkip=!$('agentSetup').open;
 try{ localStorage.removeItem('pp_goat_skip'); }catch(e){}
 $('in_aweb').value='x.com'; $('in_acard').value='x.com/card'; $('in_abook').value='x.com/book'; captureIntake();
 $('in_aemail').value=''; captureIntake(); R.reopensWhenEmailGone=$('agentSetup').open;
 var d=$('in_date'); d.focus(); d.value='63078'; d.dispatchEvent(new Event('input')); d.dispatchEvent(new Event('change')); R.dob=d.value+' age '+$('in_page').value;
 var b=$('in_budget'); b.focus(); b.value='1250'; b.dispatchEvent(new Event('input')); b.dispatchEvent(new Event('change',{bubbles:true})); await w(50); R.budget=b.value+' -> '+S.intake.budget;
 var cp=$('in_cur_ded'); cp.focus(); cp.value='6000'; cp.dispatchEvent(new Event('input')); cp.dispatchEvent(new Event('change',{bubbles:true})); await w(50); R.curDed=cp.value+' -> '+(S.cur||{}).ded;
 var inc=$('in_income'); inc.focus(); inc.value='85000'; inc.dispatchEvent(new Event('input')); inc.dispatchEvent(new Event('change',{bubbles:true})); await w(50); R.income=inc.value+' -> '+S.intake.income;
 
 ok(R.billSaverOnOldSave,'Bill Saver ticked on an older quote'); ok(R.npnToSetup,'NPN goes to setup, out of the notes');
 ok(/^true · fill in: your name, phone, email/.test(R.setupOpenWhenMissing),'setup open while basics are missing: '+R.setupOpenWhenMissing);
 ok(/^true · fill in: NPN, website, digital business card, booking link$/.test(R.stillOpenOnFourOfEight),'setup stays open on four of eight: '+R.stillOpenOnFourOfEight);
 ok(/^true · complete$/.test(R.setupFoldedWhenComplete),'setup folds when all eight are in: '+R.setupFoldedWhenComplete);
 ok(R.reopensWhenLinksGone,'setup reopens when the links go');
 ok(R.foldsAfterGoatSkip,'setup folds after the GOAT opt-out');
 ok(R.reopensWhenEmailGone,'setup reopens when email goes');
 ok(/^06\\/30\\/1978 age \\d\\d$/.test(R.dob),'DOB 63078: '+R.dob); ok(R.budget==='$1,250.00 -> 1250','budget: '+R.budget);
 ok(R.curDed==='$6,000.00 -> 6000','deductible: '+R.curDed); ok(R.income==='$85,000.00 -> 85000','income: '+R.income);
 return {n:13, fails:fails}; })()`;

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
  console.log(bad.length ? `INTAKE FAILED ${bad.length}:\n  ` + bad.join('\n  ') : `INTAKE ok - smart fields, setup fold, NPN, Bill Saver`);
  process.exitCode = bad.length ? 1 : 0;
} catch (e) { console.log('INTAKE FAILED ' + e.message); process.exitCode = 1; }
finally { try { ws && ws.close(); } catch {} chrome.kill(); await sleep(300); fs.rmSync(prof, { recursive: true, force: true }); }
