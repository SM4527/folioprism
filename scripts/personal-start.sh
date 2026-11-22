#!/usr/bin/env bash
# Personal stack (real holdings, data/local overlay on) at http://localhost:8430.
set -euo pipefail
cd "$(dirname "$0")/.."
export COMPOSE_FILE=docker/compose.personal.yml
if [ -f .env ]; then export COMPOSE_ENV_FILES=.env; fi

docker compose up -d --build
for _ in $(seq 60); do
  if curl -fs http://localhost:8430/api/health > /dev/null; then
    echo "FolioPrism (personal) running at http://localhost:8430"
    exit 0
  fi
  sleep 2
done
echo "Personal stack did not become healthy; see ./scripts/personal-logs.sh" >&2
exit 1
