#!/usr/bin/env bash
# snap_relay.sh — droplet relay for pedl availability snapshots.
#
# Replaces the old GitHub-Contents-API relay (which gzip'd -> base64'd -> PUT each
# snapshot CSV to the private pedl-data repo). Snapshots now go straight into a local
# SQLite DB at ~/pedl.db, so this just runs the collector — no gzip, base64, curl, or
# GitHub token involved.
#
# cron (every 15 min):
#   */15 * * * * /path/to/citi-bike-app/scripts/droplet/snap_relay.sh >> ~/pedl_snap.log 2>&1
#
# Migration: once this is live, DELETE the old GitHub PUT relay script and the token
# file ~/.pedl_data_token — neither is used anymore; the data stays on the droplet.
set -euo pipefail

export PEDL_DB="${PEDL_DB:-$HOME/pedl.db}"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$DIR/../snapshot_availability.py"
