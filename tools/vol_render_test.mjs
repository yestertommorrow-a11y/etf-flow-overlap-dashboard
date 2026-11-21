// Render smoke test: runs the dashboard's inline script with a tiny DOM stub,
// loads the demo snapshot and a CSV, and checks the Volatility tab builds.
//   node tools/vol_render_test.mjs
// No dependencies, no browser. Catches runtime errors in renderVol() that the
// pure-function tests can't see.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
const demoPath = path.join(root, 'volatility-snapshot-demo.json');
const demo = fs.existsSync(demoPath) ? JSON.parse(fs.readFileSync(demoPath, 'utf8')) : null;

const defaults = {
  volEstimator: 'GarmanKlass', volWindow: '30', volWindows: '30, 60, 90, 120',
  volQLo: '0.25', volQHi: '0.75', volFund: 'SOXL', volBench: 'SOXX',
  flowTickers: '', corrTickers: '', chgTickers: '', ovA: '', ovB: '', secA: '', secB: ''
};
const els = new Map();
function makeEl(id) {
  return {
    id, value: defaults[id] ?? '', innerHTML: '', hidden: false, files: [],
    dataset: {}, style: {}, onclick: null,
    classList: { add() {}, remove() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
    appendChild() {}, querySelectorAll: () => [], getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 160 })
  };
}
const document = {
  getElementById(id) { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); },
  querySelectorAll: () => [],
  querySelector: () => null,
  addEventListener() {},
  createElement: () => makeEl('created'),
  body: { appendChild() {} }
};
const window = { addEventListener() {}, innerWidth: 1200, innerHeight: 800 };

const fetchStub = async url => {
  const u = String(url);
  const pub = u.match(/([A-Za-z0-9.\-]+)-ohlc\.csv/);
  if (pub) {
    const p = path.join(root, pub[0]);
    if (!fs.existsSync(p)) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => fs.readFileSync(p, 'utf8') };
  }
  if (u.includes('volatility-snapshot-demo.json')) {
    if (!demo) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => demo };
  }
  return { ok: true, status: 200, json: async () => ({ _404: true }) };
};

let pass = 0;
const ok = (cond, label, extra = '') => { if (!cond) { console.error(`FAIL  ${label}${extra ? ' — ' + extra : ''}`); process.exitCode = 1; } else { pass++; console.log(`ok    ${label}${extra ? ' — ' + extra : ''}`); } };

new Function('document', 'window', 'fetch', 'URL', 'Blob', 'location', src)(document, window, fetchStub, { createObjectURL: () => 'blob:x' }, class Blob {}, { hash: '', href: 'http://localhost/' });
ok(document.getElementById('volEstimator').innerHTML.includes('Garman-Klass'), 'estimator list populated at load');

const out = document.getElementById('volOut');
if (demo) {
  await document.getElementById('volDemo').onclick();
  ok(out.innerHTML.length > 5000, 'demo snapshot renders', `${(out.innerHTML.length / 1024).toFixed(0)} KB`);
  ok(!out.innerHTML.includes('class="err"'), 'demo render has no error block');
  for (const label of ['Volatility cones', 'Rolling quantiles', 'Rolling extremes', 'Distribution', 'vs SPY', 'OLS']) {
    ok(out.innerHTML.includes(label), `demo shows "${label}"`);
  }
  ok((out.innerHTML.match(/data-charttip=/g) || []).length >= 6, 'demo charts carry tooltips', String((out.innerHTML.match(/data-charttip=/g) || []).length));

  // switch estimator: the change handler re-renders without reloading
  document.getElementById('volEstimator').value = 'YangZhang';
  await document.getElementById('volEstimator').onchange();
  ok(out.innerHTML.includes('Yang-Zhang over time'), 'estimator switch rerenders (Yang-Zhang)');
  ok(out.innerHTML.includes('YangZhang') || out.innerHTML.includes('Yang-Zhang'), 'Yang-Zhang label present');
  document.getElementById('volEstimator').value = 'GarmanKlass';
  await document.getElementById('volEstimator').onchange();
}

