#!/bin/sh
# Native macOS / Linux; no WSL or nested VM dependency.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PIN=4ca1bc74fc088242931054cac963cdfd91589b51
PYTHON=${PYTHON:-python3}
"$PYTHON" -m venv "$ROOT/.venv-sitl"
"$ROOT/.venv-sitl/bin/python" -m pip install -r "$ROOT/requirements-sitl.txt"
mkdir -p "$ROOT/.tools"
if [ ! -d "$ROOT/.tools/ardupilot" ]; then
    git clone --no-checkout --filter=blob:none https://github.com/ArduPilot/ardupilot.git "$ROOT/.tools/ardupilot"
fi
cd "$ROOT/.tools/ardupilot"
if [ -n "$(git status --porcelain)" ]; then echo 'ArduPilot checkout has changes; refusing checkout' >&2; exit 1; fi
git fetch --depth 1 origin "$PIN"
git checkout --detach "$PIN"
git submodule update --init --recursive --depth 1
# waf selects 'python' from PATH for code generation. Keep it in this venv.
PATH="$ROOT/.venv-sitl/bin:$PATH"
export PATH
python waf configure --board sitl
python waf rover -j "${JOBS:-6}"
