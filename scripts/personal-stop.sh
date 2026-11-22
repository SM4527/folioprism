#!/usr/bin/env bash
# Stops the personal stack; its volume is always kept (never -v).
set -euo pipefail
cd "$(dirname "$0")/.."
export COMPOSE_FILE=docker/compose.personal.yml

docker compose down
