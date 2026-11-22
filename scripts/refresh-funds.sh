#!/usr/bin/env bash
# Default: refresh public and data/local funds into gitignored data/local/ (personal stack).
# --public: refresh public funds into the tracked data/mock-funds.json for a deliberate commit.
set -euo pipefail
cd "$(dirname "$0")/.."

# Node reads .env itself, so a Windows node.exe under WSL needs no WSLENV.
npx tsx --env-file-if-exists=.env scripts/refresh-funds.ts "$@"
case " $* " in
  *" --public "*) echo "Run ./scripts/restart.sh to load the new data, then test and commit it." ;;
  *) echo "Run ./scripts/personal-restart.sh to load the new data." ;;
esac
