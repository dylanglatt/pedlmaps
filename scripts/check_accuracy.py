#!/usr/bin/env python3
"""Score the typical-availability predictions (lib/availability.json) against the
live snapshots collected by snapshot_availability.py. DEVELOPER tool — answers
"can I trust the predictions enough to route people on them?"

Two kinds of metric:
  - Calibration: mean abs error between predicted bike-fullness (fe+fc, 0-100)
    and actual fullness (bikes/capacity*100). Lower is better.
  - Decisions (the ones that matter for "go here instead"):
      stocked precision  = when we predicted "usually has bikes" (>=45), how often
                           the station actually had >=1 bike. (high = safe to send)
      empty recall       = when the station was actually empty, how often we said
                           "usually empty" (<25). (high = we warn when we should)

Usage:  python3 scripts/check_accuracy.py [PEDL_DB] [lib/availability.json]

Env:  PEDL_DB  database path (default: ~/pedl.db)
"""
import json, os, sqlite3, sys

HERE = os.path.dirname(__file__)
DB = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser(
    os.environ.get("PEDL_DB", "~/pedl.db"))
PRED = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "..", "lib", "availability.json")
STOCKED, EMPTY = 45, 25  # fullness tiers (match patternCaption in lib/predictions.js)


def main():
    stations = json.load(open(PRED))["stations"]
    n = covered = 0
    abs_err = 0.0
    pred_stocked = pred_stocked_hit = 0   # precision of "usually has bikes"
    actual_empty = warned_empty = 0       # recall of "usually empty"

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    if conn.execute("SELECT name FROM sqlite_master WHERE type='table' "
                    "AND name='snapshots'").fetchone() is None:
        print("No snapshots table. Collect snapshots first (snapshot_availability.py).")
        return 1

    try:
        for row in conn.execute("SELECT capacity, short_name, js_day, hour, bikes "
                                "FROM snapshots"):
            n += 1
            cap = int(row["capacity"] or 0)
            sn = row["short_name"]
            pat = stations.get(sn)
            if not pat or cap <= 0:
                continue
            d, h = int(row["js_day"]), int(row["hour"])
            pred_full = pat["fe"][d][h] + pat["fc"][d][h]      # 0-100 predicted
            actual_full = 100.0 * int(row["bikes"]) / cap       # 0-100 actual
            covered += 1
            abs_err += abs(pred_full - actual_full)

            has_bike = int(row["bikes"]) >= 1
            if pred_full >= STOCKED:
                pred_stocked += 1
                if has_bike:
                    pred_stocked_hit += 1
            if not has_bike:
                actual_empty += 1
                if pred_full < EMPTY:
                    warned_empty += 1
    finally:
        conn.close()

    if covered == 0:
        print("No overlapping rows. Collect snapshots first (snapshot_availability.py).")
        return 1
    pct = lambda a, b: f"{100.0 * a / b:.0f}%" if b else "n/a"
    print(f"samples: {n}  scored: {covered}  ({n - covered} skipped: no pattern / no capacity)")
    print(f"bike-fullness MAE: {abs_err / covered:.1f}  (0-100 scale; lower = better calibrated)")
    print(f"stocked precision: {pct(pred_stocked_hit, pred_stocked)}  "
          f"(predicted 'has bikes' {pred_stocked}x, actually had a bike {pred_stocked_hit}x)")
    print(f"empty recall:      {pct(warned_empty, actual_empty)}  "
          f"(actually empty {actual_empty}x, we'd have warned {warned_empty}x)")
    print("\nRule of thumb: stocked precision >~85% before letting 'go here instead' route people.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
