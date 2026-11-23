# Caso de estudio: Sistema Web de Gestión de Ventas

## Introducción

Los pequeños comercios necesitan controlar su catálogo, existencias y operaciones de venta sin depender de registros manuales. Este proyecto académico implementa una aplicación web compacta para mostrar cómo se desarrolla, prueba y despliega un servicio mediante prácticas de integración y entrega continuas.

## Objetivo

Construir una aplicación mínima pero funcional con Node.js, Express y SQLite que permita autenticarse, administrar productos, registrar ventas y consultar indicadores e historial. El pipeline automatiza pruebas y build antes de permitir un despliegue.

## Descripción del sistema

El sistema ofrece un login con sesión, operaciones CRUD de productos, registro transaccional de ventas con validación y descuento de existencias, un dashboard diario y un historial con detalle por producto. La interfaz se sirve como archivos estáticos desde Express. SQLite conserva los datos en un volumen persistente de Docker.

La aplicación está diseñada para una instancia y una carga académica o pequeña. El almacenamiento de sesión predeterminado de Express es en memoria; los reinicios cierran las sesiones activas. No se debe escalar horizontalmente sin sustituir el almacén de sesiones y revisar la capa de datos.

## Justificación del pipeline

### Integración continua

Cada pull request y cada push a `main` instala Node.js 20, instala dependencias, ejecuta las pruebas Jest y genera los archivos de build. Los cambios que rompen los contratos probados se detectan antes de integrar.

### Liberación continua

Al pasar las validaciones de `main`, el código queda preparado para liberarse. La revisión de cambios y la configuración de los secretos de despliegue determinan si el entorno está listo para recibir la versión.

### Despliegue continuo

Con los cuatro secretos SSH configurados, cada push validado a `main` actualiza el checkout existente en Ubuntu Server y ejecuta `docker compose up -d --build`. Sin esos secretos el job informa que el despliegue fue omitido; la validación y el build sí se ejecutan. Para producción real conviene añadir aprobación de entorno, estrategia de rollback y verificación posterior al despliegue.

## Entorno requerido

### Desarrollo

- Node.js 20 y npm
- Git
- Visual Studio Code
- Docker Desktop opcional para probar contenedores

### Producción

- Ubuntu Server 22.04 LTS
- Docker Engine y plugin Docker Compose v2
- Acceso SSH para el pipeline, si se habilita el despliegue automatizado
- Disco persistente para datos SQLite y respaldos

## SLA académico y objetivos operativos

| Indicador | Objetivo | Consideración |
| --- | --- | --- |
| Disponibilidad | 99.5% mensual | Objetivo de diseño; una sola VM no garantiza alta disponibilidad. |
| Tiempo de respuesta | Menor a 2 segundos | Medir p95 en condiciones de carga acordadas. |
| Recuperación (RTO) | 30 minutos | Requiere respaldos accesibles y procedimiento de restauración probado. |

Estos valores son objetivos para la actividad, no una garantía contractual. El tiempo de recuperación debe verificarse con simulacros y el respaldo debe copiarse fuera del servidor para cubrir pérdida del host.

## Métricas

- **CPU, RAM y disco:** Prometheus con Node Exporter; métricas del contenedor con cAdvisor.
- **Tiempo de respuesta:** histograma HTTP `http_request_duration_seconds`; usar percentiles p95/p99.
- **Tasa de errores:** contador `http_request_errors_total` para respuestas HTTP 4xx y 5xx.
- **Cobertura de pruebas:** Jest genera el reporte de cobertura en `coverage/` y lo muestra en CI.
- **Aplicación:** Prometheus recoge métricas de Node.js y del proceso en `/metrics`.

Consultas PromQL iniciales:

```promql
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
```

```promql
sum(rate(http_request_errors_total[5m])) / clamp_min(sum(rate(http_request_duration_seconds_count[5m])), 1)
```

## Herramientas

Git y GitHub gestionan código y revisiones. GitHub Actions ejecuta CI/CD. Docker y Docker Compose empaquetan y ejecutan la app. Prometheus recolecta métricas, Grafana permite explorarlas y Node Exporter/cAdvisor aportan métricas de host y contenedor.

## Parámetros de configuración

Las variables se documentan en `.env.example`; los valores sensibles no deben subirse al repositorio.

| Variable | Uso | Valor de referencia |
| --- | --- | --- |
| `NODE_ENV` | Modo de ejecución | `production` en contenedor |
| `PORT` | Puerto interno HTTP | `3000` |
| `APP_PORT` | Puerto publicado por Compose | `3000` |
| `DB_PATH` | Ruta del archivo SQLite | `./data/sales.db` local; volumen del contenedor en producción |
| `SESSION_SECRET` | Firma de cookies de sesión | Secreto aleatorio largo |
| `COOKIE_SECURE` | Restringe cookies a HTTPS | `false` en Compose local; `true` detrás de proxy HTTPS |
| `TRUST_PROXY` | Detecta HTTPS cuando termina TLS en un proxy confiable | `false` por defecto |
| `ADMIN_USER` / `ADMIN_PASSWORD` | Usuario inicial, creado solo si no existe ningún usuario | `admin` / secreto propio |
| `GRAFANA_USER` / `GRAFANA_PASSWORD` | Acceso inicial a Grafana | `admin` / secreto propio |

El pipeline necesita los secretos `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` y `DEPLOY_PATH`. El checkout del repositorio y Docker Compose deben estar preparados previamente en esa ruta del servidor.

El Dockerfile instala dependencias de producción, genera `dist/`, ejecuta el proceso con el usuario no privilegiado `node` y conserva SQLite en el volumen `sales_data`. La configuración de Compose publica la app en el puerto definido por `APP_PORT`; Prometheus y Grafana se habilitan con el perfil `monitoring` y quedan enlazados a localhost del servidor. Tras configurar un proxy HTTPS, establece `COOKIE_SECURE=true` y `TRUST_PROXY=true`.