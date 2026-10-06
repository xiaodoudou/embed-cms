#!/usr/bin/env bash
# What the scripts share. It is sourced, not run.

# every script works from the folder of the example, wherever it is called from
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# The value of NAME in .env (the last one, without the line end of a file edited on Windows), or nothing. .env is read, never run: a
# value with a $ or a space in it is only text.
env_value() {
  [ -f .env ] || return 0
  sed -n "s/^$1=//p" .env | tail -n 1 | tr -d '\r'
}

# the setting NAME: from the shell if it has it, else from .env, else the default
setting() {
  local current="${!1:-}"
  if [ -z "$current" ]; then
    current="$(env_value "$1")"
  fi
  printf '%s' "${current:-$2}"
}

need_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "docker is not installed (or not on the PATH of this shell)" >&2
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "docker is installed but does not answer: is the daemon running, and may this user use it?" >&2
    exit 1
  fi
}

need_compose() {
  if ! docker compose version >/dev/null 2>&1; then
    echo "docker compose (version 2, the plugin of docker) is not installed: it is what compose.yaml needs" >&2
    exit 1
  fi
}

IMAGE="$(setting IMAGE embed-cms-docker)"
TAG="$(setting TAG latest)"
