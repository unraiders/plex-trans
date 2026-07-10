#!/usr/bin/env bash
# Arranca backend (FastAPI/uvicorn) y frontend (Next.js standalone) en el mismo contenedor.
set -euo pipefail

# Backend
cd /app
uvicorn backend.main:app --host 0.0.0.0 --port 8000 &
backend_pid=$!

# Frontend
cd /app/web
PORT="${PORT:-3000}" HOSTNAME="${HOSTNAME:-0.0.0.0}" node server.js &
frontend_pid=$!

# Si cualquiera de los dos procesos termina, paramos el contenedor.
trap 'kill -TERM "$backend_pid" "$frontend_pid" 2>/dev/null || true' TERM INT
wait -n
exit_code=$?
kill -TERM "$backend_pid" "$frontend_pid" 2>/dev/null || true
exit "$exit_code"
