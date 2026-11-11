// Living benefits (Jesse, 10 Nov): the named carrier list, National Life typed in, IUL Express from the rate table,
// and the Additional section (any person, any carrier, added together).   node tools/lb-check.mjs [port]
// was: Package totals = the products in them. The classic panel's Living Benefits box is hidden in B but kept pricing in
// the background, and a hidden ~$45 (plus a hard-coded lb:45 on Comprehensive) was added on top of the builder's own
// living benefits. Fixed 2026-10-08.   node tools/total-check.mjs [port]   (default 8766)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = process.argv[2] || '8766';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DBG = 9300 + Math.floor(Math.random() * 500);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'lbcheck-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + DBG, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(), errs = [];
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };

const TEST = String.raw`(async function(){
  var fails=[], ok=function(c,m){ if(!c) fails.push(m); }, wait=function(ms){ return new Promise(function(r){ setTimeout(r,ms); }); };
  window.confirm=function(){ return true; };
  var same=function(t){ var a=tierTotals(t).mo, b=S.packages[t].products.reduce(function(x,p){ return x+(+p.monthly||0); },0)+(+S.packages[t].med||0); return Math.abs(a-b)<0.005?'':t+' total '+a.toFixed(2)+' vs products '+b.toFixed(2); };
  var setup=function(st,age,sex){ S=blankState(); applySuiteClient({first:'Dana',last:'Reyes',state:st,age:String(age),dob:'01/01/1980',kids:[{name:'Kit Reyes',age:'10'},{name:'Sam Reyes',age:'24'}],health:{}});
    S.intake.who.kids=true; S.intake.psex=sex||'M'; ['good','better','best'].forEach(function(t){ S.include[t]=true; }); autoPriceTiers(); compute(); };
  var prod=function(k){ return S.packages.best.products.filter(function(p){ return p.k===k; })[0]; };
  var put=function(w,lc){ var c=effCfg('best'); c.lb=c.lb||{}; c.lb[w]=lc; S.packages.best.dropped=(S.packages.best.dropped||[]).filter(function(x){ return x!=='lb'+w; }); pbReprice(); };

  /* 1. the carrier list, in Jesse's words */
  ok(LB_CARRIERS.map(function(x){ return x[1]; }).join('|')==='Mutual of Omaha - TLE|Americo - Term|Mutual of Omaha - IULE|NLG - Term/IUL|Other…','carrier list: '+LB_CARRIERS.map(function(x){ return x[1]; }).join('|'));

  /* 2. National Life: typed coverage, plan and monthly; named in the emails */
  setup('TX',46,'M'); put('p',{carrier:'nlg',face:'100000',ptype:'iul',otherMonthly:'88',notes:'Rapid Protect'});
  var p=prod('lbp'); ok(p&&p.monthly===88&&/\$100K IUL permanent coverage \(National Life Group\)/.test(p.name),'NLG IUL priced as typed: '+(p&&p.name)+' '+(p&&p.monthly));
  ok(!same('best'),'NLG: '+same('best'));
  chooseTier('best'); var em=enrollEmail().body; ok(/Indexed Universal Life \(permanent\) protection with National Life Group/.test(em),'enroll email names NLG + IUL');
  ok(/National Life Group/.test(pbSummary('lbp',effCfg('best'),p))&&/Rapid Protect/.test(pbSummary('lbp',effCfg('best'),p)),'summary carries carrier + notes: '+pbSummary('lbp',effCfg('best'),p));
  put('p',{carrier:'nlg',face:'100000',ptype:'',otherMonthly:'88'}); p=prod('lbp'); ok(p&&/term \/ IUL — see notes \(National Life Group\)/.test(p.name),'NLG with no plan picked says see notes: '+(p&&p.name));
  put('p',{carrier:'nlg',face:'100000',ptype:'term',otherMonthly:''}); ok(!(prod('lbp')&&+prod('lbp').monthly>0),'NLG with no monthly: nothing invented');
  ok(/fill in the plan \(term or IUL\) and the monthly/.test(pbWhyNot('lbp',effCfg('best'),'TX',46)),'NLG missing monthly says what to fill in: '+pbWhyNot('lbp',effCfg('best'),'TX',46));

  /* 3. Additional: any person, any carrier, added together */
  setup('TX',46,'M'); var c=effCfg('best'); c.lb=c.lb||{};
  c.lb.x=[{who:'k0',carrier:'nlg',face:'50000',ptype:'term',monthly:'12.50',notes:'20-year'},{who:'p',carrier:'other',otherName:'Corebridge QoL Flex',face:'25000',ptype:'iul',monthly:'30'}];
  pbReprice(); var x=prod('lbx');
  ok(x&&x.monthly===42.5,'additional policies add together: '+(x&&x.monthly));
  ok(x&&/Kit — \$50K term \(National Life Group\)/.test(x.name)&&/Dana — \$25K IUL permanent coverage \(Corebridge QoL Flex\)/.test(x.name),'additional name lists each policy: '+(x&&x.name));
  ok(!same('best'),'additional: '+same('best'));
  ok(lbWhoOpts().map(function(o){ return o[0]; }).join(',')==='p,k0,k1,several','who list = household: '+lbWhoOpts().map(function(o){ return o[0]; }).join(','));
  c.lb.x[1].monthly=''; pbReprice(); ok(!(prod('lbx')&&+prod('lbx').monthly>0),'an additional policy with no monthly: nothing invented');
  ok(/Additional policy 2: type the monthly/.test(pbWhyNot('lbx',c,'TX',46)),'says which policy is missing: '+pbWhyNot('lbx',c,'TX',46));
  c.lb.x[1].monthly='30'; pbReprice(); chooseTier('best');
  em=enrollEmail().body; ok(/Kit — \$50,000 of Living Benefits coverage with Term Life Protection with National Life Group/.test(em),'enroll email lists the additional policy for Kit');
  renderEnroll(); await wait(100); var en=[].map.call(document.querySelectorAll('.enroll-card'),function(d){ return d.textContent; }).join(' ');
  ok(/Living benefits — Additional/.test(en)&&/Corebridge QoL Flex/.test(en),'Enroll shows the additional policies');

  /* 4. the builder: add the section, add and remove policies */
  setup('TX',46,'M'); goStep('quote'); await wait(300);
  var col=document.querySelector('.pbcol[data-t="best"]'), sel=col&&col.querySelector('select[data-act="add"]');
  ok(sel&&[].some.call(sel.options,function(o){ return o.value==='lbx'; }),'Add product offers Living benefits — Additional');
  if(sel){ sel.value='lbx'; sel.dispatchEvent(new Event('change')); await wait(300); }
  col=document.querySelector('.pbcol[data-t="best"]'); ok(col&&col.querySelectorAll('.lbxpol').length===1,'one policy card after adding');
  var ad=col&&col.querySelector('[data-act="lbxadd"]'); if(ad){ ad.click(); await wait(300); }
  col=document.querySelector('.pbcol[data-t="best"]'); ok(col&&col.querySelectorAll('.lbxpol').length===2,'＋ Add another policy makes two');
  var who=col&&col.querySelector('select[data-f="lb.x.1.who"]'); ok(who&&[].some.call(who.options,function(o){ return /Kit/.test(o.text); }),'the who list names the kids');
  if(who){ who.value='k1'; who.dispatchEvent(new Event('change')); await wait(300); } ok(lbxList(effCfg('best'))[1].who==='k1','picking who saves it');
  col=document.querySelector('.pbcol[data-t="best"]'); var rm=col&&col.querySelector('[data-act="lbxrm"][data-i="0"]'); if(rm){ rm.click(); await wait(300); }
  ok(lbxList(effCfg('best')).length===1&&lbxList(effCfg('best'))[0].who==='k1','✕ removes just that policy');

  /* 4b. Additional on a priced carrier prices itself from the person; carriers outside their ages are greyed out
     (expected figures from data/lb/moo-iule.json and moo-tle-20yr.json, not from the tool) */
  if(LB_RATES.iule){ setup('TX',46,'M'); S.intake.who.spouse=true; S.client.sname='Sam Reyes'; S.client.sage=63; S.intake.ssex='M'; S.intake.kids[0].sex='Male'; S.intake.kids[1].sex='Female'; c=effCfg('best'); c.lb=c.lb||{};
    ok(!lbxCarOK('iule','k0')&&!lbxCarOK('moo','k0')&&!lbxCarOK('americo','k0')&&lbxCarOK('nlg','k0')&&lbxCarOK('other','k0'),'a 10-year-old: only NLG and Other');
    ok(lbxCarOK('iule','k1')&&lbxCarOK('moo','k1'),'a 24-year-old can have IULE and TLE');
    c.lb.x=[{who:'k1',carrier:'iule',face:'50000'},{who:'s',carrier:'iule',face:'25000'},{who:'k1',carrier:'moo',face:'100000'},{who:'k0',carrier:'nlg',face:'50000',ptype:'iul',monthly:'9'}]; pbReprice(); x=prod('lbx');
    ok(x&&Math.abs(x.monthly-(19.46+75.75+17.98+9))<0.005,'priced policies fill in from the tables: '+(x&&x.monthly)+' vs '+(19.46+75.75+17.98+9).toFixed(2));
    c.lb.x=[{who:'k0',carrier:'iule',face:'50000'}]; pbReprice(); ok(!(prod('lbx')&&+prod('lbx').monthly>0)&&/issues ages 18–65/.test(pbWhyNot('lbx',c,'TX',46)),'IULE on a child: refused, says why: '+pbWhyNot('lbx',c,'TX',46));
    c.lb.x=[{who:'several',carrier:'moo',face:'50000'}]; pbReprice(); ok(!(prod('lbx')&&+prod('lbx').monthly>0),'a priced carrier needs one person');
    c.lb.x=[{who:'k0',carrier:'',face:''}]; S.packages.best.dropped=[]; PB_OPEN['best|lbx']=true; goStep('quote'); pbReprice(); await wait(300);
    var cs=document.querySelector('.pbcol[data-t="best"] select[data-f="lb.x.0.carrier"]'), dis=cs?[].filter.call(cs.options,function(o){ return o.disabled; }).map(function(o){ return o.value; }).join(','):'none';
    ok(dis==='moo,americo,iule','the child policy greys out TLE, Americo and IULE: '+dis); }
  /* 5. IUL Express from the rate table (Mutual of Omaha quoter, 10 Nov: TX 46 M non-tobacco $50K = $53.55) */
  if(LB_RATES.iule){ setup('TX',46,'M'); put('p',{carrier:'iule',face:'50000'}); p=prod('lbp');
    ok(p&&p.monthly===53.55&&/indexed universal life \(permanent\)/.test(p.name),'IULE TX 46 M $50K = 53.55: '+(p&&p.name)+' '+(p&&p.monthly));
    setup('FL',46,'M'); put('p',{carrier:'iule',face:'50000'}); ok(prod('lbp')&&prod('lbp').monthly===53.55,'IULE FL = TX');
    setup('MT',46,'F'); put('p',{carrier:'iule',face:'50000'}); ok(prod('lbp')&&prod('lbp').monthly===52.09,'IULE Montana is unisex 52.09: '+(prod('lbp')&&prod('lbp').monthly));
    setup('NY',46,'M'); put('p',{carrier:'iule',face:'50000'}); ok(!(prod('lbp')&&+prod('lbp').monthly>0)&&/not sold in NY/.test(pbWhyNot('lbp',effCfg('best'),'NY',46)),'IULE not sold in NY');
    setup('TX',66,'M'); put('p',{carrier:'iule',face:'50000'}); ok(!(prod('lbp')&&+prod('lbp').monthly>0),'IULE stops at 65');
    setup('TX',46,'M'); put('p',{carrier:'iule',face:'50000'}); chooseTier('best'); em=enrollEmail().body; ok(/Indexed Universal Life \(permanent\) protection with Mutual of Omaha/.test(em)&&!/20-year Living Benefits coverage with Indexed/.test(em),'IULE email says permanent IUL, not 20-year'); }
  else fails.push('LB_RATES.iule not built yet');
  return {fails:fails};
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
  console.log(bad.length ? `LB FAILED ${bad.length}:\n  ` + bad.join('\n  ') : `LB ok - carriers, NLG, IUL Express, additional policies`);
  process.exitCode = bad.length ? 1 : 0;
} catch (e) { console.log('LB FAILED ' + e.message); process.exitCode = 1; }
finally { try { ws && ws.close(); } catch {} chrome.kill(); await sleep(300); fs.rmSync(prof, { recursive: true, force: true }); }
