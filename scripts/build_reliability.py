#!/usr/bin/env python3
"""Build per-station reliability rates from station_status snapshots.

The app joins stations by GBFS short_name, so this artifact is keyed by the
snapshot short_name column (for example "5872.10").
"""
import argparse
import json
import os
from datetime import datetime, timezone

import pandas as pd

import combine


DEFAULT_OUT = os.path.join("lib", "reliability.json")
DEFAULT_DATA_DIR = os.path.join("pedl-data", "data")
BUCKETS = {
    "overnight": (0, 6),
    "am": (6, 10),
    "mid": (10, 16),
    "pm": (16, 20),
    "eve": (20, 24),
}
RATE_COLS = {
    "empty": "is_empty",
    "full": "is_full",
    "noebike": "is_noebike",
}


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        description="Build lib/reliability.json from Citi Bike availability snapshots."
    )
    ap.add_argument(
        "--db",
        default=combine.PEDL_DB,
        help="SQLite DB to read (default: $PEDL_DB or ~/pedl.db)",
    )
    ap.add_argument(
        "--data-dir",
        default=None,
        help=(
            "directory of *.csv.gz snapshots to read instead of the DB; if omitted "
            f"and --db is unavailable, falls back to {DEFAULT_DATA_DIR}"
        ),
    )
    ap.add_argument("--out", default=DEFAULT_OUT, help=f"output JSON path (default: {DEFAULT_OUT})")
    ap.add_argument("--min-obs", type=int, default=100, help="minimum station observations")
    return ap.parse_args()


def load_snapshots(args: argparse.Namespace) -> tuple[pd.DataFrame, str]:
    if args.data_dir:
        return combine.load(args.data_dir), f"data-dir:{args.data_dir}"

    if os.path.exists(args.db):
        df = combine.load_db(args.db)
        if not df.empty:
            return df, f"db:{args.db}"

    if os.path.isdir(DEFAULT_DATA_DIR):
        return combine.load(DEFAULT_DATA_DIR), f"data-dir:{DEFAULT_DATA_DIR}"

    raise SystemExit(
        f"No snapshots found. Build {args.db!r} or pass --data-dir DIR with *.csv.gz files."
    )


def rate(series: pd.Series) -> float:
    return round(float(series.mean()), 2)


def daypart(hour: int) -> str:
    for name, (start, end) in BUCKETS.items():
        if start <= hour < end:
            return name
    raise ValueError(f"invalid hour {hour!r}")


def build_reliability(df: pd.DataFrame, min_obs: int) -> tuple[dict, dict]:
    needed = ["ts_iso", "ts", "hour", "short_name", "bikes", "ebikes", "docks"]
    missing = [c for c in needed if c not in df.columns]
    if missing:
        raise SystemExit(f"Missing required columns: {', '.join(missing)}")

    df = df.dropna(subset=needed).copy()
    df["short_name"] = df["short_name"].astype(str)
    df["hour"] = df["hour"].astype(int)
    df["is_empty"] = df["bikes"] == 0
    df["is_full"] = df["docks"] == 0
    df["is_noebike"] = df["ebikes"] == 0
    df["is_offline"] = df["is_empty"] & df["is_full"]
    df["daypart"] = df["hour"].map(daypart)

    obs_by_station = df.groupby("short_name", sort=True).size()
    included_names = obs_by_station[obs_by_station >= min_obs].index
    included = df[df["short_name"].isin(included_names)]
    n_snapshots = int(df["ts_iso"].nunique())

    artifact = {}
    for short_name, station in included.groupby("short_name", sort=True):
        bucket_rates = {}
        for bucket_name in BUCKETS:
            bucket = station[station["daypart"] == bucket_name]
            if bucket.empty:
                bucket_rates[bucket_name] = {"empty": None, "full": None, "noebike": None}
            else:
                bucket_rates[bucket_name] = {
                    out_name: rate(bucket[col_name])
                    for out_name, col_name in RATE_COLS.items()
                }

        artifact[short_name] = {
            "dead": bool(len(station) == n_snapshots and station["is_offline"].all()),
            "empty": rate(station["is_empty"]),
            "full": rate(station["is_full"]),
            "noebike": rate(station["is_noebike"]),
            "buckets": bucket_rates,
        }

    ts_min = df["ts"].min()
    ts_max = df["ts"].max()
    meta = {
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "span": {
            "start": ts_min.isoformat() if pd.notna(ts_min) else None,
            "end": ts_max.isoformat() if pd.notna(ts_max) else None,
        },
        "n_snapshots": n_snapshots,
        "min_obs": min_obs,
        "station_coverage": {
            "total": int(obs_by_station.size),
            "included": int(len(included_names)),
            "excluded_low_obs": int((obs_by_station < min_obs).sum()),
            "full_snapshot_coverage": int((obs_by_station == n_snapshots).sum()),
        },
    }
    artifact["__meta"] = meta
    return artifact, meta


def write_json(path: str, artifact: dict) -> None:
    out_dir = os.path.dirname(path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(artifact, f, indent=2, sort_keys=True)
        f.write("\n")


def print_summary(artifact: dict, source: str, out: str) -> None:
    stations = {k: v for k, v in artifact.items() if k != "__meta"}
    dead = sorted(k for k, v in stations.items() if v["dead"])
    empty_over = [(k, v["empty"]) for k, v in stations.items() if v["empty"] > 0.25]
    full_over = [(k, v["full"]) for k, v in stations.items() if v["full"] > 0.25]
    worst_empty = sorted(
        ((k, v["empty"]) for k, v in stations.items()), key=lambda x: x[1], reverse=True
    )[:10]
    worst_full = sorted(
        ((k, v["full"]) for k, v in stations.items()), key=lambda x: x[1], reverse=True
    )[:10]

    meta = artifact["__meta"]
    print(f"source:       {source}")
    print(f"wrote:        {out}")
    print(f"span:         {meta['span']['start']}  ->  {meta['span']['end']}")
    print(f"snapshots:    {meta['n_snapshots']:,}")
    print(
        "stations:     "
        f"{meta['station_coverage']['included']:,} included / "
        f"{meta['station_coverage']['total']:,} total "
        f"(min_obs={meta['min_obs']})"
    )
    print(f"dead:         {len(dead):,}")
    print(f"empty > 25%:  {len(empty_over):,}")
    print(f"full > 25%:   {len(full_over):,}")
    print("worst empty:")
    for short_name, value in worst_empty:
        print(f"  {short_name}: {value:.2f}")
    print("worst full:")
    for short_name, value in worst_full:
        print(f"  {short_name}: {value:.2f}")


def main() -> None:
    args = parse_args()
    df, source = load_snapshots(args)
    artifact, _meta = build_reliability(df, args.min_obs)
    write_json(args.out, artifact)
    print_summary(artifact, source, args.out)


if __name__ == "__main__":
    main()
