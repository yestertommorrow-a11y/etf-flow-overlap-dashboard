# etf-flow-overlap-dashboard
Free single-file ETF dashboard: fund flows, overlap, sector mix, correlation, holdings changes and Sinclair volatility estimators — no install, no API key, no server. Runs in your browser on open data and your own OHLC prices.
# ETF Flow & Overlap Dashboard

**One HTML file. Free open data. No install, no account, no API key, no backend.**

A single-file, browser-only dashboard that answers the questions I kept asking when comparing US ETFs — fund flows, true holdings overlap, sector mix, return correlation, what funds actually changed, and how volatile each one really is. It runs entirely client-side and reads a key-free open API, so you can open the file from anywhere (disk, USB, GitHub Pages) and it just works.

> **Data:** [TickerInside](https://tickerinside.com) — free, no-key, CORS-open, CC BY 4.0, holdings read from issuers' own daily files and SEC Form N-PORT filings. Volatility estimators need daily OHLC, which TickerInside does not publish; that tab takes a Yahoo Finance CSV or a snapshot built with the [volatility-trading](https://github.com/jasonstrimpel/volatility-trading) library.
> **Not investment advice.** A transparency tool.

<!-- Put screenshots in docs/screenshots/ and uncomment:
| Flows | Overlap |
|---|---|
| ![Flows](docs/screenshots/flows.png) | ![Overlap](docs/screenshots/overlap.png) |
-->

---

## Quick start

1. Download `index.html`
2. Double-click it (any modern browser)
3. Start from the pre-filled examples, or open the **Fund Browser** tab to pick any of the 238 Invesco funds (or iShares, Vanguard, SPDR…)

The **Volatility** tab ships with a one-click demo (`volatility-snapshot-demo.json`: JPM vs SPY, the last three years of Yahoo Finance daily prices, run through the Python library). To use your own prices, download a daily CSV from finance.yahoo.com and pick it in the tab — or build a snapshot with the Python helper below.

Optional, nicer: publish it once and share a URL —

```sh
git init && git add -A && git commit -m "ETF dashboard v5"
# create the repo on github.com, then:
git remote add origin https://github.com/<you>/etf-dashboard.git
git push -u origin main
# GitHub → Settings → Pages → Deploy from branch: main, /root
```

---

## The tabs

### 🔎 Fund Browser — "which funds even exist?"
Server-side screening over the whole covered universe (`/screen?issuer=…`): every fund of any issuer with name, category, cost, assets, holdings count. Default view: all **238 Invesco ETFs**. Every row is one click away from the comparison tabs. The four input tabs also carry grouped **Pre-list** dropdowns (SPDR / Vanguard / Invesco equal-weight / iShares sector families + industry sets) that fill ticker fields in one pick.

### 📊 Fund Flows — "where is money going, daily?"
Daily net creations/redemptions (in USD) over the last 1–20 closes, derived from share counts in issuers' daily files: gross inflows vs outflows, streaks, cumulative flow, biggest single days, and a market-wide rank across every measured ETF.

**Honest up front:** daily flows exist *only* for the ~470 funds read nightly from issuer files (iShares, SPDR, Global X). Invesco, Vanguard and other SEC-filed funds publish nothing daily — the tab says this before you type, and per-ticker errors carry the explanation rather than a blank result.

### 🔁 1-vs-1 Overlap — "are these two baskets the same basket?"
Overlap by weight (`Σ min(wᴀ, wʙ)`), active share (`½ Σ|wᴀ − wʙ|`), names in common (Jaccard), shares of top-5/10 of the overlap, sector breakdown of the shared weight, holdings unique to each side, plus a head-to-head risk/return table (52-week and full-history returns, volatility, beta, correlation). Known failure modes are flagged, not hidden:

- **Date-mismatch warning** when the two holdings come from different filings (SEC-filed funds report quarterly: comparing March against June is approximate and the UI says so).
- **Leverage/inverse warning** — derivative-based funds' stock weights understate swap/futures exposure, so weight overlap is misleading there.

### 🧩 Sector Weights — "what's the pizza made of?"
Side-by-side sector or industry mix with three normalisations that matter: as-reported % of assets, or **% of stock holdings** (like-for-like when one fund is 60% stocks and the other 99%), sortable by either fund or biggest difference. Every sector row expands to the holdings inside it. Sectors are resolved per holding via the `/sec/{ticker}` stock files.

### 📈 Correlation — "will they actually diversify each other?"
Weekly-return correlation matrix over 52/104/156-week windows, 26-week rolling correlation for any chosen pair, growth of $100, best/worst weeks, max drawdown on weekly closes, and a **diversification ratio** for the equal-weight mix (avg fund vol ÷ portfolio vol; 1.00 = no benefit). Funds missing ≥110 weekly returns are excluded with a stated reason rather than silently averaged.

### 🔍 Holdings Change — "what did they quietly buy and sell?"
Diffs between consecutive official files: entered / exited / moved, names turnover, weights moved, and — where share counts exist — **actually traded**, separating real decisions from price drift (a rallying stock gains weight with no trade).

*Invesco works here too:* two layered sources. Funds with daily issuer-file history use it; everything else (QQQ, RSP, …) falls back to **quarterly SEC Form N-PORT reports** and diffs those, labelled clearly as weights-only.

### 📉 Volatility — "how much does it actually move?"
Sinclair's OHLC estimators — **Garman-Klass, Parkinson, Rogers-Satchell, Yang-Zhang, Hodges-Tompkins**, close-to-close, skew and kurtosis — with volatility cones, rolling quantiles, rolling extremes, rolling mean/σ/z-score, the distribution against a normal curve, ratio and rolling correlation against a benchmark, and a through-the-origin OLS (the same `sm.OLS(y, X)` model `volest` uses).

Prices are yours: drop in a daily CSV (Yahoo format; Adj Close is applied consistently to Open/High/Low) or load a snapshot precomputed by the cloned Python library. A provenance line states which one produced the numbers, and every chart still exports CSV.

**Honest limits:** TickerInside publishes 156 weekly returns, not daily OHLC, so this tab cannot share the API layer the other tabs use. Range-based estimators need Open/High/Low — a close-only file narrows the list to close-based estimators and says why. And `volatility-trading`'s Hodges-Tompkins correction is one whole-sample factor (`log_return.count()` is a scalar, not a rolling count), not the rolling correction the textbook describes; the browser port reproduces the library exactly so the two can be checked against each other, and the UI tells you so instead of hiding it.

---

## Data layer

Everything except the Volatility tab's prices comes from one no-key, CORS-open, CC-BY-4.0-licensed API. Endpoints used:

| Endpoint | Used for |
|---|---|
| `GET /api/v1/fund/{ticker}.json` | holdings, weights, cost, risk, weekly returns (156w) |
| `GET /api/v1/batch?funds=A,B,…` | up to 10 fund files in **one** GET (multi-ticker tabs) |
| `GET /api/v1/screen?issuer=…` | Fund Browser: any issuer's covered funds (+ CSV twins) |
| `GET /api/v1/sec/{ticker}.json` | sector/industry of each holding; "who holds X" |
| `GET /api/v1/etf-flows/series.json` | 20-close daily flow series, every measured ETF |
| `GET /api/v1/history/{ticker}.json` | issuer-file holdings history (daily-file funds) |
| `GET /api/v1/quarterly/{ticker}.json` + `/history/{ticker}/{date}.json` | quarterly SEC reports → history fallback |
| `GET /api/v1/universe.json` | the ~5,723 US-listed ETFs and coverage status |

Static files carry `ETag` + `Cache-Control: public, max-age=300`, so repeat views answer 304 and stay cheap. Data refreshes nightly (build completes by ~02:00 UTC).

### Coverage matrix (who gets what)

| Layer | Funds | Flows | Holdings history |
|---|---|---|---|
| Issuer daily files (iShares, SPDR, Global X…) | ~470 | ✅ daily | ✅ per file date |
| SEC Form N-PORT (Invesco, Vanguard, …) | ~2,160 stock + 1,343 derivative + 927 bond | ❌ (says so up front) | ⚠ quarterly reports |
| Uncovered / not-yet-filed | the rest of ~5,723 | ❌ | ❌ |

### Volatility snapshot (optional, Python)

The browser computes the estimators itself, so the tab works with nothing installed. If you want the Python library's numbers — or a reproducible file to publish next to the page — build a snapshot:

```sh
git clone https://github.com/jasonstrimpel/volatility-trading ../volatility-trading
python tools/vol_snapshot.py --fund QQQ --bench SPY --repo ../volatility-trading

# or from CSVs already on disk
python tools/vol_snapshot.py --fund JPM \
  --fund-csv ~/Downloads/JPM.csv \
  --bench SPY --bench-csv ~/Downloads/SPY.csv \
  --repo ../volatility-trading
```

It writes `volatility-snapshot.json` (schema `etf-volatility-snapshot/1`) containing the adjusted OHLC plus every estimator series for the requested windows. Drop it on the Volatility tab and the provenance line switches to "precomputed by volatility-trading". Needs `pandas`; `yfinance` only when reading tickers instead of CSVs. `volatility-snapshot-demo.json` in this repo is exactly that output for JPM vs SPY over the last three years (`--period 3y`, 2023-11 → 2026-11).

The demo is *not* built from the library's own `tests/JPM.csv`: in that file `Close` and `Adj Close` disagree enough that `Close` sits outside `High`/`Low`, which turns Garman-Klass negative for most windows. The dashboard reports such rows ("N of M rows have a Close outside their High–Low range") instead of quietly clamping the range to fit, because clamping changes every range-based estimate.

**Why not compute the estimators in TickerInside's layer?** It has no daily OHLC. Weekly returns support the Correlation tab's annualised σ just fine, but Parkinson/Garman-Klass/Yang-Zhang need intraday ranges, and inventing them would be worse than asking for a CSV.

---

## Engineering notes (single file, on purpose)

- **Zero dependencies, zero build.** No CDN, no framework, no Bun/Webpack. One file you can email, inspect in Notepad, and audit offline. Charts are hand-rolled SVG; styling is ~1KB of CSS variables (auto light/dark).
- **Batch-first fetching.** Multi-ticker tabs read `/batch` (one GET for ≤10 funds) and fall back to per-fund GETs on partial failure.
- **Freshness chip.** On load the dashboard reads the source's own `status.json` and shows, next to the title, when the data was last built and through which dates (holdings files, prices, SEC reports) — turning amber when the nightly build runs late, red when it stalls. The page answers "how old is this?" before it's asked.
- **Concurrency-bounded sector lookups** (pool of 8) instead of hundreds of parallel requests.
- **Errors are information.** Every failure surfaces a human explanation ("flows don't exist for this fund because…", "only 34 weekly returns, needs 110") instead of a blank panel. `Promise.allSettled` throughout, so one bad ticker never kills a whole ranking.
- **Tolerant parsers.** Holdings arrive as objects *or* arrays depending on the layer; parsers normalise all forms, so source-layer changes upstream don't break the UI.
- **Formulas tested against the library, not eyeballed.** `node tools/vol_parity_check.mjs` lifts the volatility formula block out of `index.html`, runs it in Node on the same OHLC the Python snapshot used, and compares all 32 estimator/window series point-by-point (32/32 pass on the shipped demo; worst absolute drift ≈1e-4 on a kurtosis estimate near zero, typical <0.2% relative — pandas sums in a different order, the model is the same). `node tools/vol_smoke_test.mjs` checks CSV/snapshot parsing and estimator coverage; `node tools/vol_render_test.mjs` renders the tab with a DOM stub.
- **One implementation, two sources.** A snapshot's precomputed series is used when present; otherwise the dashboard computes the same series from the snapshot's OHLC. Switching estimator or window never refetches, and the CSV export always states the estimator and window in the filename.
- **Guaranteed outputs.** CSV export on every analytical tab (flows daily detail, overlap pairs, sector weights, correlation matrix, holdings changes, volatility series).
- **XSS-safe rendering:** all API-provided strings HTML-escaped before insertion.

## Attribution & licences

- **Data:** TickerInside, **CC BY 4.0** — attribution required wherever the medium allows a link. Each fund file carries a `cite_as` line; the dashboard credits the source in the footer. See [ATTRIBUTION.md](ATTRIBUTION.md).
- **Volatility formulas:** Euan Sinclair, *Volatility Trading*. The browser port reimplements the published estimators and mirrors the models of [jasonstrimpel/volatility-trading](https://github.com/jasonstrimpel/volatility-trading) (**GPL-3.0**), which `tools/vol_snapshot.py` imports unmodified as an optional dependency — the Python package is not bundled here. The demo snapshot is that library's output over three years of JPM and SPY daily prices from Yahoo Finance; prices belong to their source.
- **Code:** MIT (see `LICENSE`) — do what you like, no warranty.

## Roadmap / ideas

- [x] Volatility tab: Sinclair OHLC estimators, browser port + Python snapshots, parity-tested
- [ ] Nightly snapshot job (GitHub Actions: yfinance → `volatility-snapshot.json` → Pages) so the volatility tab is pre-warmed
- [ ] Bond & multi-asset funds in the sector tabs (currently equity-focused)
- [ ] Saved portfolios (URL-hash state, shareable permalinks)
- [ ] Side-by-side country exposure beyond the top 12
- [ ] Optional single-file bundling of a nightly snapshot for offline use

## FAQ

**"Can it work fully offline?"** Yes — it opens and renders, and live-data tabs show errors until they see the network. The one local fetch is the Volatility tab's demo snapshot (`volatility-snapshot-demo.json`), which browsers only allow over `http://` or when you pick the file yourself; on `file://` the tab says so instead of failing silently.

**"Why not iShares/SPDR/Invesco's own CSV downloads?"** They block non-browser clients (HTTP 406) and send no CORS headers, so a browser-only page physically cannot read them without a server — which the "one file, no backend" design excludes by design.

**"Where do the volatility tab's prices come from?"** From you: a daily Yahoo Finance CSV (or any vendor with Date/Open/High/Low/Close), or a snapshot built by `tools/vol_snapshot.py` with the volatility-trading library. TickerInside has no daily OHLC, so the tab says that up front rather than substituting weekly returns.

**"Why does Hodges-Tompkins not match the textbook formula?"** Because `volatility-trading` computes `log_return.count()` once for the whole series, making its finite-sample correction a constant rather than a rolling adjustment. The browser port mirrors the library exactly — that is what the parity test proves — and the tab labels the behaviour rather than pretending otherwise. If you want the rolling correction, change both the Python model and the JS block together; the parity check will tell you if they diverge.

**"What's the catch on flows?"** No free, key-free, CORS-open source publishes daily creations/redemptions for SEC-filed issuers. The tool refuses to fake that; the numbers it does show are derived from share counts, not estimates.

---

*Prepared as a portfolio piece: the interesting problems here were data honesty, API design choices, and UI truth-telling — not charts.*
