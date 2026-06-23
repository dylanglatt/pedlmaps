#!/usr/bin/env python3
"""Build the availability table (schema 2) with a per-bike-type split.

For each station, weekday and bike type (electric / classic) we take net flow
(arrivals - departures) per hour, detrend it, cumulatively sum to a relative
level, and shift to be non-negative. The two types are then put on a shared
scale (their combined daily max = 100) so they STACK: bar height = fe+fc is the
typical bike availability, split into electric vs manual.

Output: lib/availability.json
  { meta, stations: { "<short_name>": { name, samples, fe:[7][24], fc:[7][24] } } }
  days = JS getDay() (0=Sun..6=Sat). fe/fc are 0-100, stack to total fullness.
  Docks availability is derived on-device as 100-(fe+fc).
"""
import sys, os, pickle, json
import numpy as np

PKL = os.environ.get("AGG_PKL", "/tmp/agg.pkl")
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/availability.json"
MIN_SAMPLES = int(os.environ.get("MIN_SAMPLES", "200"))


def norm_id(sid):
    sid = str(sid)
    if "." in sid:
        a, b = sid.split(".", 1)
        return f"{a}.{(b + '00')[:2]}"
    return sid


def level_shape(dep, arr):
    """Non-negative relative level per day (7x24) from detrended cumulative flow."""
    out = np.zeros((7, 24), dtype=float)
    for d in range(7):
        net = (arr[d] - dep[d]).astype(float)
        net -= net.mean()
        lvl = np.cumsum(net)
        lvl -= lvl.min()
        out[d] = lvl
    return out


def split_fullness(dep_e, arr_e, dep_c, arr_c):
    le = level_shape(dep_e, arr_e)
    lc = level_shape(dep_c, arr_c)
    fe = [[0] * 24 for _ in range(7)]
    fc = [[0] * 24 for _ in range(7)]
    for d in range(7):
        combined = le[d] + lc[d]
        m = combined.max()
        if m < 1e-9:
            continue
        scale = 100.0 / m
        for h in range(24):
            fe[d][h] = int(round(le[d][h] * scale))
            fc[d][h] = int(round(lc[d][h] * scale))
    return fe, fc


def merge(src, info):
    out, minfo = {}, {}
    for sid, g in src.items():
        k = norm_id(sid)
        out[k] = out.get(k, np.zeros((7, 24), dtype=np.int64)) + g
        if sid in info and k not in minfo:
            minfo[k] = info[sid]
    return out, minfo


def main():
    s = pickle.load(open(PKL, "rb"))
    info = s["info"]
    dep_e, minfo = merge(s["dep_e"], info)
    arr_e, _ = merge(s["arr_e"], info)
    dep_c, _ = merge(s["dep_c"], info)
    arr_c, _ = merge(s["arr_c"], info)

    Z = lambda: np.zeros((7, 24), dtype=np.int64)
    ids = set(dep_e) | set(arr_e) | set(dep_c) | set(arr_c)
    stations, kept, dropped = {}, 0, 0
    for sid in ids:
        de, ae = dep_e.get(sid, Z()), arr_e.get(sid, Z())
        dc, ac = dep_c.get(sid, Z()), arr_c.get(sid, Z())
        samples = int(de.sum() + ae.sum() + dc.sum() + ac.sum())
        if samples < MIN_SAMPLES:
            dropped += 1
            continue
        fe, fc = split_fullness(de, ae, dc, ac)
        stations[sid] = {"name": minfo.get(sid, {}).get("name", ""), "samples": samples, "fe": fe, "fc": fc}
        kept += 1

    out = {
        "meta": {"schema": 2, "source": os.environ.get("SRC_MONTHS", "202505"),
                 "days": "0=Sun..6=Sat", "metric": "fullness-0-100 split fe(electric)+fc(classic)",
                 "stations": kept},
        "stations": stations,
    }
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"wrote {OUT}: {kept} kept, {dropped} dropped, {os.path.getsize(OUT)//1024}KB")


if __name__ == "__main__":
    main()
