#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SITL_BIN=${SITL_BIN:-"$ROOT/.tools/ardupilot/build/sitl/bin/ardurover"}
BACKEND_HOST=${BACKEND_HOST:-127.0.0.1}
PHYSICS_PORT=${PHYSICS_PORT:-9002}
DEFAULTS="$ROOT/config/rover.parm"
if [ -n "${EXTRA_PARAMS:-}" ]; then DEFAULTS="$DEFAULTS,$EXTRA_PARAMS"; fi
mkdir -p "$ROOT/.run/sitl"
cd "$ROOT/.run/sitl"
exec "$SITL_BIN" --model "JSON:$BACKEND_HOST" --sim-port-out "$PHYSICS_PORT" --rate 100 --speedup 1 --home 50.4501,30.5234,100,0 --defaults "$DEFAULTS" --serial0 tcp:5760 --serial1 tcp:5762 --serial2 "udpclient:$BACKEND_HOST:${TELEMETRY_PORT:-14560}" "$@"
