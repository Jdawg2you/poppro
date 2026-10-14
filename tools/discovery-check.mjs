// The Discovery call inside POP Pro: the Script Navigator's Health Discovery framed as POP Pro's first step.
//   node tools/discovery-check.mjs embed|init|live|save [poppro-port] [navigator-port]   -> DISCOVERY <mode> ok
// embed: the frame opens straight into Health Discovery with the stand-alone site's own controls hidden.
// init:  opening the step hands in POP Pro's saved call (S.nav) and the agent's details.
// live:  answers typed in the call fill POP Pro as they go - no confirm prompt, and POP Pro stays on the call.
// save:  POP Pro's save then carries the whole call, and that file opens in the stand-alone navigator with every answer.
// The two sandboxes share a host (127.0.0.1), so the frame runs in-process and is reached by its execution context.
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const MODE = process.argv[2] || 'embed', PP = process.argv[3] || '8767', NP = process.argv[4] || '8777';
const NAV_ORIGIN = 'http://127.0.0.1:' + NP;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', DBG = 9100 + Math.floor(Math.random() * 90);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + DBG, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function page(url, wsUrl) {
  const t = wsUrl ? { webSocketDebuggerUrl: wsUrl } : await fetch(`http://127.0.0.1:${DBG}/json/new?${url}`, { method: 'PUT' }).then(r => r.json());
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = new Map(), errs = [], kids = [];
  ws.addEventListener('message', m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    if (d.method === 'Runtime.executionContextCreated') kids.push(d.params.context);
    if (d.method === 'Runtime.exceptionThrown') errs.push((d.params.exceptionDetails.exception || {}).description || d.params.exceptionDetails.text); });
  const send = (m, p = {}, sessionId) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify(Object.assign({ id: i, method: m, params: p }, sessionId ? { sessionId } : {}))); });
  await send('Runtime.enable'); await send('Page.enable');
  const run = async (e, contextId) => { const r = await send('Runtime.evaluate', Object.assign({ expression: e, awaitPromise: true, returnByValue: true }, contextId ? { contextId } : {}));
    if (r.error) throw new Error(JSON.stringify(r.error)); if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result.result.value; };
  /* the navigator nests its own blank frame of the same origin, so test each candidate for the navigator itself */
  const frameSession = async () => { for (const c of kids.filter(x => x.origin === NAV_ORIGIN).reverse()) { try { const r = await send('Runtime.evaluate', { expression: 'typeof pStore', returnByValue: true, contextId: c.id }); if (r.result && r.result.result && r.result.result.value === 'function') return c.id; } catch (e) {} } return null; };
  return { run, send, frameSession, errs, close: () => ws.close() };
}
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
try {
  let l; for (let i = 0; i < 60 && !l; i++) { await sleep(150); l = await fetch(`http://127.0.0.1:${DBG}/json/list`).then(r => r.json()).catch(() => null); }
  const pop = await page(`http://127.0.0.1:${PP}/tool/`); await sleep(4500);
  await pop.run(`(function(){ window.__confirms=0; window.confirm=function(){ window.__confirms++; return true; }; window.alert=function(){};
    S=blankState(); S.client.agent='Jesse Stamm'; S.agency='Optimum Health'; S.agentPhone='(443) 895-1832';
    if(${JSON.stringify(MODE)}==='init'){ S.client.pname='Init Test'; S.client.state='TX'; S.intake.whyMatters='keep Dr. Patel'; S.nav={first:'Init',last:'Test',has_assets:'Yes',keep_docs:'Yes'}; }
    fill(); goStep('call'); return true; })()`);
  /* the call runs in its own process (another port is another origin), reached through an auto-attached session */
  let sid = null; for (let i = 0; i < 80 && !sid; i++) { await sleep(150); sid = await pop.frameSession(); }
  ok(!!sid, 'the call frame loaded from the navigator');
  let fr = null; const fc = !!sid;
  if (fc) {
    await sleep(1500);                                   // call-ready -> call-init round trip
    sid = await pop.frameSession() || sid;
    const inFrame = e => pop.run(e, sid);
    if (MODE === 'embed') {
      const r = await inFrame(`(function(){ var hid=function(sel){ var e=document.querySelector(sel); return !e||getComputedStyle(e).display==='none'; };
        return {host:document.body.classList.contains('host-pop'), script:curScript, card:typeof cur!=='undefined'&&N[cur]?N[cur].t:null,
          hidden:['#toScripts','.o-suite','#setupbtn','#restart','.recstrip','#profprint','#profsave','#profopen','#poppro','#popnote'].filter(function(s){ return !hid(s); })}; })()`);
      ok(r.host, 'the navigator knows it is inside POP Pro');
      ok(r.script === 'health', 'it opened straight into Health Discovery (' + r.script + ')');
      ok(r.hidden.length === 0, 'stand-alone controls hidden inside POP Pro; still showing: ' + r.hidden.join(', '));
      const il = await inFrame(`(function(){ go('hs_qualify'); return {inputs:document.querySelectorAll('#script .iblank').length, open:document.getElementById('drawer').classList.contains('open'), tools:(function(){ var t=document.querySelector('.ptools'); return !t||getComputedStyle(t).display==='none'; })()}; })()`);
      ok(il.inputs >= 4 && !il.open, 'fill-ins sit in the script and the profile slide-out starts closed: ' + JSON.stringify(il));
      const il2 = await inFrame(`(function(){ pOpen(); closeDrawer(); go('hs_qualify'); return document.querySelectorAll('#script .iblank').length; })()`);
      ok(il2 >= 4, 'fill-ins stay after opening and closing the slide-out (' + il2 + ')');
      /* nothing leaves the call before a POP Pro page has identified itself (call-init) */
      await pop.run(`(function(){ window.__got=0; window.addEventListener('message',function(e){ if(e.data&&e.data.live) window.__got++; }); return 1; })()`);
      await inFrame(`(function(){ window.__keep=HOST_ORIGIN; HOST_ORIGIN='*'; P.first='Leak'; pStore(); return 1; })()`); await sleep(800);
      const leaked = await pop.run('window.__got'); await inFrame(`(function(){ HOST_ORIGIN=window.__keep; return 1; })()`);
      ok(leaked === 0, 'no client data is sent before POP Pro identifies itself (' + leaked + ' messages)');
      await inFrame(`(function(){ P.first='Sent'; pStore(); return 1; })()`); await sleep(800);
      ok(await pop.run('window.__got') > 0, 'and once it has, answers do flow (positive control)');
    }
    if (MODE === 'init') {
      const r = await inFrame(`({first:P.first, lead:P.has_assets, keep:P.keep_docs, wm:P.why_matters, state:P.state, agent:A.a_name, agency:A.a_agency})`);
      ok(r.first === 'Init' && r.lead === 'Yes' && r.keep === 'Yes', 'the saved call came in from POP Pro: ' + JSON.stringify(r));
      ok(r.wm === 'keep Dr. Patel' && r.state === 'TX', 'POP Pro’s own answers came in too');
      ok(r.agent === 'Jesse Stamm' && r.agency === 'Optimum Health', 'the agent’s details came in');
    }
    if (MODE === 'live' || MODE === 'save') {
      for (const [k, v] of [['first', 'L'], ['first', 'Li'], ['first', 'Livia']]) { await inFrame(`(function(){ P.${k}=${JSON.stringify(v)}; pStore(); return 1; })()`); await sleep(120); }
      await inFrame(`(function(){ P.last='Test'; P.state='TX'; P.zip='77001'; P.why_matters='keep my doctor'; P.has_assets='Yes'; P.keep_docs='Yes'; pStore(); return 1; })()`);
      await sleep(900);
      const r = await pop.run(`({name:S.client.pname, state:S.client.state, wm:S.intake.whyMatters, navFirst:(S.nav||{}).first, navLead:(S.nav||{}).has_assets, step:S.step, confirms:window.__confirms})`);
      ok(r.name === 'Livia Test' && r.state === 'TX' && r.wm === 'keep my doctor', 'answers from the call fill POP Pro: ' + JSON.stringify(r));
      ok(r.navFirst === 'Livia' && r.navLead === 'Yes', 'POP Pro keeps the whole call');
      ok(r.confirms === 0, 'no confirm prompts while the name is typed (' + r.confirms + ')');
      ok(r.step === 'call', 'POP Pro stays on the call (' + r.step + ')');
      if (MODE === 'save') {
        const file = await pop.run(`(function(){ var d=currentQuote(); d.format='optimum-client'; d.formatV=1; return d; })()`);
        ok(file.format === 'optimum-client' && file.nav && file.nav.keep_docs === 'Yes', 'POP Pro’s save carries the call');
        const nav = await page(`${NAV_ORIGIN}/`); await sleep(3500);
        const back = await nav.run(`(function(){ var p=profileFromFile(${JSON.stringify(file)}); return {first:p.first, last:p.last, lead:p.has_assets, keep:p.keep_docs, wm:p.why_matters}; })()`);
        ok(back.first === 'Livia' && back.lead === 'Yes' && back.keep === 'Yes' && back.wm === 'keep my doctor', 'that file opens in the stand-alone navigator with every answer: ' + JSON.stringify(back));
        nav.close();
      }
    }
  }
  const all = fails.concat(pop.errs.concat(fr ? fr.errs : []).map(e => 'page error: ' + String(e).slice(0, 160)));
  console.log(all.length ? 'DISCOVERY ' + MODE + ' FAILED ' + all.length + ':\n  ' + all.join('\n  ') : 'DISCOVERY ' + MODE + ' ok');
  process.exitCode = all.length ? 1 : 0; pop.close();
} catch (e) { console.log('DISCOVERY ' + MODE + ' FAILED ' + e.message); process.exitCode = 1; }
finally { chrome.kill(); await sleep(300); try { fs.rmSync(prof, { recursive: true, force: true }); } catch {} }
