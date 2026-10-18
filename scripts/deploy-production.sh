#!/usr/bin/env bash
set -euo pipefail

ROOT=/opt/nation-reporters
COMPOSE="docker compose -f docker-compose.server.yml"

cd "$ROOT"

# Optional per-server settings (e.g. BACKUP_DB=1). Not tracked in git.
[ -f "$ROOT/.deploy.env" ] && . "$ROOT/.deploy.env"

PREV_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)

# Recommended before releases that include Prisma migrations: set BACKUP_DB=1 in /opt/nation-reporters/.deploy.env.
if [ "${BACKUP_DB:-0}" = "1" ]; then
  mkdir -p /opt/backups
  BK="/opt/backups/nationreporters-$(date -u +%Y%m%dT%H%M%SZ)-pre-${PREV_SHA}.sql.gz"
  echo "Backing up database to $BK ..."
  $COMPOSE exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" nationreporters' | gzip > "$BK"
  ls -1t /opt/backups/nationreporters-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
fi

echo "Syncing to origin/master (currently $PREV_SHA)..."
git fetch origin master
git reset --hard origin/master

echo "Rebuilding api + web..."
$COMPOSE up -d --build api web

echo "Waiting for services..."
for i in $(seq 1 60); do
  if curl -sf http://localhost:3001/api/v1/health/live >/dev/null \
    && curl -sf http://localhost:3000/ >/dev/null; then
    echo "Ready after ${i}0s"
    echo "Deployed $(git rev-parse --short HEAD) at $(date -u +%Y-%m-%dT%H:%M:%SZ) (previous release: $PREV_SHA)"
    echo "Rollback: bash scripts/rollback-production.sh $PREV_SHA   (see docs/DEPLOYMENT.md)"
    $COMPOSE ps api web
    exit 0
  fi
  sleep 10
done

echo "Timed out waiting for api/web (previous release: $PREV_SHA — rollback: bash scripts/rollback-production.sh $PREV_SHA)"
$COMPOSE ps api web || true
$COMPOSE logs api --tail 30 || true
$COMPOSE logs web --tail 30 || true
exit 1
