#!/usr/bin/env bash
# Makes the .env of the deployment, and checks it.
#
#   ./scripts/env.sh           makes .env from .env.example when there is none, fills the secrets that are empty with random
#                              values (the ones that are there are never changed), then checks the file
#   ./scripts/env.sh --check   only checks: it writes nothing
#
# No value is printed: they are in .env, and only there.
set -euo pipefail
. "$(dirname "$0")/common.sh"

# the secrets that are made here, and the length of each (a random value is made of hexadecimal digits: 2 per byte)
GENERATED="AUTH_SECRET:64 SESSION_SECRET:64 ADMIN_PASSWORD:24"

random() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

# the secrets of .env that are empty are filled; the others stay as they are
fill() {
  local tmp line name entry length filled=""
  tmp="$(mktemp .env.XXXXXX)"
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    name="${line%%=*}"
    for entry in $GENERATED; do
      if [ "$name" = "${entry%%:*}" ] && [ "$line" = "$name=" ]; then
        length="${entry##*:}"
        line="$name=$(random | cut -c1-"$length")"
        filled="$filled $name"
      fi
    done
    printf '%s\n' "$line"
  done < .env > "$tmp"
  mv "$tmp" .env
  chmod 600 .env 2>/dev/null || true
  if [ -n "$filled" ]; then
    echo "made random values for:$filled (they are in .env, and only there)"
  fi
}

check() {
  local problems=0 auth session admin
  complain() { echo "  .env: $1" >&2; problems=$((problems + 1)); }
  auth="$(env_value AUTH_SECRET)"
  session="$(env_value SESSION_SECRET)"
  [ "${#auth}" -ge 32 ] || complain "AUTH_SECRET is missing or shorter than 32 characters"
  [ "${#session}" -ge 32 ] || complain "SESSION_SECRET is missing or shorter than 32 characters"
  [ "$auth" != "$session" ] || complain "AUTH_SECRET and SESSION_SECRET are the same value"
  # the administrator is optional once one exists: no line, no account made. A line that is there has to be right.
  if grep -q '^ADMIN_PASSWORD=' .env; then
    admin="$(env_value ADMIN_PASSWORD)"
    [ "${#admin}" -ge 12 ] || complain "ADMIN_PASSWORD is shorter than 12 characters (delete the line to make no administrator)"
    [ -n "$(env_value ADMIN_USERNAME)" ] || complain "ADMIN_USERNAME is empty"
  fi
  if [ "$problems" -gt 0 ]; then
    echo ".env has $problems problem(s). Fix them, or delete the secrets you want made again and run ./scripts/env.sh" >&2
    return 1
  fi
}

if [ "${1:-}" = "--check" ]; then
  [ -f .env ] || { echo ".env does not exist: run ./scripts/env.sh" >&2; exit 1; }
  check
  exit
fi

if [ ! -f .env ]; then
  # only the owner may read what is made here
  (umask 077 && cp .env.example .env)
  echo "made .env from .env.example"
fi
(umask 077 && fill)
check
echo ".env is ready"
