#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Node reads .env itself, so a Windows node.exe under WSL needs no WSLENV.
npx tsx --env-file-if-exists=.env scripts/refresh-funds.ts "$@"
echo "Run ./scripts/restart.sh to load the new data."
