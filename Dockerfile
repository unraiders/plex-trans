FROM python:3.12-slim AS backend

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY backend /app/backend

EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]


FROM node:20-alpine AS frontend-build
WORKDIR /app

COPY frontend/package.json /app/frontend/package.json
RUN cd /app/frontend && npm install

COPY frontend /app/frontend
RUN cd /app/frontend && npm run build


FROM node:20-alpine AS frontend
WORKDIR /app
ENV NODE_ENV=production

COPY --from=frontend-build /app/frontend/.next/standalone ./
COPY --from=frontend-build /app/frontend/.next/static ./.next/static
COPY --from=frontend-build /app/frontend/public ./public

EXPOSE 3000
CMD ["node", "server.js"]

