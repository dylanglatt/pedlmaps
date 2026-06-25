#!/usr/bin/env python3
"""Load all gzipped availability snapshots (collected by the droplet into the
`pedl-data` repo) into one tidy DataFrame, ready for modeling.

Each snapshot file is `data/<TS>.csv.gz` with columns:
  ts_iso, js_day, hour, short_name, capacity, bikes, ebikes, classic, docks

This is a DEVELOPER / modeling tool — it ships nothing in the app.

Setup (when you start modeling):
  git clone git@github.com:dylanglatt/pedl-data.git
  python3 scripts/combine.py pedl-data/data --out combined.parquet

CLI:
  python3 combine.py [DATA_DIR] [--out FILE]
    DATA_DIR  directory of *.csv.gz snapshots (default: ./data)
    --out     also write the combined table to FILE (.parquet or .csv.gz)

As a library:
  from combine import load
  df = load("pedl-data/data")
  # df has a tz-aware `ts` (America/New_York) + a derived `minute` column,
  # sorted by station then time — so per-station deltas/slope are a groupby away:
  #   df["ebikes_delta"] = df.groupby("short_name")["ebikes"].diff()
"""
import argparse
import glob
import os
import sys

import pandas as pd

COLS = ["ts_iso", "js_day", "hour", "short_name", "capacity",
        "bikes", "ebikes", "classic", "docks"]
NUM_COLS = ["js_day", "hour", "capacity", "bikes", "ebikes", "classic", "docks"]


def load(data_dir: str = "data") -> pd.DataFrame:
    """Read every *.csv.gz snapshot under data_dir into one clean DataFrame.

    Column names are supplied explicitly (header=None) so this works whether or
    not a file carries a header row — any stray header line reads as a data row
    and is dropped below when its timestamp fails to parse.
    """
    paths = sorted(glob.glob(os.path.join(data_dir, "*.csv.gz")))
    if not paths:
        raise SystemExit(f"No *.csv.gz snapshots found in {data_dir!r}")

    frames = []
    for p in paths:
        try:
            frames.append(pd.read_csv(p, header=None, names=COLS,
                                      dtype={"short_name": str}))
        except Exception as e:  # a half-written file shouldn't sink the whole load
            print(f"skip {os.path.basename(p)}: {e}", file=sys.stderr)
    if not frames:
        raise SystemExit("No snapshots could be read.")

    df = pd.concat(frames, ignore_index=True)
    df = df[df["ts_iso"] != "ts_iso"]  # drop header rows from any headered files
    for c in NUM_COLS:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")

    # ts_iso is offset-aware (e.g. ...-04:00); normalize via UTC then to NYC local.
    df["ts"] = (
        pd.to_datetime(df["ts_iso"], utc=True, errors="coerce")
        .dt.tz_convert("America/New_York")
    )
    df["minute"] = df["ts"].dt.minute  # hour is already a column; add minute for slope

    df = df.dropna(subset=["ts", "short_name"])
    df = df.drop_duplicates(subset=["short_name", "ts_iso"])
    df = df.sort_values(["short_name", "ts"]).reset_index(drop=True)
    return df


def main() -> None:
    ap = argparse.ArgumentParser(description="Combine gzipped availability snapshots.")
    ap.add_argument("data_dir", nargs="?", default="data",
                    help="directory of *.csv.gz snapshots (default: ./data)")
    ap.add_argument("--out", help="write combined table here (.parquet or .csv.gz)")
    args = ap.parse_args()

    df = load(args.data_dir)
    n_files = len(glob.glob(os.path.join(args.data_dir, "*.csv.gz")))
    print(f"files:     {n_files}")
    print(f"rows:      {len(df):,}")
    print(f"stations:  {df['short_name'].nunique():,}")
    print(f"snapshots: {df['ts_iso'].nunique():,}")
    print(f"span:      {df['ts'].min()}  ->  {df['ts'].max()}")

    if args.out:
        if args.out.endswith(".parquet"):
            try:
                df.to_parquet(args.out, index=False)
            except Exception as e:
                alt = args.out[:-len(".parquet")] + ".csv.gz"
                print(f"parquet engine unavailable ({e}); writing {alt} instead "
                      f"(pip install pyarrow for parquet)", file=sys.stderr)
                df.to_csv(alt, index=False, compression="gzip")
                args.out = alt
        else:
            df.to_csv(args.out, index=False, compression="infer")
        print(f"wrote {args.out} ({os.path.getsize(args.out) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
