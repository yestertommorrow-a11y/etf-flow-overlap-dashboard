// Smoke test for the ETF dashboard's Volatility tab.
//   node tools/vol_smoke_test.mjs
// Checks the inline script parses, the CSV/snapshot readers normalise prices,
// and all eight estimators produce finite numbers on a 755-session file.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

let pass = 0;
const ok = (cond, label, extra = '') => { if (!cond) { console.error(`FAIL  ${label}${extra ? ' — ' + extra : ''}`); process.exitCode = 1; } else { pass++; console.log(`ok    ${label}${extra ? ' — ' + extra : ''}`); } };

// 1. the whole inline script parses
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
ok(scripts.length === 1, 'one inline script block');
try { new Function(scripts[0]); ok(true, 'inline script parses'); } catch (e) { ok(false, 'inline script parses', e.message); }

// 2. pull out the two pure readers and the formula block
const between = (start, end) => {
  const a = html.indexOf(start), b = html.indexOf(end);
  if (a < 0 || b < 0) throw new Error(`markers not found: ${start}`);
  return html.slice(a, b);
};
const readers = new Function(between('  // ---------- input: daily OHLC CSV', '  function volEstimatorOptions')
  + '\nreturn { parseOhlc, parseSnapshot };')();
const formulas = new Function(between('// >>> volatility formulas', '// <<< volatility formulas')
  + '\nreturn { computeVol, vMean, vStd, vQuantile };')();

// 3. a real Yahoo-format CSV
const csvPath = process.argv[2] || 'C:/Users/yeste/volatility-trading/tests/JPM.csv';
if (fs.existsSync(csvPath)) {
  const rows = readers.parseOhlc(fs.readFileSync(csvPath, 'utf8'), 'JPM.csv');
  ok(rows.length > 700, 'CSV rows parsed', String(rows.length));
  ok(rows[0].d < rows[rows.length - 1].d, 'CSV sorted ascending', `${rows[0].d} → ${rows[rows.length - 1].d}`);
  // the repo's own test CSV has Adj Close / Close disagreeing so Close sits outside
  // High-Low: the parser must report that, never clamp High/Low to hide it.
  ok(rows.inconsistent > 0, 'CSV OHLC inconsistencies reported, not clamped', `${rows.inconsistent} rows`);
  ok(rows.every(r => r.h >= r.l), 'CSV High ≥ Low after swap');
  ok(rows.some(r => r.c > r.h || r.c < r.l), 'CSV Close left outside High-Low (not clamped)');
  ok(rows.adjusted === true, 'CSV Adj Close applied to O/H/L');
} else {
  console.log(`skip  ${csvPath} not found (pass a Yahoo CSV as argv[2])`);
}

// 4. close-only CSV: raw estimators still work, range ones are flagged
const closeRows = readers.parseOhlc('Date,Close\n' + Array.from({ length: 160 }, (_, i) => {
  const d = new Date(Date.UTC(2023, 0, 2) + i * 864e5);
  return `${d.toISOString().slice(0, 10)},${(100 + Math.sin(i / 4) * 5).toFixed(2)}`;
}).join('\n'), 'close.csv');
ok(closeRows.partial === true, 'close-only CSV flagged partial');
ok(closeRows.length >= 120, 'close-only CSV rows', String(closeRows.length));

// 5. every estimator produces values on clean synthetic OHLC (all eight need coverage)
const synth = [];
{
  let price = 100;
  for (let i = 0; i < 240; i++) {
    const drift = Math.sin(i / 9) * 0.4 + Math.cos(i / 23) * 0.3;
    const o = price, c = Math.max(1, price * (1 + drift / 100));
    const rng = Math.abs(drift) / 100 + 0.004 + 0.002 * Math.abs(Math.sin(i / 5));
    synth.push({ d: new Date(Date.UTC(2024, 0, 2) + i * 864e5).toISOString().slice(0, 10), o, h: Math.max(o, c) * (1 + rng), l: Math.min(o, c) * (1 - rng), c });
    price = c;
  }
}
for (const name of ['GarmanKlass', 'HodgesTompkins', 'Kurtosis', 'Parkinson', 'Raw', 'RogersSatchell', 'Skew', 'YangZhang']) {
  const s = formulas.computeVol(synth, name, 30, 252).filter(v => v != null && Number.isFinite(v));
  ok(s.length > 190, `${name} produces values on clean OHLC`, String(s.length));
}
const jpmVals = fs.existsSync(csvPath) ? formulas.computeVol(readers.parseOhlc(fs.readFileSync(csvPath, 'utf8'), 'JPM.csv'), 'GarmanKlass', 30, 252).filter(v => v != null && Number.isFinite(v)) : [];
if (fs.existsSync(csvPath)) ok(jpmVals.length < 300, 'inconsistent CSV drops negative Garman-Klass windows instead of clamping', `${jpmVals.length} values`);

// 6. the demo snapshot loads and keeps its estimator series
const snapPath = path.join(root, 'volatility-snapshot-demo.json');
if (fs.existsSync(snapPath)) {
  const snap = readers.parseSnapshot(JSON.parse(fs.readFileSync(snapPath, 'utf8')), 'demo.json');
  ok(snap.fund.rows.length > 700, 'snapshot fund rows', String(snap.fund.rows.length));
  ok(Object.keys(snap.fund.est).length === 8, 'snapshot estimators', String(Object.keys(snap.fund.est).length));
  ok(snap.bench && snap.bench.rows.length > 700, 'snapshot benchmark rows', String(snap.bench && snap.bench.rows.length));
} else {
  console.log('skip  demo snapshot not built');
}

console.log(`\n${pass} checks passed`);
