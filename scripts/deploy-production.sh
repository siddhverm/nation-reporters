#!/usr/bin/env bash
set -euo pipefail

ROOT=/opt/nation-reporters
COMPOSE="docker compose -f docker-compose.server.yml"

cd "$ROOT"

echo "Syncing to origin/master..."
git fetch origin master
git reset --hard origin/master

echo "Rebuilding api + web..."
$COMPOSE up -d --build api web

echo "Waiting for services..."
for i in $(seq 1 60); do
  if curl -sf http://localhost:3001/api/v1/health/live >/dev/null \
    && curl -sf http://localhost:3000/ >/dev/null; then
    echo "Ready after ${i}0s"
    echo "Deployed $(git rev-parse --short HEAD) at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    $COMPOSE ps api web
    exit 0
  fi
  sleep 10
done

echo "Timed out waiting for api/web"
$COMPOSE ps api web || true
$COMPOSE logs api --tail 30 || true
$COMPOSE logs web --tail 30 || true
exit 1
