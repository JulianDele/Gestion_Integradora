# Sistema Web de Gestión de Ventas

Aplicación académica Full Stack con Node.js 20, Express, SQLite y una interfaz HTML/CSS/JavaScript. Incluye login, CRUD de productos, registro transaccional de ventas, historial, dashboard, pruebas Jest y despliegue con Docker.

## Requisitos

- Node.js 20 y npm
- Git
- VS Code (recomendado)
- Docker Engine y Docker Compose v2 para el despliegue en contenedor

## Instalación y ejecución local

```bash
git clone <URL_DEL_REPOSITORIO>
cd App_ventas
bash scripts/setup.sh
npm start
```

Abre `http://localhost:3000`. El script crea `.env` con secretos aleatorios y muestra la contraseña inicial de `admin`. También puedes configurar las variables manualmente: copia `.env.example` a `.env`, cambia las contraseñas y `SESSION_SECRET`, instala dependencias con `npm install` y ejecuta `npm run build` seguido de `npm start`.

Para desarrollo con reinicio automático: `npm run dev`.

Si ejecutas `npm start` sin configurar `.env`, la cuenta académica inicial es `admin` / `admin123`. Cambia estas credenciales antes de cualquier exposición de red. El usuario inicial solo se crea cuando la tabla de usuarios está vacía; cambiar las variables después no modifica la contraseña existente.

## Funcionalidad

- Login y cierre de sesión con cookie HTTP-only.
- Alta, consulta, edición y eliminación de productos.
- Registro de ventas con varios productos y validación de existencias en una transacción SQLite.
- Historial detallado de ventas.
- Dashboard de ventas del día, ingresos, catálogo e inventario.
- API JSON bajo `/api`; endpoint de métricas en `/metrics`.

## Pruebas y build

```bash
npm test
npm run build
```

Jest ejecuta pruebas unitarias de validación y pruebas de API con Supertest. El reporte de cobertura queda en `coverage/`. El build copia los recursos web a `dist/`; Express sirve ese directorio cuando existe.

También está disponible `bash scripts/test.sh` en Linux/macOS o WSL.

## Docker

Después de configurar `.env`:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f web
```

La aplicación queda en `http://localhost:3000`. SQLite persiste en el volumen Docker `sales_data`, incluso si el contenedor se reemplaza. Detener sin borrar datos: `docker compose down`. No uses `docker compose down -v` salvo que quieras eliminar los datos.

Crear respaldo SQLite consistente:

```bash
bash scripts/backup.sh
```

Los archivos se guardan en `backups/`; cópialos periódicamente a almacenamiento fuera del servidor. Para restaurar, detén la aplicación, conserva una copia del volumen actual, copia el respaldo validado como `/app/data/sales.db` al volumen y vuelve a iniciar el servicio. Ensaya este procedimiento para cumplir el RTO de 30 minutos.

### Prometheus y Grafana

Configura `GRAFANA_PASSWORD` en `.env` y arranca el perfil de monitorización:

```bash
docker compose --profile monitoring up -d
```

Prometheus y Grafana quedan enlazados a `127.0.0.1:9090` y `127.0.0.1:3001` en el servidor. Para acceso remoto, utiliza un túnel SSH o un proxy HTTPS con autenticación. Grafana tiene el datasource de Prometheus aprovisionado. Node Exporter recoge CPU, RAM y disco del host; cAdvisor recoge métricas de contenedor.

## CI/CD

El workflow `.github/workflows/pipeline.yml` corre en pull requests y pushes a `main`:

1. Checkout del repositorio.
2. Instalación de Node.js 20.
3. Instalación de dependencias.
4. Pruebas Jest y cobertura.
5. Build de la aplicación.
6. Despliegue por SSH en pushes exitosos a `main`, cuando se configuran sus secretos.

Configura en GitHub Actions Secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (clave privada) y `DEPLOY_PATH` (ruta del checkout en Ubuntu). El servidor debe tener acceso al repositorio, Docker y Compose v2; crea `.env` desde `.env.example` y configura allí los secretos antes del primer despliegue. El host no necesita Node.js porque el contenedor lo incluye. Si faltan secretos, el job de despliegue se omite de forma explícita.

El despliegue es de una instancia y actualiza la copia existente mediante `git pull --ff-only` y `docker compose up -d --build`. Para una operación productiva agrega aprobación de entorno, TLS/proxy inverso, alertas, backups externos, rollback verificado y almacenamiento de sesión compartido si se escala.

## Documentación académica

El caso de estudio, justificación del pipeline, objetivos SLA, métricas y parámetros se encuentran en [docs/case-study.md](docs/case-study.md).

## Estructura

```text
src/                  API Express y persistencia SQLite
public/               Interfaz web
tests/                Pruebas Jest y Supertest
scripts/              Setup, test, build, deploy y backup
monitoring/           Configuración Prometheus y datasource Grafana
.github/workflows/    Pipeline CI/CD
docs/                 Caso de estudio y documentación académica
```

## Notas de seguridad y alcance

Este proyecto es una base didáctica, no un sistema listo para manejar información financiera real. La contraseña se almacena con bcrypt, las cookies son HTTP-only y Helmet establece cabeceras seguras. Antes de exponerlo, configura secretos únicos, HTTPS y reglas de firewall. Tras un proxy HTTPS confiable, establece `COOKIE_SECURE=true` y `TRUST_PROXY=true`; el valor predeterminado de Compose es para laboratorio HTTP. Express usa almacenamiento de sesión en memoria, apropiado solo para una instancia pequeña; un reinicio invalida sesiones y varias réplicas requieren un almacén compartido. SQLite y una única VM tampoco garantizan por sí solos 99.5% de disponibilidad.