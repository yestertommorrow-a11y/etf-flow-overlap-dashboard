// Parity check: the dashboard's browser port vs the Python library's own numbers.
//
// The volatility tab keeps its formula block between two markers so this script
// can lift it out of index.html and run it in Node against a snapshot produced by
// tools/vol_snapshot.py (which calls jasonstrimpel/volatility-trading directly).
//
//   node tools/vol_parity_check.mjs [snapshot.json] [index.html]
//
// Exits 1 if any estimator/window drifts by more than TOL.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const snapPath = process.argv[2] || path.join(root, 'volatility-snapshot-demo.json');
const htmlPath = process.argv[3] || path.join(root, 'index.html');
const TOL = 5e-5;

const html = fs.readFileSync(htmlPath, 'utf8');
const START = '// >>> volatility formulas';
const END = '// <<< volatility formulas';
const from = html.indexOf(START);
const to = html.indexOf(END);
if (from < 0 || to < 0) {
  console.error('formula markers not found in ' + htmlPath);
  process.exit(2);
}
const source = html.slice(from + START.length, to);
const mod = new Function(source + '\nreturn { computeVol, vMean, vStd, vQuantile };')();

const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
const rows = snap.fund.ohlc.map(r => ({ d: String(r[0]), o: +r[1], h: +r[2], l: +r[3], c: +r[4] }));
const tp = snap.trading_periods || 252;

let checked = 0, worst = { diff: 0 }, failures = 0;
console.log(`snapshot: ${snap.fund.ticker} · ${rows.length} sessions · ${snap.generated_at}`);
console.log(`estimator                window   python   browser   max |diff|   max rel`);
for (const [name, byWindow] of Object.entries(snap.fund.estimators)) {
  for (const [w, series] of Object.entries(byWindow)) {
    const win = Number(w);
    const py = new Map(series.map(([d, v]) => [d, Number(v)]));
    const js = mod.computeVol(rows, name, win, tp);
    let max = 0, maxRel = 0, n = 0, firstMismatch = null, badPoint = false;
    rows.forEach((r, i) => {
      if (!py.has(r.d)) return;
      const pyv = py.get(r.d);
      if (js[i] == null || !Number.isFinite(js[i])) { if (firstMismatch == null) firstMismatch = `${r.d}: python ${pyv} vs browser null`; badPoint = true; return; }
      const d = Math.abs(js[i] - pyv);
      // absolute+relative: pandas sums in a different order, which shows up in
      // Rogers-Satchell near zero and in kurtosis of order 10, not in the model.
      const tol = 1e-4 + 2e-3 * Math.abs(pyv);
      if (d > max) max = d;
      if (d > tol) badPoint = true;
      maxRel = Math.max(maxRel, d / Math.max(Math.abs(pyv), 1e-9));
      if (d > tol && firstMismatch == null) firstMismatch = `${r.d}: python ${pyv} vs browser ${js[i]}`;
      n++;
    });
    checked++;
    const bad = badPoint || n === 0;
    if (bad) failures++;
    if (max > worst.diff) worst = { diff: max, name, win, firstMismatch };
    console.log(`${name.padEnd(24)} ${String(win).padStart(4)}   ${String(py.size).padStart(6)}   ${String(n).padStart(7)}   ${max.toExponential(2)}   ${(maxRel * 100).toFixed(4)}%${bad ? '  <-- FAIL' : ''}`);
    if (bad && firstMismatch) console.log(`  first mismatch: ${firstMismatch}`);
  }
}
console.log(`\n${checked} series checked, ${failures} failing (tolerance ${TOL})`);
if (worst.diff > TOL) console.log(`worst: ${worst.name} @ ${worst.win} = ${worst.diff.toExponential(2)}`);
process.exit(failures ? 1 : 0);
