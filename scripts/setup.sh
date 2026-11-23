#!/usr/bin/env bash
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 es requerido. Instala Node.js antes de continuar." >&2
  exit 1
fi
node -e "const major = Number(process.versions.node.split('.')[0]); if (major !== 20) { console.error('Se requiere Node.js 20; detectado ' + process.version); process.exit(1); }"
npm install
mkdir -p data
if [[ ! -f .env ]]; then
  cp .env.example .env
  session_secret=$(openssl rand -hex 32)
  admin_password=$(openssl rand -hex 12)
  grafana_password=$(openssl rand -hex 12)
  sed -i "s|replace-this-with-a-long-random-secret|${session_secret}|" .env
  sed -i "s|change-this-password|${admin_password}|" .env
  sed -i "s|change-this-grafana-password|${grafana_password}|" .env
  printf 'Credenciales iniciales guardadas en .env\nUsuario: admin\nContrasena inicial: %s\n' "$admin_password"
fi
npm run build
echo "Configuracion terminada. Ejecuta npm start para iniciar la aplicacion."