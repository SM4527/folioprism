#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

./scripts/personal-stop.sh && ./scripts/personal-start.sh
