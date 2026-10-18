#!/usr/bin/env bash
# Roll the VPS back to an earlier commit and rebuild api + web.
#   bash scripts/rollback-production.sh <git-sha>
# NOTE: the GitHub deploy workflow resets the server to origin/master on every push, so after rolling back here also
# `git revert` the bad change on master (or the next push redeploys it). Database migrations are NOT undone — the
# migrations in this repo are additive (new nullable columns), so older code keeps working against the newer schema.
set -euo pipefail

SHA="${1:-}"
if [ -z "$SHA" ]; then echo "usage: $0 <git-sha>" >&2; exit 2; fi

ROOT=/opt/nation-reporters
COMPOSE="docker compose -f docker-compose.server.yml"
cd "$ROOT"

git fetch origin
git cat-file -e "$SHA^{commit}" || { echo "unknown commit $SHA" >&2; exit 1; }
echo "Rolling back $(git rev-parse --short HEAD) -> $(git rev-parse --short "$SHA")"
git reset --hard "$SHA"

$COMPOSE up -d --build api web

for i in $(seq 1 60); do
  if curl -sf http://localhost:3001/api/v1/health/live >/dev/null && curl -sf http://localhost:3000/ >/dev/null; then
    echo "Rolled back to $(git rev-parse --short HEAD) after ${i}0s"
    $COMPOSE ps api web
    exit 0
  fi
  sleep 10
done
echo "Timed out waiting for api/web after rollback" >&2
$COMPOSE logs api --tail 30 || true
$COMPOSE logs web --tail 30 || true
exit 1
