#!/usr/bin/env bash
# Builds the image, and checks that it has no secret in it.
#
#   ./scripts/build.sh                 builds embed-cms-docker:latest
#   TAG=1.2.0 ./scripts/build.sh       builds embed-cms-docker:1.2.0 as well as :latest
#   IMAGE=registry.example.com/team/cms TAG=1.2.0 ./scripts/build.sh      the name to push under
#
# The build needs no .env, and is given none: the image is the same on every machine, and can be pushed to a registry that others read.
# (IMAGE and TAG are read from .env when there is one, and a variable of the shell wins over it.)
set -euo pipefail
. "$(dirname "$0")/common.sh"
need_docker

if [ ! -f package-lock.json ]; then
  echo "package-lock.json is missing: run npm install once, and commit it (the image installs what the lock says)" >&2
  exit 1
fi

revision="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
tags=(--tag "$IMAGE:$TAG")
if [ "$TAG" != "latest" ]; then
  tags+=(--tag "$IMAGE:latest")
fi

echo "building $IMAGE:$TAG"
docker build --pull "${tags[@]}" \
  --label "org.opencontainers.image.title=$IMAGE" \
  --label "org.opencontainers.image.revision=$revision" \
  --label "org.opencontainers.image.created=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  .

echo "checking the image"
failed=0

# 1. no .env in the image
if docker run --rm --entrypoint sh "$IMAGE:$TAG" -c 'test ! -e /app/.env'; then
  echo "  ok   no .env in the image"
else
  echo "  FAIL there is a .env in the image" >&2
  failed=1
fi

# 2. none of the secrets of .env is in the layers or in the settings of the image
if [ -f .env ]; then
  seen="$(docker image inspect "$IMAGE:$TAG"; docker history --no-trunc "$IMAGE:$TAG")"
  for name in AUTH_SECRET SESSION_SECRET ADMIN_PASSWORD; do
    value="$(env_value "$name")"
    if [ -n "$value" ] && printf '%s' "$seen" | grep -qF -- "$value"; then
      echo "  FAIL the value of $name is in the image" >&2
      failed=1
    fi
  done
  echo "  ok   no secret of .env in the layers or the settings of the image"
fi

# 3. given no secret, the image refuses to start, and says which one is missing
if output="$(docker run --rm "$IMAGE:$TAG" 2>&1)"; then
  echo "  FAIL the image started without any secret" >&2
  failed=1
elif printf '%s' "$output" | grep -q AUTH_SECRET; then
  echo "  ok   without secrets it refuses to start, and names AUTH_SECRET"
else
  echo "  FAIL it stopped without naming the secret that is missing:" >&2
  printf '%s\n' "$output" >&2
  failed=1
fi

if [ "$failed" -ne 0 ]; then
  exit 1
fi
echo "built $IMAGE:$TAG, run it with ./scripts/start.sh"