// published CSVs: the button follows whatever the user typed in the ticker boxes
ok(typeof document.getElementById('volRepo').onclick === 'function', 'published CSV button bound');
document.getElementById('volSnap').files = [];
document.getElementById('volFundCsv').files = [];
document.getElementById('volBenchCsv').files = [];
if (fs.existsSync(path.join(root, 'SOXL-ohlc.csv')) && fs.existsSync(path.join(root, 'SOXX-ohlc.csv'))) {
  document.getElementById('volFund').value = ' soxl ';
  document.getElementById('volBench').value = ' soxx ';
  await document.getElementById('volRepo').onclick();
  ok(out.innerHTML.includes('SOXL · '), 'button loads the fund ticker typed by the user');
  ok(out.innerHTML.includes('SOXX'), 'button loads the benchmark ticker typed by the user');
  ok(document.getElementById('volFund').value === 'SOXL', 'typed ticker is normalized (case/space)');
  ok(out.innerHTML.includes('computed in the browser'), 'published CSVs compute in browser');
  ok(!out.innerHTML.includes('class="err"'), 'published CSV render has no error block');

  // benchmark is optional: clearing the box loads only the fund
  document.getElementById('volBench').value = '';
  await document.getElementById('volRepo').onclick();
  ok(out.innerHTML.includes('SOXL · ') && !out.innerHTML.includes('vs SOXX'), 'empty benchmark loads fund only');
  ok(!out.innerHTML.includes('class="err"'), 'fund-only render has no error block');

  // an un-published ticker is a clear error, not a blank panel
  document.getElementById('volFund').value = 'ZZZZ';
  await document.getElementById('volRepo').onclick();
  ok(out.innerHTML.includes('No published ZZZZ') && out.innerHTML.includes('class="err"'), 'unknown ticker shows a helpful error');
  // JPM vs SPY are published too — the ticker the user asked for
  if (fs.existsSync(path.join(root, 'JPM-ohlc.csv')) && fs.existsSync(path.join(root, 'SPY-ohlc.csv'))) {
    document.getElementById('volFund').value = 'jpm';
    document.getElementById('volBench').value = 'spy';
    await document.getElementById('volRepo').onclick();
    ok(out.innerHTML.includes('JPM · '), 'button loads JPM fund CSV');
    ok(out.innerHTML.includes('SPY'), 'button loads SPY benchmark CSV');
    ok(!out.innerHTML.includes('class="err"'), 'JPM/SPY render has no error block');
  } else {
    console.log('skip  JPM/SPY CSVs not present');
  }
} else {
  console.log('skip  published CSVs not present');
}

// CSV path: both files, no snapshot
const csv = 'C:/Users/yeste/volatility-trading/tests/JPM.csv';
const benchCsv = 'C:/Users/yeste/volatility-trading/tests/BENCH.csv';
if (fs.existsSync(csv) && fs.existsSync(benchCsv)) {
  document.getElementById('volSnap').files = [];
  document.getElementById('volFundCsv').files = [{ name: 'JPM.csv', text: async () => fs.readFileSync(csv, 'utf8') }];
  document.getElementById('volBenchCsv').files = [{ name: 'BENCH.csv', text: async () => fs.readFileSync(benchCsv, 'utf8') }];
  document.getElementById('volFund').value = 'JPM';
  document.getElementById('volBench').value = 'SPX';
  await document.getElementById('volRun').onclick();
  ok(out.innerHTML.includes('computed in the browser'), 'CSV path renders with browser provenance');
  ok(out.innerHTML.includes('JPM vs SPX'), 'CSV path renders the benchmark card');
  ok(out.innerHTML.includes('outside their High–Low range'), 'inconsistent CSV warns instead of clamping');
  ok(!out.innerHTML.includes('class="err"'), 'CSV render has no error block');
} else {
  console.log('skip  repo test CSVs not found');
}

// close-only CSV should narrow the estimator list and warn
document.getElementById('volFundCsv').files = [{ name: 'CLOSE.csv', text: async () => 'Date,Close\n' + Array.from({ length: 160 }, (_, i) => `${new Date(Date.UTC(2023, 0, 2) + i * 864e5).toISOString().slice(0, 10)},${(100 + Math.sin(i / 4) * 5).toFixed(2)}`).join('\n') }];
document.getElementById('volBenchCsv').files = [];
await document.getElementById('volRun').onclick();
ok(out.innerHTML.includes('only close-based estimators are offered'), 'close-only CSV warns and narrows estimators');
ok(!out.innerHTML.includes('Garman-Klass over time'), 'close-only CSV avoids range estimators');

console.log(`\n${pass} checks passed`);
