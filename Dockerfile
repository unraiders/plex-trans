# ---- Build del frontend (Next.js standalone) ----
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /app/frontend

# La versión real la inyecta el workflow vía --build-arg (misma que la imagen final).
# Se expone a Next.js como NEXT_PUBLIC_APP_VERSION para mostrarla en el footer.
ARG VERSION=local
ENV NEXT_PUBLIC_APP_VERSION=${VERSION}

COPY frontend/package.json /app/frontend/package.json
RUN npm install

COPY frontend /app/frontend
RUN npm run build


# ---- Imagen final: backend (FastAPI) + frontend (Next.js) en una sola imagen ----
FROM python:3.12-slim

# La versión real la inyecta el workflow vía --build-arg desde .version_main / .version_develop.
# "local" es el valor por defecto para builds manuales sin --build-arg.
ARG VERSION=local
ENV VERSION=${VERSION}

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

WORKDIR /app

# Runtime de Node.js (solo el binario; el frontend standalone ya incluye sus dependencias).
# Se usa la misma base Debian bookworm/glibc que python:3.12-slim para compatibilidad de binarios.
COPY --from=node:20-bookworm-slim /usr/local/bin/node /usr/local/bin/node
RUN apt-get update \
    && apt-get install -y --no-install-recommends libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

# Backend
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Detección de idioma: pre-descargar el modelo fastText grande (lid.176.bin, ~126 MB)
# durante el build y dejarlo en una ruta fija. Así en runtime no hay ninguna
# descarga y funciona sin acceso a internet.
ENV FTLANG_CACHE=/app/.ftlang_cache
RUN python -c "from fast_langdetect import detect; detect('hola mundo', model='full')"

COPY backend /app/backend

# Frontend (Next.js standalone) en /app/web
COPY --from=frontend-build /app/frontend/.next/standalone /app/web
COPY --from=frontend-build /app/frontend/.next/static /app/web/.next/static
COPY --from=frontend-build /app/frontend/public /app/web/public

# Script que arranca ambos procesos
COPY scripts/start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 8000 3000
CMD ["/app/start.sh"]
