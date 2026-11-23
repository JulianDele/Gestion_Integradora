#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker es requerido para desplegar." >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 es requerido para desplegar." >&2
  exit 1
fi
if [[ ! -f .env ]]; then
  echo "Falta .env. Ejecuta scripts/setup.sh y configura los secretos primero." >&2
  exit 1
fi
docker compose up -d --build --remove-orphans
docker compose ps