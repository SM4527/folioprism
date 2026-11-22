#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export COMPOSE_FILE=docker/docker-compose.yml
if [ -f .env ]; then export COMPOSE_ENV_FILES=.env; fi

docker compose up -d --build
for _ in $(seq 60); do
  if curl -fs http://localhost:8420/api/health > /dev/null; then
    echo "FolioPrism running at http://localhost:8420"
    exit 0
  fi
  sleep 2
done
docker compose logs app
exit 1
