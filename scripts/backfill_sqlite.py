#!/usr/bin/env python3
"""One-off: backfill the SQLite DB from the legacy pedl-data/data/*.csv.gz archive.

Reads every gzipped snapshot via combine.load(), then bulk INSERT OR IGNORE into
the `snapshots` table at $PEDL_DB. Idempotent — safe to re-run; it only adds rows
the DB doesn't already have. DEVELOPER tool; run it once after cloning pedl-data.

Usage:  python3 scripts/backfill_sqlite.py [DATA_DIR]
    DATA_DIR  directory of *.csv.gz snapshots (default: pedl-data/data)
Env:
    PEDL_DB   database path (default: ~/pedl.db)
"""
import os, sqlite3, sys

import combine

DB = os.path.expanduser(os.environ.get("PEDL_DB", "~/pedl.db"))


def main():
    data_dir = sys.argv[1] if len(sys.argv) > 1 else "pedl-data/data"
    df = combine.load(data_dir)

    # Cast to native Python types — sqlite3 can't bind numpy scalars.
    rows = [
        (r.ts_iso, int(r.js_day), int(r.hour), r.short_name, int(r.capacity),
         int(r.bikes), int(r.ebikes), int(r.classic), int(r.docks))
        for r in df.itertuples(index=False)
    ]

    conn = sqlite3.connect(DB)
    combine.ensure_schema(conn)
    before = conn.total_changes
    conn.executemany(
        f"INSERT OR IGNORE INTO snapshots ({', '.join(combine.COLS)}) "
        f"VALUES ({', '.join('?' * len(combine.COLS))})",
        rows)
    inserted = conn.total_changes - before
    conn.commit()
    total = conn.execute("SELECT COUNT(*) FROM snapshots").fetchone()[0]
    conn.close()

    print(f"backfill: read {len(rows):,} rows from {data_dir!r}; "
          f"inserted {inserted:,} new; DB total {total:,} -> {DB}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
