// Fetch daily OHLC + adjusted close for a ticker from Yahoo's chart API and write a
// CSV in the exact shape the dashboard's volatility tab expects:
//   Date,Open,High,Low,Close,Adj Close,Volume
// Usage: node yahoo-ohlc-csv.mjs SOXL [outPath] [fromISO]
const [ticker, outArg, fromArg] = process.argv.slice(2);
if (!ticker) { console.error('usage: node yahoo-ohlc-csv.mjs TICKER [out.csv] [from YYYY-MM-DD]'); process.exit(2); }
const from = fromArg ? Math.floor(Date.parse(fromArg + 'T00:00:00Z') / 1000) : 0;
const now = Math.floor(Date.now() / 1000);
const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`
  + `?period1=${from}&period2=${now}&interval=1d&events=div%2Csplits`;

const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
if (!r.ok) throw new Error(`${ticker}: HTTP ${r.status}`);
const j = await r.json();
const res = j.chart && j.chart.result && j.chart.result[0];
if (!res || !res.timestamp) throw new Error(`${ticker}: no chart data — ${JSON.stringify(j.chart && j.chart.error)}`);

const q = res.indicators.quote[0];
const adj = res.indicators.adjclose && res.indicators.adjclose[0] ? res.indicators.adjclose[0].adjclose : null;
const off = res.meta.gmtoffset || 0;
const nf = v => (v == null || !Number.isFinite(v) ? '' : String(Number(v.toFixed(6))));

const rows = [];
for (let i = 0; i < res.timestamp.length; i++) {
  const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
  if (![o, h, l, c].every(v => v != null && Number.isFinite(v))) continue;
  const d = new Date((res.timestamp[i] + off) * 1000).toISOString().slice(0, 10);
  rows.push([d, nf(o), nf(h), nf(l), nf(c), nf(adj ? adj[i] : c), nf(q.volume[i])].join(','));
}
const csv = ['Date,Open,High,Low,Close,Adj Close,Volume', ...rows].join('\n') + '\n';

const fs = await import('node:fs');
const path = await import('node:path');
const out = outArg || path.join(process.env.USERPROFILE || '.', 'Downloads', `${ticker.toUpperCase()}-ohlc.csv`);
fs.writeFileSync(out, csv);
console.log(`${ticker.toUpperCase()}: ${rows.length} rows  ${rows[0].split(',')[0]} → ${rows[rows.length - 1].split(',')[0]}`);
console.log(`wrote ${out} (${csv.length} bytes)`);
