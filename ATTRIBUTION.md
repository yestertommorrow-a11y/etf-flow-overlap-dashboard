# Attribution

All dashboard data other than the Volatility tab's prices comes from **TickerInside** (<https://tickerinside.com>), published under **CC BY 4.0**. The Volatility tab's prices are supplied by the user (see below).

How it is credited in the product:
- The dashboard footer links to tickerinside.com by name (required by the licence wherever a link is possible).
- Each API response includes a per-file `cite_as` line; quoted figures should carry it, e.g.:

> TickerInside, Invesco QQQ Trust (QQQ), holdings from SEC Form N-PORT for the period ended 2026-06-30, filed 2026-08-28, <https://tickerinside.com/etf/qqq/>, CC BY 4.0

Sources behind the data: issuers' own daily holdings files (iShares, SPDR, Global X and others), SEC EDGAR filings (Form N-PORT, annual reports), and Nasdaq Trader's symbol directory for the fund universe.

Data licence: <https://creativecommons.org/licenses/by/4.0/>
API terms: <https://tickerinside.com/api/sections/terms.md>

## Volatility prices and methods

The Volatility tab does **not** use TickerInside data. Prices are supplied by the user: a daily OHLC CSV (Yahoo Finance format, downloaded by the user), or a snapshot produced by `tools/vol_snapshot.py`.

- Estimator formulas: Euan Sinclair, *Volatility Trading* (Garman-Klass, Parkinson, Rogers-Satchell, Yang-Zhang, Hodges-Tompkins, close-to-close, skew, kurtosis).
- Reference implementation mirrored by the browser port and imported by the snapshot builder: [jasonstrimpel/volatility-trading](https://github.com/jasonstrimpel/volatility-trading), **GPL-3.0**. The package is an optional dependency and is not redistributed in this repository; the browser code is an independent implementation of the published formulas.
- `volatility-snapshot-demo.json` is output of that library run over three years of daily JPM and SPY prices fetched from Yahoo Finance via `yfinance` (`auto_adjust=True`, 2023-11-17 → 2026-11-17). The prices belong to their original source; they are included only as a demo and can be regenerated with:

```sh
python tools/vol_snapshot.py --fund JPM --bench SPY --period 3y --repo <repo>
```

The library's own `tests/JPM.csv` is deliberately not used for the demo: its `Close` sits outside `High`/`Low` after the `Adj Close` disagreement in that file, which makes Garman-Klass negative for most windows.

- Browser/CSV price adjustment: when a CSV carries both `Close` and `Adj Close`, Open/High/Low are scaled by `Adj Close / Close` so all four prices share one dividend-adjusted basis. This mirrors yfinance's `auto_adjust=True`, which the snapshot builder uses.

Method parity is enforced, not assumed: `node tools/vol_parity_check.mjs` compares every estimator/window series against the Python library's own output on identical prices.
