# etf-flow-overlap-dashboard
Free single-file ETF dashboard: fund flows, overlap, sector mix, correlation &amp; holdings changes — no install, no API key, no server. Runs in your browser on open data.
# ETF Flow & Overlap Dashboard

**One HTML file. Free open data. No install, no account, no API key, no backend.**

A single-file, browser-only dashboard that answers the questions I kept asking when comparing US ETFs — fund flows, true holdings overlap, sector mix, return correlation, and what funds actually changed. It runs entirely client-side and reads a key-free open API, so you can open the file from anywhere (disk, USB, GitHub Pages) and it just works.

> **Data:** [TickerInside](https://tickerinside.com) — free, no-key, CORS-open, CC BY 4.0, holdings read from issuers' own daily files and SEC Form N-PORT filings.
> **Not investment advice.** A transparency tool.

<!-- Put screenshots in docs/screenshots/ and uncomment:
| Flows | Overlap |
|---|---|
| ![Flows](docs/screenshots/flows.png) | ![Overlap](docs/screenshots/overlap.png) |
-->

---

## Quick start

1. Download `etf-dashboard.html`
2. Double-click it (any modern browser)
3. Start from the pre-filled examples, or open the **Fund Browser** tab to pick any of theuala 238 Invesco funds (or iShares, Vanguard, SPDR…)

Optional, nicer: publish it once and share a URL —

```sh
git init && git add -A && git commit -m "ETF dashboard v5"
# create the repo on github.com, then:
git remote add origin https://github.com/<you>/etf-dashboard.git
git push -u origin main
# GitHub → Settings → Pages → Deploy from branch: main, /root
```

---

## The five questions it answers

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

---

## Data layer

Everything comes from one no-key, CORS-open, CC-BY-4.0-licensed API. Endpoints used:

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

---

## Engineering notes (single file, on purpose)

- **Zero dependencies, zero build.** No CDN, no framework, no Bun/Webpack. One file you can email, inspect in Notepad, and audit offline. Charts are hand-rolled SVG; styling is ~1KB of CSS variables (auto light/dark).
- **Batch-first fetching.** Multi-ticker tabs read `/batch` (one GET for ≤10 funds) and fall back to per-fund GETs on partial failure.
- **Concurrency-bounded sector lookups** (pool of 8) instead of hundreds of parallel requests.
- **Errors are information.** Every failure surfaces a human explanation ("flows don't exist for this fund because…", "only 34 weekly returns, needs 110") instead of a blank panel. `Promise.allSettled` throughout, so one bad ticker never kills a whole ranking.
- **Tolerant parsers.** Holdings arrive as objects *or* arrays depending on the layer; parsers normalise all forms, so source-layer changes upstream don't break the UI.
- **Guaranteed outputs.** CSV export on every analytical tab (flows daily detail, overlap pairs, sector weights, correlation matrix, holdings changes).
- **XSS-safe rendering:** all API-provided strings HTML-escaped before insertion.

## Attribution & licences

- **Data:** TickerInside, **CC BY 4.0** — attribution required wherever the medium allows a link. Each fund file carries a `cite_as` line; the dashboard credits the source in the footer. See [ATTRIBUTION.md](ATTRIBUTION.md).
- **Code:** MIT (see `LICENSE`) — do what you like, no warranty.

## Roadmap / ideas

- [ ] Bond & multi-asset funds in the sector tabs (currently equity-focused)
- [ ] Saved portfolios (URL-hash state, shareable permalinks)
- [ ] Side-by-side country exposure beyond the top 12
- [ ] Optional single-file bundling of a nightly snapshot for offline use

## FAQ

**"Can it work fully offline?"** Yes — it will load, but show errors for live data until it sees the network. Nothing is fetched at open time.

**"Why not iShares/SPDR/Invesco's own CSV downloads?"** They block non-browser clients (HTTP 406) and send no CORS headers, so a browser-only page physically cannot read them without a server — which the "one file, no backend" design excludes by design.

**"What's the catch on flows?"** No free, key-free, CORS-open source publishes daily creations/redemptions for SEC-filed issuers. The tool refuses to fake that; the numbers it does show are derived from share counts, not estimates.

---

*Prepared as a portfolio piece: the interesting problems here were data honesty, API design choices, and UI truth-telling — not charts.*
