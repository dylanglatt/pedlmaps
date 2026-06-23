#!/usr/bin/env python3
"""Turn the departures/arrivals accumulator into the compact availability table
shipped to the app.

For each station and weekday we take net flow (arrivals - departures) per hour,
cumulatively sum it across the day to get a relative level curve, then min-max
normalize to 0-100 ("typical fullness"). The app joins this to live GBFS via
the station short_name (== the trip-data station id).

Output: lib/availability.json
  { meta, stations: { "<short_name>": { name, samples, f: [7][24] } } }
  days are JS getDay() order: 0=Sun .. 6=Sat. f = bikes-fullness 0-100.
"""
import sys, os, pickle, json
import numpy as np

PKL = os.environ.get("AGG_PKL", "/tmp/agg.pkl")
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/availability.json"
MIN_SAMPLES = int(os.environ.get("MIN_SAMPLES", "200"))  # drop noisy/low-traffic stations


def norm_id(sid):
    """Station ids are 'NNNN.DD'. Trip data sometimes drops a trailing zero
    ('5779.1' for '5779.10'); GBFS short_name keeps two decimals. Pad to match."""
    sid = str(sid)
    if "." in sid:
        a, b = sid.split(".", 1)
        return f"{a}.{(b + '00')[:2]}"
    return sid


def fullness(dep, arr):
    """7x24 normalized fullness (0-100) from net-flow cumulative level shape."""
    out = []
    for d in range(7):
        net = (arr[d] - dep[d]).astype(float)
        net -= net.mean()                 # detrend: a station returns to ~same level daily
        level = np.cumsum(net)            # intraday level shape (cyclical, no drift)
        lo, hi = level.min(), level.max()
        if hi - lo < 1e-9:
            row = [50] * 24               # flat / no signal
        else:
            row = [int(round((x - lo) / (hi - lo) * 100)) for x in level]
        out.append(row)
    return out


def main():
    state = pickle.load(open(PKL, "rb"))
    dep, arr, info = state["dep"], state["arr"], state["info"]

    # Merge departures/arrivals/info onto normalized ids (combines split rows).
    mdep, marr, minfo = {}, {}, {}
    for sid, g in dep.items():
        k = norm_id(sid)
        mdep[k] = mdep.get(k, np.zeros((7, 24), dtype=np.int64)) + g
        if sid in info and k not in minfo:
            minfo[k] = info[sid]
    for sid, g in arr.items():
        k = norm_id(sid)
        marr[k] = marr.get(k, np.zeros((7, 24), dtype=np.int64)) + g
    dep, arr, info = mdep, marr, minfo

    stations = {}
    kept = dropped = 0
    for sid, g_dep in dep.items():
        g_arr = arr.get(sid)
        if g_arr is None:
            continue
        samples = int(g_dep.sum() + g_arr.sum())
        if samples < MIN_SAMPLES:
            dropped += 1
            continue
        meta = info.get(sid, {})
        stations[sid] = {
            "name": meta.get("name", ""),
            "samples": samples,
            "f": fullness(g_dep, g_arr),
        }
        kept += 1
    out = {
        "meta": {
            "schema": 1,
            "source": os.environ.get("SRC_MONTHS", "202505"),
            "days": "0=Sun..6=Sat",
            "metric": "bikes-fullness-0-100",
            "stations": kept,
        },
        "stations": stations,
    }
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"wrote {OUT}: {kept} stations kept, {dropped} dropped (<{MIN_SAMPLES} samples), {os.path.getsize(OUT)//1024}KB")


if __name__ == "__main__":
    main()
