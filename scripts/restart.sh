#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export COMPOSE_FILE=docker/docker-compose.yml

./scripts/stop.sh && ./scripts/start.sh
