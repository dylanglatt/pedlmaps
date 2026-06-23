#!/usr/bin/env python3
"""Snapshot live Citi Bike availability to a CSV log, for validating the typical-
availability predictions against reality. Run it on a schedule (cron / a Cowork
scheduled task) a few times a day for a week or two; then run check_accuracy.py.

This is a DEVELOPER tool — it is not part of the app and ships nothing.

Each run appends one row per station:
  ts_iso, js_day(0=Sun..6=Sat), hour, short_name, capacity, bikes, ebikes, classic, docks

Env:
  SNAP_CSV  output path (default: scripts/snapshots.csv)
"""
import csv, json, os, sys, urllib.request
from datetime import datetime
try:
    from zoneinfo import ZoneInfo
    NYC = ZoneInfo("America/New_York")  # patterns are NYC-local; don't rely on host TZ
except Exception:
    NYC = None  # falls back to host local time (set the droplet TZ to America/New_York)

INFO_URL = "https://gbfs.lyft.com/gbfs/1.1/bkn/en/station_information.json"
STATUS_URL = "https://gbfs.lyft.com/gbfs/1.1/bkn/en/station_status.json"
OUT = os.environ.get("SNAP_CSV", os.path.join(os.path.dirname(__file__), "snapshots.csv"))
COLS = ["ts_iso", "js_day", "hour", "short_name", "capacity", "bikes", "ebikes", "classic", "docks"]


def fetch(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)


def main():
    info = {s["station_id"]: s for s in fetch(INFO_URL)["data"]["stations"]}
    status = fetch(STATUS_URL)["data"]["stations"]
    now = datetime.now(NYC) if NYC else datetime.now()
    js_day = (now.weekday() + 1) % 7  # Python Mon=0..Sun=6 -> JS Sun=0..Sat=6
    hour = now.hour
    ts = now.isoformat(timespec="seconds")

    new = not os.path.exists(OUT)
    rows = 0
    with open(OUT, "a", newline="") as f:
        w = csv.writer(f)
        if new:
            w.writerow(COLS)
        for st in status:
            meta = info.get(st["station_id"])
            if not meta or not meta.get("short_name"):
                continue
            bikes = st.get("num_bikes_available", 0) or 0
            ebikes = st.get("num_ebikes_available", 0) or 0
            classic = max(0, bikes - ebikes)
            docks = st.get("num_docks_available", 0) or 0
            w.writerow([ts, js_day, hour, meta["short_name"], meta.get("capacity", 0),
                        bikes, ebikes, classic, docks])
            rows += 1
    print(f"{ts}: appended {rows} stations -> {OUT}")


if __name__ == "__main__":
    sys.exit(main())
