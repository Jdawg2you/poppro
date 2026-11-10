// Client View (redesign, Jesse 9 Nov), headless.   node tools/clientview-check.mjs [port]
// One complete plan (no line prices), the Show / Compare with check-offs, Manhattan examples say "You pay $0" (never the
// gray-area net), Cigna keeps its real net with the deductible buster row, Share screen hides everything agent-only,
// and new clients start on broken arm + appendicitis.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = process.argv[2] || '8767';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DBG = 9300 + Math.floor(Math.random() * 500);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cvcheck-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + DBG, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(), errs = [];
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };

const TEST = `(async function(){ var w=ms=>new Promise(r=>setTimeout(r,ms)); for(var k=0;k<40&&PR_STATE!=='ok';k++) await w(250); var fails=[], ok=function(c,m){ if(!c) fails.push(m); };
 var nb=blankState(); ok(nb.ev[0].preset==='arm'&&nb.ev[1].preset==='append','new clients start on broken arm + appendicitis ('+nb.ev.map(function(e){ return e.preset; }).join(', ')+')');
 S=blankState(); S.client.pname='Pat Test'; S.client.state='TX'; S.client.page='45'; fill(); pbApplyLineup('mh'); autoPriceTiers(); S.include={good:false,better:true,best:false}; S.ev=[evScn('arm'),evScn('append')];
 document.querySelectorAll('.modal.open').forEach(function(m){ m.classList.remove('open'); });
 setView('client'); compute(); await w(400); var po=document.getElementById('printout');
 var li=[].slice.call(po.querySelectorAll('.po-cmp .po-li'));
 ok(li.length>=3&&li.every(function(x){ return !/[$][0-9]/.test(x.innerText.split(String.fromCharCode(10))[0]); })&&!!po.querySelector('.po-cmp .po-tot'),'the plan lists what is in it with no line prices, and one total ('+li.length+' items)');
 ok(po.querySelectorAll('.po-cmp .po-col').length===1,'only the plan that is checked shows');
 var big=[].slice.call(po.querySelectorAll('.po-event .c.big')).map(function(c){ return c.innerText; }).join(' | ');
 ok(/You pay [$]0/.test(big)&&!/You NET/.test(big),'Manhattan examples say You pay $0, never a net: '+big);
 ok(!/beyond the bill comes back/.test(po.innerText),'no "beyond the bill comes back to you" on the client side');
 var aca=po.querySelector('[data-pocmp="aca"]'); ok(!!aca&&/ACA/.test((po.querySelector('.po-money th.cm')||{}).innerText||''),'Compare with ACA is a check-off, on');
 aca.click(); await w(300); po=document.getElementById('printout'); ok(!po.querySelector('.po-money th.cm')&&!po.querySelector('.po-save'),'unchecking it removes the ACA column and the savings line');
 po.querySelector('[data-pocmp="aca"]').click(); await w(300);
 document.getElementById('printout').querySelector('[data-poinc="better"]').click(); await w(200); ok(S.include.better!==false,'the last plan can not be unchecked');
 pbApplyLineup('lx-mh-cg'); autoPriceTiers(); S.include={good:false,better:false,best:true}; S.ev=[evScn('hosp'),evScn('append')]; compute(); await w(400); po=document.getElementById('printout');
 var db=po.querySelector('.po-event .evdb'), big2=[].slice.call(po.querySelectorAll('.po-event .c.big')).map(function(c){ return c.innerText; }).join(' | ');
 ok(!!db&&/Your share/.test(db.innerText)&&/Deductible buster pays you/.test(db.innerText)&&/You NET|You pay [$][1-9]/.test(big2),'Cigna keeps its real net, with the deductible buster shown: '+(db?db.innerText.replace(/[ ]+/g,' '):'none')+' / '+big2);
 /* both Compare-with boxes ticked: everything compares with both, not just the anchor (Jesse, 9 Nov) */
 pbApplyLineup('mh'); autoPriceTiers(); var C=curIn(); C.prem=650; C.ded=3000; C.show=true; C.paying=true; S.intake.anchor='cur'; S.poShow={aca:true,cur:true}; S.include={good:false,better:true,best:false}; compute(); await w(400); po=document.getElementById('printout');
 var ah=[].slice.call(po.querySelectorAll('.po-event')[1].querySelectorAll('.c.h.anc')).map(function(c){ return c.innerText; }), gl=po.querySelectorAll('.po-money th.cm').length, sv=po.querySelectorAll('.po-cmp .po-save').length;
 ok(ah.length===2&&gl===2&&sv===1,'both ticked: two comparison columns in the examples ('+ah.join(' / ')+'), two comparison columns side by side ('+gl+'), savings against the anchor only ('+sv+' box)');
 var yrs=[].slice.call(po.querySelectorAll('.po-event')[1].querySelectorAll('.evyr.anc, .c.anc.evyr')).map(function(c){ var m=c.innerText.match(/= [$]([0-9,]+)/); return m?+m[1].replace(/,/g,''):0; });
 ok(yrs.length===2&&yrs[0]>=yrs[1],'comparison columns run most expensive to least: '+yrs.join(' > '));
 ok(/compared against/.test(ah.join(' '))&&/Savings.* measured against your current plan/.test(po.innerText),'the anchor column is marked and a note says what savings are against');
 var mh=[].slice.call(po.querySelectorAll('.po-money th')).map(function(t){ return t.innerText; }), myr=[].slice.call(po.querySelectorAll('.po-money tr.yr td.cm b')).map(function(b){ return +b.innerText.replace(/[^0-9.]/g,''); });
 ok(!po.querySelector('.po-glance')&&!po.querySelector('.po-acabox')&&mh.length===4&&/What you have now/.test(mh.join('|'))&&/ACA/.test(mh.join('|'))&&myr.length===2&&myr[0]>=myr[1],'one side-by-side money table (current, ACA, the plan), most expensive first: '+myr.join(' > '));
 curIn().paying=false; compute(); await w(300); po=document.getElementById('printout'); var mh2=[].slice.call(po.querySelectorAll('.po-money th.cm')).map(function(t){ return t.innerText; }).join('|');
 ok(/What you have now/.test(mh2)&&/ACA/.test(mh2),'not paying for their current plan: it is still their current plan, not a second marketplace column ('+mh2.replace(/[^A-Za-z |—]/g,'').slice(0,90)+')'); curIn().paying=true; compute(); await w(200); po=document.getElementById('printout');
 var tf=po.querySelector('[data-potfra]'); var had=!!po.querySelector('.po-ad,.po-green'); tf.click(); await w(300); po=document.getElementById('printout'); var gone=!po.querySelector('.po-ad,.po-green'); po.querySelector('[data-potfra]').click(); await w(300);
 ok(had&&gone&&!!document.getElementById('printout').querySelector('.po-ad,.po-green'),'the TFRA has its own check-off on Client View (off and back on)');
 setView('agent'); S.includeBy={}; S.include={good:false,better:false,best:true}; pbApplyLineup('lx-mh-cg'); var inc2=JSON.stringify(S.include); pbApplyLineup('mh'); setView('client'); compute(); await w(300); po=document.getElementById('printout');
 ok(inc2==='{"good":true,"better":true,"best":true}'&&S.include.best===true&&S.include.good===false,'which plans show belongs to the lineup: '+inc2+' on the other lineup, Comprehensive alone back on Manhattan');
 S.poShow={aca:true,cur:true};
 shareScreen(); await w(200); ok(!document.fullscreenElement,'Share screen stays in the window (no full screen)'); ok(document.body.classList.contains('sharing')&&getComputedStyle(document.querySelector('.brandbar')).display==='none'&&getComputedStyle(document.getElementById('viewseg')).display==='none','Share screen: Client View with the agent bar and switches hidden');
 document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); await w(100); ok(!document.body.classList.contains('sharing')&&document.body.classList.contains('client'),'Esc stops sharing and leaves Client View on'); setView('agent'); await w(200); ok(!document.body.classList.contains('sharing')&&!document.body.classList.contains('client'),'and it comes back');
 var ag=document.querySelector('#step-quote .pbcol[data-t="best"]'); ok(!!ag&&/[$][0-9]/.test(ag.innerText),'the agent Quote page still has every price');
 return {n:20, fails:fails}; })()`;
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
  console.log(bad.length ? `CLIENTVIEW FAILED ${bad.length}:\n  ` + bad.join('\n  ') : `CLIENTVIEW ok - ${r.n} checks`);
  process.exitCode = bad.length ? 1 : 0;
} catch (e) { console.log('CLIENTVIEW FAILED ' + e.message); process.exitCode = 1; }
finally { try { ws && ws.close(); } catch {} chrome.kill(); await sleep(300); fs.rmSync(prof, { recursive: true, force: true }); }
