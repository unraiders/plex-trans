<p align="center">
  <img src="frontend/public/logo.png" alt="Plex Language Media Tool" width="100" />
</p>

# Plex Language Media Tool

Aplicación web para traducir automáticamente las sinopsis de tu servidor Plex al español usando inteligencia artificial.

---

## ¿Qué hace?

Conecta con tu instancia de Plex, detecta los medios cuya sinopsis no está en español y los traduce usando el proveedor de IA que elijas. Las traducciones se pueden revisar antes de escribirlas de vuelta en Plex.

El flujo de trabajo es:

1. **Buscar** — recupera los medios de Plex según los filtros aplicados
2. **Traducir** — envía las sinopsis seleccionadas al proveedor de IA
3. **Procesar** — escribe las traducciones aprobadas de vuelta en Plex

---

## Características

- Soporte para múltiples proveedores de IA: **OpenAI** (y APIs compatibles), **Ollama** (modelos locales) y **Google Translate** vía Deep Translator
- Gestión de perfiles de IA: crea varios perfiles y cambia entre ellos desde Ajustes
- **Modo offline** — importa todos los medios no-español a una caché SQLite local; las búsquedas son instantáneas sin conectar con Plex en cada sesión
- Traducciones persistentes en modo offline: las sinopsis ya procesadas se guardan en la caché y se muestran automáticamente en futuras sesiones
- Los medios ya procesados se registran de forma persistente y se excluyen de futuras importaciones, aunque la detección de idioma vuelva a fallar en ellos
- Detección automática de idioma en dos fases: filtrado local rápido con fastText (`fast-langdetect`) y verificación de los candidatos con **Google Translate** (fiable incluso con sinopsis españolas llenas de nombres propios extranjeros), con panel de progreso detallado durante la importación
- Botón "Copiar sinopsis" en cada fila para volcar la sinopsis original en el campo de traducción con un clic
- Filtro "Solo no español" para mostrar únicamente los candidatos a traducir
- Caché de páginas en sesión para navegación rápida sin repetir búsquedas
- Estado de la tabla restaurado automáticamente al volver a la página de Medios
- Estadísticas de biblioteca en Ajustes: total de películas, series, temporadas y episodios
- Autenticación con JWT, cambio de usuario y contraseña desde la app
- Interfaz en modo claro/oscuro

---

## Capturas de pantalla

| Login                                | Medios                                | Ajustes                                   |
| ------------------------------------ | ------------------------------------- | ----------------------------------------- |
| ![Login](docs/screenshots/login.png) | ![Medios](docs/screenshots/media.png) | ![Ajustes](docs/screenshots/settings.png) |

---

## Stack

| Capa       | Tecnología                                                |
| ---------- | --------------------------------------------------------- |
| Backend    | Python 3.12 · FastAPI · SQLite · plexapi                  |
| Frontend   | Next.js 16 · Tailwind CSS v4 · shadcn/ui · TanStack Table |
| IA         | OpenAI SDK · Ollama · deep-translator · Google Translate (detección) · fast-langdetect |
| Despliegue | Docker · Docker Compose                                   |

---

## Instalación con Docker (recomendado)

### 1. Clonar el repositorio

```bash
git clone https://github.com/tu-usuario/plex-trans.git
cd plex-trans
```

### 2. Crear el archivo de variables de entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
JWT_SECRET=cambia-esto-por-un-secreto-seguro
CORS_ORIGINS=http://tu-servidor-ip:3000
API_BASE_URL=http://tu-servidor-ip:8000
```

### 3. Levantar el contenedor

Con la imagen publicada (disponible en Docker Hub `unraiders/plex-trans` y en GHCR `ghcr.io/unraiders/plex-trans`, multiarch `amd64` / `arm64` / `arm/v7`):

```bash
docker-compose up -d
```

O construyendo la imagen en local:

```bash
docker-compose -f docker-compose_local.yml up --build -d
```

Esto levanta un único contenedor `plex-trans` que expone ambos puertos:

- Puerto `8000` — API (backend FastAPI)
- Puerto `3000` — Interfaz web (frontend Next.js)

El navegador accede al frontend por el puerto `3000`, y este realiza las llamadas al API por el puerto `8000`, por lo que ambos puertos deben ser accesibles desde tu red.

Accede a la app en `http://tu-servidor-ip:3000`

