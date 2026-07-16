#!/bin/sh
# Production entrypoint for the FastBillings API container.
#
# Ensures the database schema is current and baseline lookup data is present
# BEFORE the server starts, so a deploy/update is just `docker compose up -d`
# with no forgotten manual migration step (the #1 self-host footgun).
#
#   1. Apply any pending Prisma migrations  (idempotent: only pending ones run)
#   2. Seed baseline lookup data            (idempotent; skip with SEED_ON_BOOT=false)
#   3. exec the container command (node server.js)
#
# Requires `prisma` to be present in the image (it is — a runtime dependency).
set -e

echo "[entrypoint] Applying database migrations (prisma migrate deploy)..."
# Brief retry in case the DB is still accepting connections. Compose already
# gates on postgres healthcheck, so this is just belt-and-suspenders.
n=0
until npx prisma migrate deploy; do
  n=$((n + 1))
  if [ "$n" -ge 5 ]; then
    echo "[entrypoint] migrate deploy failed after $n attempts — aborting." >&2
    exit 1
  fi
  echo "[entrypoint] migrate deploy failed (attempt $n/5) — retrying in 3s..."
  sleep 3
done
echo "[entrypoint] Migrations applied."

if [ "${SEED_ON_BOOT:-true}" = "true" ]; then
  echo "[entrypoint] Seeding baseline data (idempotent; set SEED_ON_BOOT=false to skip)..."
  # Never let a seed hiccup stop the server from booting.
  npx prisma db seed || echo "[entrypoint] WARN: baseline seed reported an error (continuing)."
else
  echo "[entrypoint] SEED_ON_BOOT=false — skipping baseline seed."
fi

echo "[entrypoint] Starting: $*"
exec "$@"
