# Runbook — ETF Flow & Overlap Dashboard

Quick reference for running, testing, refreshing and deploying the dashboard.
Everything is browser-only: no install, no API key, no backend.

## Live links

- **Dashboard:** https://yestertommorrow-a11y.github.io/etf-flow-overlap-dashboard/
- **Volatility tab directly:** https://yestertommorrow-a11y.github.io/etf-flow-overlap-dashboard/#tab-vol
- **GitHub repo:** https://github.com/yestertommorrow-a11y/etf-flow-overlap-dashboard
- **Refresh workflow (manual run):** https://github.com/yestertommorrow-a11y/etf-flow-overlap-dashboard/actions/workflows/refresh-ohlc.yml
- **Data publisher status:** https://tickerinside.com/status/
- **Manual OHLC source (Yahoo Finance):** https://finance.yahoo.com/quote/SOXL/history/

## Run locally

```powershell
cd C:\Projects\fintools\etf-dashboard
python -m http.server 8765 --bind 127.0.0.1
```

Open **http://127.0.0.1:8765/index.html** (or `.../index.html#tab-vol`).
Stop the server with `Ctrl+C` in that terminal.

The local server is needed for the Volatility tab's one-click loader: browsers
block `fetch()` on `file://` pages. The file pickers still work offline.

## Files

| Purpose | File |
|---|---|
| The dashboard (single HTML file) | `index.html` |
| Published daily prices for the one-click button | `SOXL-ohlc.csv`, `SOXX-ohlc.csv`, `JPM-ohlc.csv`, `SPY-ohlc.csv` |
| Demo snapshot (JPM vs SPY, Python-library output) | `volatility-snapshot-demo.json` |
| Fetch/refresh daily OHLC from Yahoo, no key | `tools/yahoo-ohlc-csv.mjs` |
| Python-library snapshot builder | `tools/vol_snapshot.py` |
| Volatility tests | `tools/vol_smoke_test.mjs`, `tools/vol_render_test.mjs`, `tools/vol_parity_check.mjs` |
| Scheduled CSV refresh | `.github/workflows/refresh-ohlc.yml` |
| Data sources / credits | `README.md`, `ATTRIBUTION.md` |

## Tests

```powershell
cd C:\Projects\fintools\etf-dashboard
node tools/vol_smoke_test.mjs      # parsing, formulas, snapshots
node tools/vol_render_test.mjs     # DOM-stub render + button paths
node tools/vol_parity_check.mjs    # browser JS vs Python library
```

Last known results: 22/22, 30/30 and 32 series with 0 failures
(tolerance 0.00005).

## Refresh the published OHLC CSVs

```powershell
cd C:\Projects\fintools\etf-dashboard
node tools/yahoo-ohlc-csv.mjs SOXL SOXL-ohlc.csv
node tools/yahoo-ohlc-csv.mjs SOXX SOXX-ohlc.csv
node tools/yahoo-ohlc-csv.mjs JPM JPM-ohlc.csv
node tools/yahoo-ohlc-csv.mjs SPY SPY-ohlc.csv
```

The helper reads Yahoo's public `v8/finance/chart` JSON (no key, no login) and
writes `Date,Open,High,Low,Close,Adj Close,Volume`. The free workflow refreshes
the files at 03:30 UTC Tue–Sat and can be triggered manually from the Actions
tab linked above. For another ticker, generate `<TICKER>-ohlc.csv`, commit it,
add a line to the workflow — the Volatility button picks it up as soon as you
type that ticker (optionally add it to `VOL_PUBLISHED` in `index.html` so the
"not published" error lists it too).

## Deploy

```powershell
cd C:\Projects\fintools\etf-dashboard
git add -A
git commit -m "your message"
git push origin master:main
```

Local branch is `master`; the published branch is `main`. GitHub Pages + CDN
usually show the change in 1–5 minutes. Check `git log -1 --oneline` for the
currently deployed commit.

## Notes / troubleshooting

- **Why publish CSVs instead of fetching Yahoo in the tab?** Yahoo sends no
  `Access-Control-Allow-Origin` header and its CSV download URL requires a
  login, so a browser-only page cannot call it. The CSVs are served from the
  page's own folder and the Volatility button reads whatever ticker you type.
- **Freshness chip:** judges lateness by missed 02:00 UTC weekday build
  deadlines. When flows stall, it names the dates and counts the fund files
  still stuck on that date, using the publisher's own status files only.
- **Known publisher state (as of 2026-11-21):** nightly builds, prices and
  holdings were current, but the flow series had been frozen since
  2026-11-11 with 78 of 476 fund files ending on that date. This is upstream,
  not a dashboard bug; re-check the publisher status before assuming it still
  applies.
- **Do not commit** `.opencode/` (local editor config) or
  `single-file-etf-dashboard-data-sources.json` (unreferenced scratch file).
- Never redirect `git show` through PowerShell into `index.html` — it has
  corrupted the file's encoding before. Use `git checkout <commit> -- <path>`.
