#!/usr/bin/env bash
#
# Validate the schema against a real PostgreSQL, without the Supabase stack.
#
# Why this exists
# ---------------
# `supabase start` needs ~2 GB of images, and the large ones (supabase/postgres
# in particular) fail on constrained or throttled connections. That is a slow
# feedback loop for a migration typo.
#
# This script runs every migration, the seed, and the invariant checks against
# a throwaway `postgres:16-alpine` container in a few seconds. It stubs the
# handful of Supabase-managed objects the migrations reference (the `auth`
# schema and the anon/authenticated/service_role roles).
#
# What it does NOT cover: RLS policy behaviour under a real user session, or
# anything requiring GoTrue, Storage or PostgREST. Those need the full stack.
# It validates our DDL — types, constraints, indexes, triggers, foreign keys —
# which is where migration bugs actually live.
#
# Usage:  ./scripts/verify-schema.sh
set -euo pipefail

CONTAINER="${CONTAINER:-ms-schema-check}"
IMAGE="${IMAGE:-postgres:16-alpine}"
PORT="${PORT:-55432}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

psql_run() { docker exec -i "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

cleanup() {
  if [ "${KEEP:-0}" != "1" ]; then
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  else
    echo "Container '$CONTAINER' left running on port $PORT (KEEP=1)."
  fi
}
trap cleanup EXIT

echo "==> Starting throwaway PostgreSQL ($IMAGE)"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=postgres \
  -p "${PORT}:5432" "$IMAGE" >/dev/null

printf '==> Waiting for readiness'
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then
    echo " — ready"
    break
  fi
  printf '.'
  sleep 1
done

echo "==> Installing Supabase-managed stubs (auth schema, roles)"
psql_run <<'SQL'
create extension if not exists pgcrypto;

create role anon;
create role authenticated;
create role service_role;

-- Mirror the grants a real Supabase project applies at creation time.
--
-- Without these the roles exist but hold no table privileges, so a query made
-- as `authenticated` fails with "permission denied" BEFORE any policy is
-- evaluated — which silently defeats the point of testing policies at all.
-- That blind spot let a self-referential `staff_users` policy reach the hosted
-- database (see migration 0017).
--
-- Default privileges are used rather than a one-off GRANT because the
-- migrations have not created their tables yet at this point. Migrations that
-- revoke from these roles (0012, and every write routine) then take effect on
-- top, exactly as they do in production.
grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;

create schema if not exists auth;

-- Mirrors the columns of Supabase's auth.users that the seed writes to.
create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  instance_id        uuid,
  aud                text,
  role               text,
  email              text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  created_at         timestamptz,
  updated_at         timestamptz,
  raw_app_meta_data  jsonb,
  raw_user_meta_data jsonb,
  -- Nullable with no default in the real GoTrue schema, and GoTrue scans them
  -- into Go strings. Mirrored here so the seed is exercised against the same
  -- shape it will meet on a hosted project.
  confirmation_token      varchar,
  recovery_token          varchar,
  email_change_token_new  varchar,
  email_change            varchar
);

-- Real implementation reads the request JWT; null is correct for DDL checks.
create or replace function auth.uid() returns uuid
language sql stable as $$ select null::uuid $$;
SQL

echo "==> Applying migrations"
for file in "$ROOT"/supabase/migrations/*.sql; do
  printf '    %-42s' "$(basename "$file")"
  if psql_run < "$file" >/dev/null 2>/tmp/ms-migrate-err; then
    echo "ok"
  else
    echo "FAILED"
    grep -iE '^(ERROR|DETAIL|HINT)' /tmp/ms-migrate-err | head -5
    exit 1
  fi
done

echo "==> Applying seed"
if psql_run < "$ROOT/supabase/seed.sql" >/dev/null 2>/tmp/ms-seed-err; then
  echo "    ok"
else
  echo "    FAILED"
  grep -iE '^(ERROR|DETAIL|HINT)' /tmp/ms-seed-err | head -5
  exit 1
fi

echo "==> Checking invariants"
# `|| true` matters: the file sets ON_ERROR_STOP, so a failing check makes psql
# exit non-zero, and under `set -e` a failing command substitution would abort
# the script BEFORE the output below is printed - hiding the very error the run
# exists to surface.
output=$(docker exec -i "$CONTAINER" psql -U postgres -q \
  < "$ROOT/tests/integration/schema-invariants.sql" 2>&1 || true)

echo "$output" | grep -vE '^\(1 row\)|^-+$|^ *must_|^$' | sed 's/^/    /'

if echo "$output" | grep -qE 'FAIL|^ERROR:'; then
  echo ""
  echo "==> INVARIANT CHECKS FAILED"
  exit 1
fi

echo ""
echo "==> All checks passed"
