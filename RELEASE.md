# Cambios en esta versión

## 🚀 CI/CD

- **Imagen Docker única.** El backend (FastAPI) y el frontend (Next.js) se empaquetan ahora en una sola imagen que arranca ambos procesos (`uvicorn` en el puerto `8000` y el servidor standalone de Next.js en el `3000`) mediante `scripts/start.sh`. Se elimina el esquema de dos imágenes separadas (`:backend` / `:frontend`).
- **Nuevo workflow `despliegue.yml`:** en cada push a `main` o `develop` crea tag + release en GitHub y publica imagen multiarch (`amd64`, `arm64/v8`, `arm/v7`) en **DockerHub** (`unraiders/plex-trans`) y **GHCR** (`ghcr.io/unraiders/plex-trans`). Sustituye al anterior `docker-publish.yml` basado en tags.
- **Versionado por rama** mediante los ficheros `.version_main` y `.version_develop`, que se inyectan en la imagen vía `--build-arg VERSION`.
- El `Dockerfile` usa `ARG VERSION=local` como valor por defecto, de modo que los builds manuales se identifican como `local` mientras que los builds del workflow muestran la versión real.

## 🔧 Mejoras

- `docker-compose.yml` y `docker-compose_local.yml` pasan a un único servicio `plex-trans` que expone los puertos `3000` y `8000`.
- Plantilla de Unraid unificada (`unraid/plex-trans.xml`) en sustitución de las dos plantillas separadas de backend y frontend.
- README actualizado para reflejar el despliegue con una sola imagen.
