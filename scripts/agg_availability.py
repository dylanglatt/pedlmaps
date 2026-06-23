#!/usr/bin/env python3
"""Aggregate one Citi Bike trip CSV into a persistent departures/arrivals
accumulator keyed by (station, day-of-week, hour). Run once per CSV; state is
kept in a pickle so a big month can be processed file-by-file.

Day-of-week is stored in JS getDay() convention (0=Sun .. 6=Sat) so the
on-device lib can index it directly.
"""
import sys, os, pickle
import numpy as np
import pandas as pd

PKL = os.environ.get("AGG_PKL", "/tmp/agg.pkl")
COLS = ["started_at", "ended_at", "start_station_id", "end_station_id",
        "start_station_name", "start_lat", "start_lng"]


def load():
    if os.path.exists(PKL):
        with open(PKL, "rb") as f:
            return pickle.load(f)
    return {"dep": {}, "arr": {}, "info": {}}


def grid(d, sid):
    g = d.get(sid)
    if g is None:
        g = np.zeros((7, 24), dtype=np.int64)
        d[sid] = g
    return g


def add_events(target, ids, ts, info=None, names=None, lats=None, lons=None):
    ok = ids.notna() & ts.notna()
    ids, ts = ids[ok], ts[ok]
    if names is not None:
        names, lats, lons = names[ok], lats[ok], lons[ok]
    hour = pd.to_numeric(ts.str.slice(11, 13), errors="coerce")
    dt = pd.to_datetime(ts.str.slice(0, 10), format="%Y-%m-%d", errors="coerce")
    ok2 = hour.notna() & dt.notna()
    ids, hour, dt = ids[ok2], hour[ok2].astype(int), dt[ok2]
    jsdow = (dt.dt.dayofweek + 1) % 7  # Mon0->1 ... Sun6->0
    df = pd.DataFrame({"sid": ids.values, "d": jsdow.values, "h": hour.values})
    for (sid, d, h), n in df.groupby(["sid", "d", "h"]).size().items():
        grid(target, sid)[d, h] += n
    if info is not None:
        names, lats, lons = names[ok2], lats[ok2], lons[ok2]
        for sid, nm, la, lo in zip(ids.values, names.values, lats.values, lons.values):
            if sid not in info:
                try:
                    info[sid] = {"name": nm, "lat": float(la), "lon": float(lo)}
                except (TypeError, ValueError):
                    info[sid] = {"name": nm, "lat": None, "lon": None}


def main(path):
    state = load()
    dep, arr, info = state["dep"], state["arr"], state["info"]
    rows = 0
    src = sys.stdin if path == "-" else path
    label = os.environ.get("SRC_LABEL", "stdin") if path == "-" else os.path.basename(path)
    for chunk in pd.read_csv(src, usecols=COLS, dtype=str, chunksize=400000):
        rows += len(chunk)
        add_events(dep, chunk["start_station_id"], chunk["started_at"], info,
                   chunk["start_station_name"], chunk["start_lat"], chunk["start_lng"])
        add_events(arr, chunk["end_station_id"], chunk["ended_at"])
    with open(PKL, "wb") as f:
        pickle.dump(state, f)
    print(f"{label}: {rows} rows · {len(info)} stations · pkl={os.path.getsize(PKL)//1024}KB")


if __name__ == "__main__":
    main(sys.argv[1])
