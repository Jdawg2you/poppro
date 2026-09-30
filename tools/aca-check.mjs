// Checks for POP Pro's ACA section. Run from the repo root:
//   node tools/aca-check.mjs engine     - the estimate engine against its own data, worked by hand here
//   node tools/aca-check.mjs structure  - intake section order and the fields each section must hold
// The engine block sits between ACA-ENGINE:BEGIN/END markers in tool/index.html and is pure,
// so it runs here without a DOM. Expectations are recomputed in this file from the raw data
// table, never read back from the engine.
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../tool/index.html', import.meta.url), 'utf8');
const mode = process.argv[2];
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL ' + msg); } };
const near = (a, b, tol = 0.01) => a != null && b != null && Math.abs(a - b) <= tol;

if (mode === 'engine') {
  const a = html.indexOf('/* ACA-ENGINE:BEGIN */'), b = html.indexOf('/* ACA-ENGINE:END */');
  ok(a > 0 && b > a, 'engine markers present');
  const ctx = {}; vm.createContext(ctx); vm.runInContext(html.slice(a, b), ctx);
  const D = ctx.ACA26;
  ok(D && D.states, 'ACA26 data loaded');

  // Coverage: every state + DC has a bronze and a benchmark figure.
  const ST = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
  const missing = ST.filter(s => !(D.states[s] && D.states[s].bronze40 > 0 && D.states[s].silver40 > 0));
  ok(missing.length === 0, 'bronze40 and silver40 for all 51: missing ' + missing.join(','));

  const fed = D.ageCurve.federal, F = age => age <= 14 ? fed['0-14'] : age >= 64 ? fed['64'] : fed[String(age)];
  const E = o => ctx.acaEstimateCore(o);
  const tx = D.states.TX;

  // 1. A single 40-year-old is the state average itself.
  let r = E({ st: 'TX', people: [{ age: 40, role: 'p' }], income: 0 });
  ok(r.ok && near(r.bronze, tx.bronze40), 'TX 40 single bronze = state average');
  // 2. Age curve: 64-year-old = average x F(64)/F(40).
  r = E({ st: 'TX', people: [{ age: 64, role: 'p' }] });
  ok(near(r.bronze, tx.bronze40 * F(64) / F(40)), 'TX 64 bronze follows the age curve');
  // 3. Couple adds both people.
  r = E({ st: 'TX', people: [{ age: 45, role: 'p' }, { age: 43, role: 's' }] });
  ok(near(r.bronze, tx.bronze40 * (F(45) + F(43)) / F(40)), 'TX couple 45/43 sums both');
  // 4. Only the three oldest children under 21 are charged.
  const kids = [16, 12, 9, 5, 2].map(age => ({ age, role: 'k' }));
  r = E({ st: 'TX', people: [{ age: 40, role: 'p' }, ...kids] });
  ok(near(r.bronze, tx.bronze40 * (F(40) + F(16) + F(12) + F(9)) / F(40)), 'three-oldest-children cap');
  ok(r.size === 6 && r.charged === 4, 'household size 6, charged 4');
  // 5. Subsidy at a middle income, worked by hand from the tables.
  const fplLine = n => D.fpl2025.contiguous.base + D.fpl2025.contiguous.perPerson * (n - 1);
  const inc = Math.round(fplLine(2) * 2.5);                // 250% FPL, couple
  r = E({ st: 'TX', people: [{ age: 45, role: 'p' }, { age: 43, role: 's' }], income: inc });
  const band = D.applicablePct2026.find(x => 250 >= x.fromFPL && 250 < (x.toFPL == null ? Infinity : x.toFPL));
  const pct = band.toFPL == null || band.startPct === band.endPct ? band.startPct
    : band.startPct + (band.endPct - band.startPct) * (250 - band.fromFPL) / (band.toFPL - band.fromFPL);
  const bench = tx.silver40 * (F(45) + F(43)) / F(40);
  const want = Math.max(0, bench - inc * pct / 100 / 12);
  ok(near(r.fpl, 250, 0.05), 'FPL % computed (' + r.fpl + ')');
  ok(near(r.subsidy, want, 0.05), 'subsidy = benchmark - expected contribution (' + r.subsidy + ' vs ' + want + ')');
  // 6. The 400% cliff.
  r = E({ st: 'TX', people: [{ age: 60, role: 'p' }], income: Math.round(fplLine(1) * 4.2) });
  if (D.subsidyCliff400) ok(r.subsidy === 0 && r.flags.includes('cliff'), 'over 400% FPL: no subsidy, cliff flag');
  // 7. Medicaid range in an expansion state, coverage gap in a non-expansion state.
  const expState = ST.find(s => !D.nonExpansionStates.includes(s) && s !== 'AK' && s !== 'HI');
  r = E({ st: expState, people: [{ age: 30, role: 'p' }], income: Math.round(fplLine(1) * 1.2) });
  ok(r.subsidy === 0 && r.flags.includes('medicaid'), 'expansion state under 138%: Medicaid flag (' + expState + ')');
  const nonExp = D.nonExpansionStates[0];
  r = E({ st: nonExp, people: [{ age: 30, role: 'p' }], income: Math.round(fplLine(1) * 0.8) });
  ok(r.flags.includes('gap'), 'non-expansion under 100%: coverage-gap flag (' + nonExp + ')');
  r = E({ st: nonExp, people: [{ age: 30, role: 'p' }], income: Math.round(fplLine(1) * 1.2) });
  ok(r.subsidy > 0 || r.subsidy === 0 && !r.flags.includes('medicaid'), 'non-expansion at 120%: marketplace, not Medicaid');
  // 8. Typed value wins; blank falls back.
  ok(ctx.acaPick('512.40', 400).v === 512.4 && ctx.acaPick('512.40', 400).src === 'typed', 'typed figure wins');
  ok(ctx.acaPick('', 400).v === 400 && ctx.acaPick(null, 400).src === 'est', 'blank uses estimate');
  // 9. No state / no age fails soft with a reason.
  ok(E({ st: '', people: [{ age: 40, role: 'p' }] }).ok === false, 'no state -> not ok');
  ok(E({ st: 'TX', people: [{ age: '', role: 'p' }] }).ok === false, 'no age -> not ok');
  // 10. Family deductible and MOOP.
  r = E({ st: 'TX', people: [{ age: 45, role: 'p' }, { age: 43, role: 's' }] });
  const moF = Math.min(D.bronze.avgMoop * 2, D.moop2026.family), moS = Math.min(D.bronze.avgMoop, D.moop2026.self);
  ok(r.oop === moF && E({ st: 'TX', people: [{ age: 45, role: 'p' }] }).oop === moS, 'MOOP: typical bronze, family x2, never over the legal limit');
  ok(r.ded === D.bronze.avgDeductible * 2, 'family deductible = 2 x individual');
  // 11. Community-rated states ignore age.
  for (const st of D.communityRated || []) {
    const y = E({ st, people: [{ age: 25, role: 'p' }] }), o = E({ st, people: [{ age: 60, role: 'p' }] });
    ok(near(y.bronze, o.bronze) && near(y.bronze, D.states[st].bronze40), st + ' community rated: same price at 25 and 60');
  }
  // 12. Cost sharing: brand drugs sit inside a met deductible; the OOP max caps it.
  const CS = a => ctx.acaCostShare(a).cs;
  ok(CS({ ded: 7000, oop: 9950, med: 100, medDed: 100, visits: 0, copay: 0, fullded: true }) === 7000, 'brand $1,200/yr inside a $7,000 met deductible');
  ok(CS({ ded: 7000, oop: 9950, med: 125, medDed: 100, visits: 4, copay: 50, fullded: true }) === 7000 + 300 + 200, 'generic $25/mo + 4 visits on top of the deductible');
  ok(CS({ ded: 7000, oop: 9950, med: 900, medDed: 900, visits: 0, copay: 0, fullded: true }) === 9950, 'capped at the out-of-pocket max');
  ok(CS({ ded: 7000, oop: 9950, med: 100, medDed: 100, visits: 0, copay: 0, fullded: false }) === 1200, 'deductible not assumed: only the drug spend');
  // 13. Savings against the anchor (worked: anchor premium incl. drugs $2,000, true cost $2,450).
  const A = { prem: 2000, mo: 2450 };
  let sv = ctx.anchorSavings(A, 1800);
  ok(sv.actual === 200 && sv.tru === 650 && sv.tfra === 200 && sv.tfraBasis === 'premium', 'saves on premium: TFRA room = premium saving');
  ok(ctx.anchorSavings(A, 1800, 1900).tru === 550 && ctx.anchorSavings(A, 1800, 1900).tfra === 200, 'package true cost used for true savings; TFRA still premium-only');
  sv = ctx.anchorSavings(A, 2090);
  ok(sv.actual === -90 && sv.tru === 360 && sv.tfra === 0 && sv.tfraBasis === '', 'costs $90 more on premium: no TFRA room, even though it saves on true cost');
  sv = ctx.anchorSavings(A, 2600);
  ok(sv.actual === -600 && sv.tru === -150 && sv.tfra === 0, 'costs more both ways: no TFRA room');
  ok(ctx.anchorSavings(null, 1800) === null, 'no anchor: no savings');
  if (!fails) console.log('ACA engine checks passed');
} else if (mode === 'structure') {
  const order = ['sec_meds', 'sec_conds', 'sec_health', 'sec_docs', 'sec_curins', 'sec_aca', 'sec_budget'];
  const pos = order.map(id => html.indexOf('id="' + id + '"'));
  ok(pos.every(p => p > 0), 'all sections present: ' + order.filter((_, i) => pos[i] < 0).join(','));
  ok(pos.every((p, i) => i === 0 || p > pos[i - 1]), 'section order ' + order.join(' > '));
  const between = (a, b) => html.slice(html.indexOf('id="' + a + '"'), html.indexOf('id="' + b + '"'));
  const docs = between('sec_docs', 'sec_curins'), cur = between('sec_curins', 'sec_aca'), aca = between('sec_aca', 'sec_budget');
  const fin = html.indexOf('Finances &amp; Retirement');
  ok(fin > html.indexOf('id="sec_aca"') && fin < html.indexOf('id="sec_budget"'), 'finances sit between ACA and budget');
  ok(docs.includes('id="in_visits"'), 'visits asked in Doctors');
  for (const id of ['in_carrier', 'in_plan', 'in_cur_prem', 'in_cur_emp', 'in_cur_ded', 'in_cur_oop', 'in_cur_copay', 'in_cur_isaca', 'in_cur_show'])
    ok(cur.includes('id="' + id + '"'), 'current insurance has ' + id);
  for (const bad of ['subsidy', 'in_prem"', 'in_ded_sel', 'HealthSherpa'])
    ok(!cur.includes(bad), 'current insurance holds no ACA field: ' + bad);
  for (const id of ['in_aca_status', 'in_aca_show', 'acaRows', 'acaBasis', 'acaTrueMo', 'acaTrueYr', 'in_aca_fullded'])
    ok(aca.includes('id="' + id + '"'), 'ACA section has ' + id);
  ok(/value="outside"/.test(aca) && /value="onaca"/.test(aca), 'ACA status offers outside and on-ACA');
  const bud = html.slice(html.indexOf('id="sec_budget"'), html.indexOf('id="sec_budget"') + 1500);
  ok(bud.includes('id="in_budget_comfort"') && bud.includes('id="in_budget"'), 'budget has comfortable and max');
  for (const gone of ['id="in_health"', 'id="in_shealth"', 'in_subsidy', 'id="in_prem"', 'id="in_oop"', 'id="in_copay"', 'effDed(', 'S.acaEdited'])
    ok(!html.includes(gone), 'removed: ' + gone);
  const mh = html.slice(html.indexOf('<div class="medhead">'), html.indexOf('<div class="medhead">') + 600);
  const cols = ['>Medication<', '>Rx<', '>ACA copay<', '>Current copay<', '>Discount<'].map(t => mh.indexOf(t));
  ok(cols.every((p, i) => p > 0 && (i === 0 || p > cols[i - 1])), 'medication columns: Medication, Rx, ACA copay, Current copay, Discount');
  ok(/id="medTotalCur"/.test(html), 'current copay total shown');
  for (const gone of ['sayico', 'openScript', 'SCRIPT_BEATS', 'managePlansBtn', 'planModal', 'MASTER_SHEET_CSV_URL', 'defLibrary', 'S.defaults'])
    ok(!html.includes(gone), 'removed: ' + gone);
  const intro = html.slice(html.indexOf('class="introbar"'), html.indexOf('id="sec_who"'));
  ok(intro.includes('href="https://script.ffloptimum.com/"') && intro.includes('Health Discovery'), 'intake top: Script Navigator button naming Health Discovery');
  ok(intro.includes('id="howBtn"') && html.includes('id="howModal"'), 'intake top: How to use this tool');
  const bud2 = html.slice(html.indexOf('id="sec_budget"'), html.indexOf('id="sec_budget"') + 2500);
  const an = bud2.slice(bud2.indexOf('id="in_anchor"'), bud2.indexOf('</select>', bud2.indexOf('id="in_anchor"')));
  const ov = [...an.matchAll(/<option value="([a-z]+)"( selected)?>([^<]+)</g)].map(m => m[1] + ':' + m[3]);
  ok(ov.join('|') === 'aca:ACA bronze|cur:Current plan|none:No anchor', 'anchor options in order, ACA first (default): ' + ov.join('|'));
  ok(!/selected/.test(an), 'no other option pre-selected over ACA bronze');
  ok(html.includes("'No savings figures — the quote just compares the Good, Better and Best packages with each other.'"), 'no-anchor explanation present');
  ok(html.includes('class="pbsave"') && html.includes('Room for a TFRA'), 'builder savings row per column');
  ok(html.includes("S.intake.anchor=$('in_anchor').value||'aca'"), 'anchor defaults to ACA when unset');
  ok(html.includes('data-act="inc"') && /S\.include\[t\]=x\.checked/.test(html), 'builder Show-on-quote tick wired to S.include');
  ok(!html.includes('<div class="po-navy">'), 'printout no longer builds the navy savings box');
  ok(html.includes("'your marketplace plan':'your current plan'"), 'per-plan savings name the anchor');
  ok(html.includes('id="tfraHint"') && html.includes('Fund a portion, not all of it'), 'TFRA hint');
  for (const id of ['b_er', 'b_amb', 'b_acc', 'b_dx', 'r_type', 'r_count', 'evMajor', 'evEveryday']) ok(html.includes('id="' + id + '"'), 'event input/output ' + id);
  for (const gone of ['id="b_daily"', 'id="b_adm"', 'id="b_his"', 'id="b_other"', 'id="r_pay"', 'id="r_aca"']) ok(!html.includes(gone), 'hand-typed field removed: ' + gone);
  ok(/body\.client #printout\{display:block/.test(html), 'Client View shows the presentation');
  if (!fails) console.log('intake structure checks passed');
} else if (mode === 'benefits') {
  const a = html.indexOf('/* ACA-ENGINE:BEGIN */'), b = html.indexOf('/* ACA-ENGINE:END */');
  const ctx = {}; vm.createContext(ctx); vm.runInContext(html.slice(a, b), ctx);
  const D = { product: 'x', name: 'Test', columns: { by: 'level', values: ['Lo', 'Hi'] }, brochures: [
    { code: 'BASE', states: ['TX', 'OK'], page: '2', sections: [
      { title: 'Doctor', rows: [ { label: 'Visits', key: true, values: { Lo: '$50 x 3', Hi: '$75 x 5' } }, { label: 'Wellness', values: { '*': '$100' } } ] },
      { title: 'Hospital', rows: [ { label: 'Per stay', key: true, values: { '*': '{his.ben} per stay' } }, { label: 'Outpatient', when: 'his.outp>0', values: { '*': '{his.outp}' } } ] } ],
      notes: ['12-month pre-existing'] },
    { code: 'FLX', states: ['FL'], page: '1', sections: [ { title: 'Doctor', rows: [ { label: 'Visits', key: true, values: { Lo: '$40 x 2', Hi: '$60 x 4' } } ] } ] },
    { code: 'ALIAS', states: ['GA'], sameAs: 'BASE' } ] };
  const cfg = { his: { ben: 5000, outp: 0 } };
  ok(ctx.benBrochure(D, 'tx').code === 'BASE', 'state picks its own brochure (case-insensitive)');
  ok(ctx.benBrochure(D, 'FL').code === 'FLX', 'FL gets its own brochure');
  ok(ctx.benBrochure(D, 'GA').sections.length === 2 && ctx.benBrochure(D, 'GA').code === 'ALIAS', 'sameAs resolves the shared tables, keeps its own code');
  ok(ctx.benBrochure(D, 'NY') === null, 'no brochure for an unsold state');
  let m = ctx.benModel(D, 'TX', 'Lo', cfg);
  ok(m.key.length === 2 && m.key[0].value === '$50 x 3' && m.key[1].value === '$5,000 per stay', 'key rows first, column picked, token filled');
  ok(m.sections.length === 1 && m.sections[0].rows.length === 1 && m.sections[0].rows[0].label === 'Wellness', 'non-key rows in sections; outpatient hidden when outp is 0');
  m = ctx.benModel(D, 'TX', 'Lo', { his: { ben: 5000, outp: 1000 } });
  ok(m.sections.some(s => s.rows.some(r => r.label === 'Outpatient' && r.value === '$1,000')), 'when-row appears once the option is on');
  const lo = ctx.benModel(D, 'TX', 'Lo', cfg), hi = ctx.benModel(D, 'TX', 'Hi', cfg), cmp = ctx.benCompare(lo, hi);
  const v = cmp.find(r => r.label === 'Visits'), w = cmp.find(r => r.label === 'Wellness');
  ok(v.diff && v.a === '$50 x 3' && v.b === '$75 x 5' && !w.diff, 'compare marks the difference, not the sameness');
  ok(ctx.benWhen('gap.ea>0', { gap: { ea: 1 } }) && !ctx.benWhen('gap.ea>0', { gap: { ea: 0 } }), 'when expressions');
  // Positive control on the real page: every builder row that should have an ⓘ maps to a data file name.
  ok(/BEN_FILE=\{afc:'afc',sdr:'sdr',his:'his',acc:'acc',gap:'gap',chas:'chas',hhc:'hhc',dvh:'dvh',lbp:'lb',lbs:'lb'\}/.test(html), 'row -> data file map covers every product row');
  if (!fails) console.log('benefit drawer checks passed');
} else if (mode === 'events') {
  const a = html.indexOf('/* ACA-ENGINE:BEGIN */'), b = html.indexOf('/* ACA-ENGINE:END */');
  const ctx = {}; vm.createContext(ctx); vm.runInContext(html.slice(a, b), ctx);
  // Real TX Classic Plus rows (AFC7010-BR_0424), read from the benefit data, not typed here.
  const afcD = JSON.parse(fs.readFileSync(new URL('../tool/benefits/afc.json', import.meta.url), 'utf8'));
  const m = ctx.benModel(afcD, 'TX', 'ClassicPlus', {});
  const rows = m.key.concat(...m.sections.map(s => s.rows));
  const n = ctx.afcEventNums(rows);
  const find = re => ctx.evMoney((rows.find(r => re.test(r.label)) || {}).value);
  ok(n.daily === find(/^Inpatient Hospital Confinement \(per/) && n.daily > 0, 'AFC daily parsed from the TX brochure (' + n.daily + ')');
  ok(n.adm === find(/^Hospital Admission/) && n.er === find(/^Emergency Room/) && n.visit > 0 && n.visitN > 0, 'AFC admission / ER / visit parsed');
  // Major: 3 days through the ER, $20,000 after discount.
  let r = ctx.evMajor({ bal: 20000, days: 3, er: 1, afc: n, his: { ben: 5000, amb: 1 }, gap: { daily: 100, adm: 2500, ea: 1 } });
  const want = n.daily * 3 + n.adm + n.er + 5000 + 2500 + 100 * 3;
  ok(Math.abs(r.pays - want) < 0.01 && Math.abs(r.net - (20000 - want)) < 0.01, 'major: AFC days+admission+ER, HIS once, Gap admission+days (' + r.pays + ' vs ' + want + ')');
  r = ctx.evMajor({ bal: 20000, days: 14, gap: { daily: 200, adm: 5000, ea: 0 } });
  ok(r.pays === 5000 + 200 * 10, 'Gap daily capped at 10 days');
  r = ctx.evMajor({ bal: 20000, days: 2, accU: 2, acc: 0 });
  ok(r.pays === 0, 'accident plan pays nothing when the event is not an accident');
  r = ctx.evMajor({ bal: 20000, days: 2, accU: 2, acc: 1 });
  ok(r.pays === 4000 + 300 * 2, 'accident: medical up to $2,000/unit + $150/unit/day');
  r = ctx.evMajor({ bal: 20000, days: 0, chas: { cancer: 20000, hs: 10000 }, dx: 'stroke' });
  ok(r.pays === 10000, 'CHAS pays the heart & stroke amount for a stroke');
  r = ctx.evMajor({ bal: 20000, days: 3, major: { oop: 7350 }, his: { ben: 4000, amb: 0 } });
  ok(r.owe0 === 7350 && r.net === 3350, 'Cigna base: client share capped at its OOP, HI Select offsets it');
  // Everyday
  r = ctx.evEveryday({ type: 'visit', charge: 200, count: 12, afc: n });
  ok(r.pays === n.visit * Math.min(12, n.visitN), 'doctor visits limited to the plan\'s days per year');
  r = ctx.evEveryday({ type: 'osurg', charge: 6000, count: 1, afc: n, hisOutp: 1000, gapOutp: 2000 });
  ok(r.pays === Math.min(n.osurg, n.outLimit || Infinity) + 1000 + 2000, 'outpatient surgery: AFC ambulatory + HIS outpatient + Gap outpatient');
  r = ctx.evEveryday({ type: 'visit', charge: 200, count: 3, major: { visit: 45 } });
  ok(r.owe0 === 135, 'Cigna visit copays');
  // Anchor
  ok(ctx.evAnchorOwe('major', 20000, { oop: 9950 }) === 9950, 'ACA: capped at its out-of-pocket max');
  ok(ctx.evAnchorOwe('everyday', 600, { oop: 9950, visit: 50 }, 'visit', 3) === 150 && ctx.evAnchorOwe('everyday', 6000, { oop: 9950, visit: 50 }, 'osurg', 1) === 6000, 'ACA everyday: visit copay vs full charge before the deductible');
  // Medical Bill Saver: a Manhattan bill is negotiated down; major medical is not touched; 0 = off.
  r = ctx.evMajor({ bal: 20000, days: 3, afc: n, negotPct: 40 });
  ok(r.negotiated === 12000 && r.owe0 === 12000 && Math.abs(r.net - (12000 - r.pays)) < 0.01, 'negotiation lowers a Manhattan bill (40% of $20,000 -> $12,000)');
  ok(ctx.evMajor({ bal: 20000, days: 3, major: { oop: 7350 }, negotPct: 40 }).negotiated === null, 'negotiation never applies to major medical');
  ok(ctx.evMajor({ bal: 20000, days: 3, afc: n, negotPct: 0 }).owe0 === 20000, 'no percentage = no negotiation');
  r = ctx.evEveryday({ type: 'osurg', charge: 7595, count: 1, afc: n, negotPct: 40 });
  ok(r.negotiated === 4557 && Math.abs(r.net - (4557 - r.pays)) < 0.01, 'everyday: negotiation lowers the Manhattan bill, benefits unchanged');
  ok(ctx.evEveryday({ type: 'visit', charge: 150, count: 2, major: { visit: 45 }, negotPct: 40 }).negotiated === null, 'everyday: no negotiation on major medical');
  // ACA: per-person deductible, then coinsurance, capped at the out-of-pocket limit.
  const Aca = { oop: 9950, ded: 7476, coins: 50 };
  ok(ctx.evAnchorOwe('major', 5000, Aca) === 5000, 'bill under the deductible: they pay all of it');
  ok(ctx.evAnchorOwe('major', 10000, Aca) === 7476 + 0.5 * 2524, 'mid-size bill: deductible + 50% of the rest (' + ctx.evAnchorOwe('major', 10000, Aca) + ')');
  ok(ctx.evAnchorOwe('major', 22913.23, Aca) === 9950, 'large bill: capped at the per-person limit');
  r = ctx.evEveryday({ type: 'er', charge: 2209, count: 1, afc: n, acc: 1, accU: 1, gapEa: 1 });
  ok(r.pays === Math.min(n.er, n.outLimit || Infinity) + 2000 + 250, 'everyday broken arm: AFC ER + accident medical (capped $2,000/unit) + Gap ER accident');
  ok(ctx.evEveryday({ type: 'er', charge: 2209, count: 1, afc: n, acc: 0, accU: 1, gapEa: 1 }).pays === Math.min(n.er, n.outLimit || Infinity), 'no accident: accident plan and Gap ER pay nothing');
  if (!fails) console.log('event checks passed');
} else if (mode === 'pop') {
  const a = html.indexOf('/* ACA-ENGINE:BEGIN */'), b = html.indexOf('/* ACA-ENGINE:END */');
  const ctx = {}; vm.createContext(ctx); vm.runInContext(html.slice(a, b), ctx);
  const afcD = JSON.parse(fs.readFileSync(new URL('../tool/benefits/afc.json', import.meta.url), 'utf8'));
  const triD = JSON.parse(fs.readFileSync(new URL('../tool/benefits/triad.json', import.meta.url), 'utf8'));
  const flat = m => m.key.concat(...m.sections.map(s => s.rows));
  const afc = (st, L) => ctx.afcEventNums(flat(ctx.benModel(afcD, st, L, {})));
  const tri = flat(ctx.benModel(triD, 'TX', 'Triad Cigna 3500', {})), tget = re => (tri.find(r => re.test(r.label)) || {}).value;
  const cigna = { oop: ctx.evMoneyAll(tget(/^Out-of-pocket maximum/i))[0], ded: ctx.evMoney(tget(/^Calendar-year deductible/i)), coins: 20, visit: ctx.evMoney(tget(/^Primary care visit/i)), urgent: ctx.evMoney(tget(/^Urgent care/i)) };
  const best = st => ({ afcLevel: 'ElitePlus', afc: afc(st, 'ElitePlus'), his: { ben: 10000, amb: 1 }, hisOutp: 1500, gap: { daily: 200, adm: 6350, ea: 1 }, gapOutp: 3000 });
  const two = f => ({ adults: 2, faces: [f, f] });
  // Builder defaults (TIERCFG), couple aged 48/45 - Jesse's example.
  const pkg = (st, o) => Object.assign({ best: best(st), avail: { sdr: true, hhc: st !== 'FL', dvh: true } }, o);
  const essential = st => pkg(st, { afcLevel: 'ClassicPlus', afc: afc(st, 'ClassicPlus'), his: { ben: 10000, amb: 1 }, hisOutp: 0, gap: { daily: 100, adm: 2500, ea: 0 }, gapOutp: 0, accU: 1, lb: two(0).faces && { adults: 2, faces: [] } });
  const maxed = st => pkg(st, { afcLevel: 'ElitePlus', afc: afc(st, 'ElitePlus'), his: { ben: 10000, amb: 1 }, hisOutp: 1500, gap: { daily: 200, adm: 6350, ea: 1 }, gapOutp: 3000, accU: 2, chas: { cancer: 20000, hs: 10000 }, dvhMax: '5000', hhc: st !== 'FL' ? 'Deluxe' : null, lb: two(50000) });
  const W = o => ctx.popWeightsFrom(Object.assign({ age: 48, family: true }, o));
  const sc = (x, wo) => ctx.popRawFrom(ctx.popStrengthsFrom(x), W(wo || {}));
  const top = st => pkg(st, { afcLevel: 'ElitePlus', afc: afc(st, 'ElitePlus'), his: { ben: 10000, amb: 1 }, hisOutp: 1500, gap: { daily: 200, adm: 6350, ea: 1 }, gapOutp: 3000, accU: 2, chas: { cancer: 75000, hs: 75000 }, sdr: st === 'FL', sdrCfg: st === 'FL' ? { max: '500000', ded: '25000' } : null, dvhMax: '5000', hhc: st !== 'FL' ? 'Deluxe' : null, lb: two(50000), avail: { sdr: st === 'FL', hhc: st !== 'FL', dvh: true } });
  const comp = st => pkg(st, { afcLevel: 'ElitePlus', afc: afc(st, 'ElitePlus'), his: { ben: 10000, amb: 1 }, hisOutp: 1000, gap: { daily: 200, adm: 5000, ea: 1 }, gapOutp: 1000, accU: 2, chas: { cancer: 20000, hs: 10000 }, lb: two(50000), avail: { sdr: false, hhc: true, dvh: true } });
  const ex = (x, wo) => ctx.popExact(ctx.popStrengthsFrom(x), W(wo || {}));
  const T = sc(top('TX')), TF = sc(top('FL')), C = sc(comp('TX')), E = sc(essential('TX')), M = sc(maxed('TX')), MF = sc(maxed('FL'));
  console.log('   essential ' + E + ' · comprehensive default ' + C + ' · top build TX ' + T + ' / FL ' + TF);
  ok(T === 100 && TF === 100, 'every product at its top level = 100 (TX ' + T + ', FL ' + TF + ')');
  ok(C >= 88 && C <= 94, 'Comprehensive default ~90 before dental (' + C + ')');
  const CD = sc(Object.assign(comp('TX'), { dvhMax: '3000' }));
  ok(CD - C >= 5, 'adding dental is worth 5+ points (' + C + ' -> ' + CD + ')');
  ok(M < 100, 'anything short of the top build stays under 100 (' + M + ')');
  const c0 = ex(comp('TX')), c1 = ex(Object.assign(comp('TX'), { hisOutp: 1500 })), c2 = ex(Object.assign(comp('TX'), { hisOutp: 1500, gapOutp: 3000 })), c3 = ex(Object.assign(comp('TX'), { hisOutp: 1500, gapOutp: 3000, gap: { daily: 200, adm: 6350, ea: 1 } }));
  ok(c1 > c0 && c2 > c1 && c3 > c2, 'HIS outpatient 1,500, Gap outpatient 3,000, admission 6,350 each raise it (' + [c0, c1, c2, c3].map(v => v.toFixed(2)).join(' -> ') + ')');
  ok(MF >= 94, 'FL near-top build not marked down for Home Health Care it cannot buy (' + MF + ')');
  ok(E >= 44 && E <= 52, 'Essential default scores 44-52 (' + E + ')');
  const eE = ex(essential('TX'));
  const up = (o, lab) => { const s1 = ex(Object.assign(essential('TX'), o)); ok(s1 > eE, lab + ' raises Essential (' + eE.toFixed(2) + ' -> ' + s1.toFixed(2) + ')'); };
  up({ lb: two(25000) }, 'living benefits'); up({ gap: { daily: 200, adm: 5000, ea: 0 } }, 'Out-of-Pocket up a notch'); up({ gapOutp: 1000 }, 'Out-of-Pocket outpatient'); up({ accU: 2 }, 'accident 2 units'); up({ hisOutp: 1000 }, 'HI Select outpatient');
  ok(sc(Object.assign(maxed('TX'), { lb: two(25000) })) < M, '$50K living benefits beat $25K');
  const tE = ex(top('TX')), dHIS = tE - ex(Object.assign(top('TX'), { his: null, hisOutp: 0 })), dLB1 = ex(top('TX'), {}) - ex(Object.assign(top('TX'), { lb: { adults: 2, faces: [50000] } }));
  ok(dHIS >= 10, 'removing HI Select from the top build costs 10+ points (' + dHIS.toFixed(1) + ')');
  ok(dHIS >= dLB1, 'HI Select weighs at least as much as one adult\'s living benefits (' + dHIS.toFixed(1) + ' vs ' + dLB1.toFixed(1) + ')');
  const noLB = sc(Object.assign(maxed('TX'), { lb: { adults: 2, faces: [] } }));
  ok(M - noLB >= 8, 'dropping living benefits costs >= 8 (' + (M - noLB) + ')');
  const mFH = sc(maxed('TX'), { famheart: true });
  const dLB = ex(maxed('TX')) - ex(Object.assign(maxed('TX'), { lb: { adults: 2, faces: [] } })), dLBfh = ex(maxed('TX'), { famheart: true }) - ex(Object.assign(maxed('TX'), { lb: { adults: 2, faces: [] } }), { famheart: true });
  ok(dLBfh > dLB, 'dropping LB costs more with family heart history (' + dLB.toFixed(1) + ' vs ' + dLBfh.toFixed(1) + ')');
  const noH = sc(Object.assign(maxed('TX'), { chas: { cancer: 20000, hs: 0 } })), noHfh = sc(Object.assign(maxed('TX'), { chas: { cancer: 20000, hs: 0 } }), { famheart: true });
  ok(M - noH >= 3 && (mFH - noHfh) > (M - noH) + 3, 'heart & stroke gap: problematic, really problematic with history (' + (M - noH) + ' vs ' + (mFH - noHfh) + ')');
  const withSdr = sc(Object.assign(maxed('TX'), { sdr: true })), mFC = sc(maxed('TX'), { famcancer: true }), withSdrFC = sc(Object.assign(maxed('TX'), { sdr: true }), { famcancer: true });
  ok(withSdr - M <= 3, 'missing SDR costs <= 3 under 55 with no history (' + (withSdr - M) + ')');
  ok(withSdrFC - mFC >= 5, 'missing SDR costs >= 5 with a cancer history (' + (withSdrFC - mFC) + ')');
  const cigBase = { major: cigna, base: 'triad', his: { ben: 4000, amb: 1 }, chas: { cancer: 20000, hs: 10000 }, lb: two(50000), best: best('TX'), avail: { sdr: true, hhc: true, dvh: true } };
  const cig = sc(cigBase, { major: true }), cigFull = sc(Object.assign({}, cigBase, { hisOutp: 1500, dvhMax: '3000' }), { major: true });
  console.log('   cigna + HIS + LB + CHAS ' + cig + ' · fully built ' + cigFull);
  ok(cig >= 84, 'Cigna + HI Select + LB + CHAS is strong (' + cig + ')');
  ok(cigFull >= 88 && cigFull > cig, 'Cigna with outpatient rider + dental scores high (' + cigFull + ')');
  for (const k of ['his', 'gap', 'accU', 'chas', 'dvhMax', 'lb', 'hhc']) { const x = maxed('TX'); delete x[k]; ok(sc(x) <= M, 'removing ' + k + ' never raises the score'); }
  if (!fails) console.log('pop score checks passed');
} else {
  console.log('usage: node tools/aca-check.mjs engine|structure|benefits|events|pop'); process.exit(2);
}
process.exit(fails ? 1 : 0);
