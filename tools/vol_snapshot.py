#!/usr/bin/env python3
r"""Build a volatility snapshot for the ETF dashboard.

Runs the estimators of jasonstrimpel/volatility-trading (GPL-3.0) over daily
OHLC prices and writes a JSON file the dashboard's Volatility tab loads as-is.
The browser can also compute the same estimators from a CSV; this script is for
people who want the Python library's numbers and a reproducible, shareable
snapshot instead of a live computation.

Examples
--------
    # from Yahoo Finance (yfinance; split/dividend adjusted)
    python tools/vol_snapshot.py --fund QQQ --bench SPY --windows 30,60,90,120

    # from CSVs already on disk (Yahoo export, Stooq, any vendor with the columns)
    python tools/vol_snapshot.py \
        --fund JPM --fund-csv ~/Downloads/JPM.csv \
        --bench SPY --bench-csv ~/Downloads/SPY.csv

    # the library lives somewhere unusual
    python tools/vol_snapshot.py --fund QQQ --repo ~/src/volatility-trading

    # the demo shipped next to index.html
    python tools/vol_snapshot.py --fund JPM --bench SPY --period 3y \
        --repo ~/src/volatility-trading --out volatility-snapshot-demo.json

The output schema is `etf-volatility-snapshot/1`:

    {schema, generated_at, trading_periods, source, library,
     fund:  {ticker, ohlc: [[date, o, h, l, c], ...],
             estimators: {"GarmanKlass": {"30": [[date, value], ...]}, ...}},
     bench: {...} | null}

The `ohlc` array is included so the dashboard can recompute any window the
snapshot did not precompute (and so tools/vol_parity_check.mjs can compare the
JavaScript port against the Python library on identical prices).
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from datetime import datetime, timezone

SCHEMA = "etf-volatility-snapshot/1"
ALL_ESTIMATORS = [
    "GarmanKlass",
    "HodgesTompkins",
    "Kurtosis",
    "Parkinson",
    "Raw",
    "RogersSatchell",
    "Skew",
    "YangZhang",
]
NO_ANNUALISATION = {"Skew", "Kurtosis"}


def die(message: str) -> "NoReturn":  # noqa: F821 - typing nicety only
    sys.exit("error: " + message)


def import_models(repo: str | None):
    """Import the volatility package, optionally from a cloned repo path."""
    if repo:
        path = os.path.abspath(os.path.expanduser(repo))
        if not os.path.isdir(os.path.join(path, "volatility")):
            die(f"{path} does not look like jasonstrimpel/volatility-trading (no volatility/ directory)")
        sys.path.insert(0, path)
    try:
        from volatility import models  # type: ignore
    except Exception as exc:  # pragma: no cover - environment problem
        die(
            "cannot import the volatility package: "
            f"{exc}\n"
            "       clone https://github.com/jasonstrimpel/volatility-trading and pass --repo PATH"
        )
    return models


def require_pandas():
    try:
        import pandas as pd  # noqa: F401
    except Exception as exc:  # pragma: no cover
        die(f"pandas is required to read prices: {exc}")
    return pd


def frame_from_yahoo(ticker: str, period: str, pd):
    try:
        import yfinance as yf  # type: ignore
    except Exception as exc:  # pragma: no cover
        die(f"yfinance is required for --fund/--bench without CSVs: {exc}")
    df = yf.Ticker(ticker).history(period=period, auto_adjust=True)
    if df is None or len(df) == 0:
        die(f"yfinance returned no rows for {ticker}")
    df = df.rename(columns=str.title)
    missing = [c for c in ("Open", "High", "Low", "Close") if c not in df.columns]
    if missing:
        die(f"{ticker}: yfinance returned no {', '.join(missing)} column")
    return df[["Open", "High", "Low", "Close"]]


def frame_from_csv(path: str, pd, adjusted: bool = True):
    """Read a daily OHLC CSV, tolerating vendor column order and extra columns."""
    try:
        df = pd.read_csv(path)
    except Exception as exc:
        die(f"cannot read {path}: {exc}")
    key = {str(c).strip().lower().replace(" ", "").replace("_", ""): c for c in df.columns}

    def col(*names):
        for name in names:
            if name in key:
                return key[name]
        return None

    date_col = col("date", "datetime", "timestamp")
    close_col, adj_col = col("close"), col("adjclose")
    if date_col is None or (close_col is None and adj_col is None):
        die(f"{path}: needs a Date column and a Close (or Adj Close) column")
    df = df.copy()
    df.index = pd.to_datetime(df[date_col], errors="coerce")
    df = df[df.index.notna()]

    def numeric(name):
        c = col(name)
        return pd.to_numeric(df[c], errors="coerce") if c is not None else None

    o, h, l = numeric("open"), numeric("high"), numeric("low")
    close = numeric("close")
    adj = numeric("adjclose") if adj_col is not None else None
    if close is None:
        close = adj
    if adjusted and adj is not None and close is not None:
        factor = adj / close.where(close > 0)
        if o is not None:
            o = o * factor
        if h is not None:
            h = h * factor
        if l is not None:
            l = l * factor
        close = adj
    out = pd.DataFrame({"Open": o, "High": h, "Low": l, "Close": close})
    out = out.dropna().sort_index()
    if len(out) < 40:
        die(f"{path}: only {len(out)} usable rows (need at least ~40 sessions)")
    return out


def pack_series(series, pd):
    rows = []
    for index, value in series.items():
        if value is None:
            continue
        try:
            v = float(value)
        except (TypeError, ValueError):
            continue
        if math.isnan(v) or math.isinf(v):
            continue
        rows.append([index.strftime("%Y-%m-%d"), round(v, 6)])
    return rows


def build_side(models, ticker: str, df, windows: list[int], estimators: list[str], pd):
    df = df.sort_index()
    ohlc = [
        [
            idx.strftime("%Y-%m-%d"),
            round(float(row.Open), 4),
            round(float(row.High), 4),
            round(float(row.Low), 4),
            round(float(row.Close), 4),
        ]
        for idx, row in df.iterrows()
    ]
    out = {"ticker": ticker.upper(), "ohlc": ohlc, "estimators": {}}
    for name in estimators:
        fn = getattr(models, name, None)
        if fn is None or not hasattr(fn, "get_estimator"):
            print(f"  ! {name}: not in this volatility-trading version, skipped", file=sys.stderr)
            continue
        by_window = {}
        for window in windows:
            kwargs = {"price_data": df, "window": window}
            if name not in NO_ANNUALISATION:
                kwargs["trading_periods"] = 252
            try:
                series = fn.get_estimator(**kwargs)
            except Exception as exc:
                print(f"  ! {name} @ {window}: {exc}", file=sys.stderr)
                continue
            by_window[str(window)] = pack_series(series, pd)
        out["estimators"][name] = by_window
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="Build a volatility snapshot for the ETF dashboard.")
    ap.add_argument("--fund", default="", help="fund ticker for yfinance, or a label for a CSV")
    ap.add_argument("--bench", default="", help="benchmark ticker for yfinance, or a label for a CSV")
    ap.add_argument("--fund-csv", default="", help="fund OHLC CSV (skips yfinance)")
    ap.add_argument("--bench-csv", default="", help="benchmark OHLC CSV (optional)")
    ap.add_argument("--windows", default="30,60,90,120", help="comma-separated rolling windows (default 30,60,90,120)")
    ap.add_argument("--estimators", default=",".join(ALL_ESTIMATORS), help="comma-separated subset of: " + ", ".join(ALL_ESTIMATORS))
    ap.add_argument("--period", default="10y", help="yfinance period when reading tickers (default 10y)")
    ap.add_argument("--repo", default=os.environ.get("VOLATILITY_TRADING", ""), help="path to a clone of jasonstrimpel/volatility-trading")
    ap.add_argument("--no-adjust", action="store_true", help="ignore Adj Close in CSVs (default: scale O/H/L by Adj Close / Close)")
    ap.add_argument("--out", default="volatility-snapshot.json", help="output JSON path (default volatility-snapshot.json)")
    args = ap.parse_args()

    pd = require_pandas()
    models = import_models(args.repo or None)

    windows = [int(x) for x in args.windows.split(",") if x.strip()]
    if not windows:
        die("--windows is empty")
    estimators = [x.strip() for x in args.estimators.split(",") if x.strip()]

    if not args.fund and not args.fund_csv:
        die("give --fund (yfinance) or --fund-csv (a file)")
    if args.fund and not args.fund_csv:
        print(f"fetching {args.fund} from Yahoo Finance...", file=sys.stderr)
        fund_df = frame_from_yahoo(args.fund, args.period, pd)
        fund_label = args.fund
        yahoo_labels = [args.fund]
        csv_names = []
    else:
        fund_df = frame_from_csv(os.path.expanduser(args.fund_csv), pd, adjusted=not args.no_adjust)
        fund_label = args.fund or os.path.splitext(os.path.basename(args.fund_csv))[0]
        yahoo_labels = []
        csv_names = [os.path.basename(args.fund_csv)]

    bench_df = None
    if args.bench_csv:
        bench_df = frame_from_csv(os.path.expanduser(args.bench_csv), pd, adjusted=not args.no_adjust)
        bench_label = args.bench or os.path.splitext(os.path.basename(args.bench_csv))[0]
        csv_names.append(os.path.basename(args.bench_csv))
    elif args.bench and not args.fund_csv:
        print(f"fetching {args.bench} from Yahoo Finance...", file=sys.stderr)
        bench_df = frame_from_yahoo(args.bench, args.period, pd)
        bench_label = args.bench
        yahoo_labels.append(args.bench)
    else:
        bench_label = args.bench

    source_parts = []
    if yahoo_labels:
        source_parts.append(f"yfinance {args.period}, auto_adjust=True ({' + '.join(yahoo_labels)})")
    if csv_names:
        source_parts.append("CSV " + ", ".join(csv_names))
    source = " + ".join(source_parts)

    print(f"computing {len(estimators)} estimator(s) over windows {windows}...", file=sys.stderr)
    snapshot = {
        "schema": SCHEMA,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "trading_periods": 252,
        "source": source,
        "library": "jasonstrimpel/volatility-trading (GPL-3.0)",
        "columns": ["date", "open", "high", "low", "close"],
        "fund": build_side(models, fund_label, fund_df, windows, estimators, pd),
        "bench": build_side(models, bench_label, bench_df, windows, estimators, pd) if bench_df is not None else None,
    }

    out_path = os.path.abspath(os.path.expanduser(args.out))
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(snapshot, fh, ensure_ascii=False, separators=(",", ":"))

    fund_rows = len(snapshot["fund"]["ohlc"])
    print(f"wrote {out_path}")
    print(f"  fund {snapshot['fund']['ticker']}: {fund_rows} sessions, {snapshot['fund']['ohlc'][0][0]} to {snapshot['fund']['ohlc'][-1][0]}")
    if snapshot["bench"]:
        print(f"  bench {snapshot['bench']['ticker']}: {len(snapshot['bench']['ohlc'])} sessions")
    total = sum(len(v) for w in snapshot["fund"]["estimators"].values() for v in w.values())
    print(f"  {total} estimator points across {len(snapshot['fund']['estimators'])} estimators × {len(windows)} windows")


if __name__ == "__main__":
    main()
