#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export COMPOSE_FILE=docker/docker-compose.yml

read -rp "This deletes ALL holdings. Type 'yes': " answer
if [ "$answer" != "yes" ]; then
  echo "Aborted."
  exit 1
fi
docker compose down
docker volume rm -f folioprism_pgdata
./scripts/start.sh
