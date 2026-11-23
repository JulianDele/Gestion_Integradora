#!/usr/bin/env bash
set -euo pipefail

container_id=$(docker compose ps -q web)
if [[ -z "$container_id" ]]; then
  echo "El servicio web no esta en ejecucion." >&2
  exit 1
fi
backup_name="sales-$(date -u +%Y%m%dT%H%M%SZ).db"
docker compose exec -T web node -e "require('better-sqlite3')('/app/data/sales.db').backup('/app/data/${backup_name}')"
mkdir -p backups
docker cp "${container_id}:/app/data/${backup_name}" "backups/${backup_name}"
echo "Respaldo creado: backups/${backup_name}"