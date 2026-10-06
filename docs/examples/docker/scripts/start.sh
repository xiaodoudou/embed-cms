#!/usr/bin/env bash
# Runs the image with the secrets of .env (compose.yaml says how), and waits until it says it is healthy.
#
#   ./scripts/start.sh         makes or checks .env, builds the image if there is none, and starts the container (or replaces it, when the
#                              image or .env changed since: compose compares)
#
# Stop it with `docker compose stop`, read it with `docker compose logs -f`. The records are in the volume embed-cms-docker_data, which stays
# when the container is replaced (a new image, a new .env) and even with `docker compose down`.
set -euo pipefail
. "$(dirname "$0")/common.sh"
need_docker
need_compose

./scripts/env.sh
if ! docker image inspect "$IMAGE:$TAG" >/dev/null 2>&1; then
  ./scripts/build.sh
fi

# --wait returns when the container is healthy (the HEALTHCHECK of the image), and fails when it stops or is not healthy in time
if ! docker compose up --detach --wait --wait-timeout 90 --no-build; then
  echo "it did not come up, this is what it said:" >&2
  docker compose logs --tail 30 >&2
  exit 1
fi
echo "up: http://localhost:$(setting HOST_PORT 3000)/admin (the administrator is ADMIN_USERNAME of .env, with its ADMIN_PASSWORD)"
