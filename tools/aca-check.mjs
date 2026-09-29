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
  if (!fails) console.log('intake structure checks passed');
} else {
  console.log('usage: node tools/aca-check.mjs engine|structure'); process.exit(2);
}
process.exit(fails ? 1 : 0);
