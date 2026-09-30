// Validates tool/benefits/<product>.json — the benefit schedules behind the builder's ⓘ slide-out.
//   node tools/benefits-check.mjs            every file present
//   node tools/benefits-check.mjs afc sdr    just these
// Checks the shape, that every state whose carrier-library folder holds the product's English
// brochure maps to exactly one brochure entry, that every row has a value for every declared
// column, and that nothing is left as a placeholder.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DIR = new URL('../tool/benefits/', import.meta.url);
const LIB = path.join(os.homedir(), 'Library/CloudStorage/GoogleDrive-jessestamm@gmail.com/My Drive/Optimum Carrier Library/ManhattanLife/States');
// builder key -> carrier-library product folder (null = not a ManhattanLife library product)
const FOLDER = { afc: 'Affordable Choice', sdr: 'Affordable Choice', his: 'Hospital Indemnity Select', acc: '24-Hour Accident',
  gap: 'Out-of-Pocket Protection (Gap)', chas: 'Cancer Heart Attack and Stroke', hhc: 'Home Health Care Enhanced',
  dvh: 'Dental Vision Hearing Select', dvh7016: null /* offered only where Select is not sold: MD MT VA */, lifex: null, triad: null, lb: null };
const SPANISH = /spanish|BRSP|SPBR|BRFSP/i;
const PLACEHOLDER = /\b(TBD|TODO|lorem|xxx|\?\?\?)\b/i;

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL ' + m); } };
const want = process.argv.slice(2);
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(f => f.endsWith('.json')) : [];
const keys = want.length ? want : files.map(f => f.replace(/\.json$/, ''));
ok(keys.length > 0, 'no benefit files found in tool/benefits/');

for (const k of keys) {
  const f = new URL(k + '.json', DIR);
  if (!fs.existsSync(f)) { ok(false, k + ': file missing'); continue; }
  let d; try { d = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { ok(false, k + ': invalid JSON ' + e.message); continue; }
  ok(d.product === k, k + ': product field is ' + d.product);
  ok(typeof d.name === 'string' && d.name, k + ': name');
  ok(d.columns && typeof d.columns.by === 'string' && Array.isArray(d.columns.values) && d.columns.values.length, k + ': columns.by / columns.values');
  const cols = (d.columns && d.columns.values || []).map(String);
  ok(Array.isArray(d.brochures) && d.brochures.length, k + ': brochures[]');
  const seen = new Map();
  for (const b of d.brochures || []) {
    const id = k + '/' + (b.code || '?');
    ok(b.code && b.file, id + ': code and file');
    ok(Array.isArray(b.states) && b.states.length, id + ': states[]');
    for (const s of b.states || []) { ok(!seen.has(s), `${k}: state ${s} in both ${seen.get(s)} and ${b.code}`); seen.set(s, b.code); }
    const secs = b.sameAs ? (d.brochures.find(x => x.code === b.sameAs) || {}).sections : b.sections;
    ok(!b.sameAs || d.brochures.some(x => x.code === b.sameAs && !x.sameAs), id + ': sameAs points at a real, non-alias brochure');
    ok(Array.isArray(secs) && secs.length, id + ': sections[]');
    let rows = 0;
    for (const s of secs || []) {
      ok(s.title, id + ': section title');
      for (const r of s.rows || []) {
        rows++;
        ok(r.label, id + ': row label in ' + s.title);
        const v = r.values || {};
        const vk = Object.keys(v);
        ok(vk.length, `${id}: "${r.label}" has no values`);
        // A multi-carrier brochure (sources per column) may leave a row to one carrier; checked per column below.
        if (!('*' in v) && !b.sources) for (const c of cols) ok(c in v, `${id}: "${r.label}" missing column ${c}`);
        for (const c of vk) ok(c === '*' || cols.includes(c), `${id}: "${r.label}" has unknown column ${c}`);
        for (const x of Object.values(v)) ok(typeof x === 'string' && x.trim() && !PLACEHOLDER.test(x), `${id}: "${r.label}" empty/placeholder value`);
        for (const x of Object.values(v)) ok(!/\$\s*\{/.test(String(x)), `${id}: "${r.label}" has a $ before a {token} (the slide-out adds the $)`);
      }
    }
    ok(rows >= 3, id + ': fewer than 3 benefit rows');
    if (b.sources) for (const c of cols) {
      const src = b.sources[c];
      ok(src && src.code && src.file && src.page != null, `${id}: sources.${c} needs code, file and page`);
      const cr = (secs || []).flatMap(s => s.rows || []).filter(r => r.values && (c in r.values || '*' in r.values));
      ok(cr.length >= 3, `${id}: column ${c} has ${cr.length} rows (want 3+)`);
      ok(cr.filter(r => r.key === true).length >= 3, `${id}: column ${c} has fewer than 3 key rows`);
    }
    const keyRows = (secs || []).reduce((n, s) => n + (s.rows || []).filter(r => r.key === true).length, 0);
    ok(keyRows >= 3 && keyRows <= 10, `${id}: ${keyRows} key rows (want 3-10 so the slide-out opens short)`);
    ok(typeof b.page === 'string' || typeof b.page === 'number' || b.sameAs, id + ': page reference');
  }
  // state coverage against the carrier library
  const folder = FOLDER[k];
  if (folder && fs.existsSync(LIB)) {
    const expect = new Map();
    for (const st of fs.readdirSync(LIB)) {
      const p = path.join(LIB, st, folder);
      if (!fs.existsSync(p)) continue;
      const eng = fs.readdirSync(p).filter(x => x.toLowerCase().endsWith('.pdf') && !SPANISH.test(x));
      if (eng.length) expect.set(st, eng.map(x => x.split(' (')[0]));
    }
    const notOffered = new Set((d.notOffered && d.notOffered.states) || []);
    ok(!d.notOffered || (d.notOffered.reason && [...notOffered].every(st => !seen.has(st))), k + ': notOffered needs a reason and must not overlap mapped states');
    for (const [st, codes] of expect) {
      if (notOffered.has(st)) continue;
      ok(seen.has(st), `${k}: state ${st} sells it (library has ${codes.join(', ')}) but maps to no brochure`);
      if (seen.has(st)) ok(codes.includes(seen.get(st)), `${k}: state ${st} mapped to ${seen.get(st)} but its folder holds ${codes.join(', ')}`);
    }
    for (const st of seen.keys()) ok(expect.has(st), `${k}: state ${st} mapped but has no brochure in the library`);
  }
}
if (!fails) console.log('benefit data checks passed (' + keys.join(', ') + ')');
process.exit(fails ? 1 : 0);
