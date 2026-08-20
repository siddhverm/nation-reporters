#!/bin/bash
set -euo pipefail
ROOT=/opt/nation-reporters
cp -v /tmp/nr-web-patch/page.tsx "$ROOT/apps/web/app/(public)/article/[slug]/page.tsx"
cp -v /tmp/nr-web-patch/reader-summary.ts "$ROOT/apps/web/lib/reader-summary.ts"
cp -v /tmp/nr-web-patch/api-client.ts "$ROOT/apps/web/lib/api-client.ts"
if [[ -f /tmp/nr-web-patch/reader-summary.util.ts ]]; then
  cp -v /tmp/nr-web-patch/reader-summary.util.ts "$ROOT/apps/api/src/common/reader-summary.util.ts"
fi
grep -n 'summaryOnlyMode\|Also.read\|timeoutMs\|trimSummaryDisplay(raw' \
  "$ROOT/apps/web/app/(public)/article/[slug]/page.tsx" \
  "$ROOT/apps/web/lib/reader-summary.ts" \
  "$ROOT/apps/web/lib/api-client.ts" | head -40
cd "$ROOT"
docker compose -f docker-compose.server.yml up -d --build web
echo DONE
