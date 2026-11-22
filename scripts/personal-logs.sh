#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export COMPOSE_FILE=docker/compose.personal.yml

docker compose logs -f app db
