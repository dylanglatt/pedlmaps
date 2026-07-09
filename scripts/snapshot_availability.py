#!/usr/bin/env python3
"""Snapshot live Citi Bike availability into a local SQLite DB, for validating the
typical-availability predictions against reality. Run it on a schedule (cron / a
Cowork scheduled task) a few times a day for a week or two; then run check_accuracy.py.

This is a DEVELOPER tool — it is not part of the app and ships nothing. Stdlib only
so it runs on the droplet with no extra deps.

Each run inserts one row per station (idempotent — INSERT OR IGNORE on
UNIQUE(short_name, ts_iso), so re-running a given minute is a no-op):
  ts_iso, js_day(0=Sun..6=Sat), hour, short_name, capacity, bikes, ebikes, classic, docks

Env:
  PEDL_DB  database path (default: ~/pedl.db)
"""
import json, os, sqlite3, sys, urllib.request
from datetime import datetime
try:
    from zoneinfo import ZoneInfo
    NYC = ZoneInfo("America/New_York")  # patterns are NYC-local; don't rely on host TZ
except Exception:
    NYC = None  # falls back to host local time (set the droplet TZ to America/New_York)

INFO_URL = "https://gbfs.lyft.com/gbfs/1.1/bkn/en/station_information.json"
STATUS_URL = "https://gbfs.lyft.com/gbfs/1.1/bkn/en/station_status.json"
DB = os.path.expanduser(os.environ.get("PEDL_DB", "~/pedl.db"))
COLS = ["ts_iso", "js_day", "hour", "short_name", "capacity", "bikes", "ebikes", "classic", "docks"]

DDL = """CREATE TABLE IF NOT EXISTS snapshots (
    ts_iso     TEXT,
    js_day     INTEGER,
    hour       INTEGER,
    short_name TEXT,
    capacity   INTEGER,
    bikes      INTEGER,
    ebikes     INTEGER,
    classic    INTEGER,
    docks      INTEGER,
    UNIQUE(short_name, ts_iso)
)"""
INDEX = "CREATE INDEX IF NOT EXISTS idx_snapshots_station_ts ON snapshots(short_name, ts_iso)"


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

    rows = []
    for st in status:
        meta = info.get(st["station_id"])
        if not meta or not meta.get("short_name"):
            continue
        bikes = st.get("num_bikes_available", 0) or 0
        ebikes = st.get("num_ebikes_available", 0) or 0
        classic = max(0, bikes - ebikes)
        docks = st.get("num_docks_available", 0) or 0
        rows.append((ts, js_day, hour, meta["short_name"], meta.get("capacity", 0),
                     bikes, ebikes, classic, docks))

    conn = sqlite3.connect(DB)
    conn.execute(DDL)
    conn.execute(INDEX)
    before = conn.total_changes
    conn.executemany(
        f"INSERT OR IGNORE INTO snapshots ({', '.join(COLS)}) VALUES ({', '.join('?' * len(COLS))})",
        rows)
    inserted = conn.total_changes - before
    conn.commit()
    conn.close()
    print(f"{ts}: inserted {inserted} of {len(rows)} stations -> {DB}")


if __name__ == "__main__":
    sys.exit(main())