---

## Instalación en desarrollo

### Backend

```bash
# Crear entorno virtual e instalar dependencias
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Arrancar el servidor
APP_DB_PATH="./data/app.db" JWT_SECRET="dev-secret" CORS_ORIGINS="*" \
  .venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

```bash
cd frontend
npm install

# Crear archivo de entorno local
echo "API_BASE_URL=http://localhost:8000" > .env.local

npm run dev
```

Accede a la app en `http://localhost:3000`

---

## Configuración inicial

Al acceder por primera vez la app detecta que no hay usuarios y muestra el formulario de registro. Crea tu usuario y entra.

### Ajustes de Plex

Ve a **Ajustes** e introduce:

- **Plex IP** — IP o hostname de tu servidor Plex
- **Plex Puerto** — por defecto `32400`
- **Plex Token** — token de autenticación de Plex (búscalo en las herramientas de red del navegador mientras usas Plex Web, cabecera `X-Plex-Token`)

Selecciona las **bibliotecas** que quieres incluir en las búsquedas.

### Configurar un perfil de IA

Desde **Ajustes** crea un perfil de traducción eligiendo uno de los tres proveedores:

| Proveedor           | Requisitos                   | Notas                                                                        |
| ------------------- | ---------------------------- | ---------------------------------------------------------------------------- |
| **OpenAI**          | URL base + API Key + modelo  | Compatible con cualquier API OpenAI-compatible (LM Studio, OpenRouter, etc.) |
| **Ollama**          | URL de la instancia + modelo | Modelos locales, sin coste externo                                           |
| **Deep Translator** | Ninguno                      | Google Translate gratuito, menor calidad                                     |

---

## Variables de entorno

### Backend

| Variable              | Por defecto             | Descripción                          |
| --------------------- | ----------------------- | ------------------------------------ |
| `JWT_SECRET`          | _(requerido)_           | Clave para firmar los tokens JWT     |
| `APP_DB_PATH`         | `/data/app.db`          | Ruta de la base de datos SQLite      |
| `JWT_EXPIRES_MINUTES` | `10080` (7 días)        | Duración del token                   |
| `CORS_ORIGINS`        | `http://localhost:3000` | Orígenes CORS permitidos             |
| `MEDIA_CACHE_TTL_SEC` | `300`                   | TTL de la caché de medios en memoria |

### Frontend

| Variable       | Por defecto             | Descripción     |
| -------------- | ----------------------- | --------------- |
| `API_BASE_URL` | `http://localhost:8000` | URL del backend |

---

## Instalación en Unraid

### Opción 1 — Plantilla via SSH (recomendado)

Conecta por SSH a tu servidor Unraid y ejecuta el siguiente comando para descargar la plantilla directamente:

```bash
curl -o /boot/config/plugins/dockerMan/templates-user/my-plex-trans.xml \
  https://raw.githubusercontent.com/unraiders/plex-trans/main/unraid/my-plex-trans.xml
```

Después ve a **Docker → Add Container** y la plantilla aparecerá en el desplegable de **Plantillas de usuario**.

Recuerda ajustar en la plantilla:

- `API_BASE_URL` por la IP y puerto del API (ej: `http://192.168.1.100:8000`)
- `JWT_SECRET` por una cadena segura
- `CORS_ORIGINS` por la URL de tu frontend (ej: `http://192.168.1.100:3000`) o `*`

---

## Aviso importante

> **Haz una copia de seguridad de tu instancia de Plex antes de usar esta aplicación.**
> El botón **Procesar** escribe directamente en tu servidor Plex y esta acción no se puede deshacer desde la app.

---

## Licencia

MIT
