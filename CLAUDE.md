# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

**plex-trans** translates media synopses/descriptions in a Plex media server from any language into Spanish. It connects to Plex, detects non-Spanish summaries, translates them via AI, and writes translations back to Plex.

## Development Commands

### Backend (Python/FastAPI)

```bash
# Install dependencies
pip install -r requirements.txt

# Run dev server (from project root)
APP_DB_PATH="./data/app.db" JWT_SECRET="dev-secret-change-me" CORS_ORIGINS="*" .venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

### Frontend (Next.js)

```bash
cd frontend

npm install
npm run dev      # Dev server on port 3000
npm run build    # Production build
npm start        # Production server on port 3000
```

### Docker (full stack)

```bash
docker-compose up          # Build and run both services
docker-compose up --build  # Force rebuild
```

Docker containers are named `plex-trans-backend` and `plex-trans-frontend`.

## Architecture

### Backend (`backend/main.py`)

Single-file FastAPI application with:

- **SQLite database** at `/data/app.db` (path overridable via `APP_DB_PATH`) — two tables: `users`, `settings`
- **Auth:** JWT tokens with `bcrypt` (direct, not via passlib). First-run bootstrap flow: if no users exist, `/auth/bootstrap` returns `needs_setup: true` and `/auth/register` is open.
- **Settings:** Plex connection config + AI profiles stored as JSON in the `settings` table. Supports multiple named AI profiles with an active profile pointer.
- **Translation providers:** `openai` (with custom base URL support for OpenAI-compatible APIs), `ollama` (local LLM), `deep_translator` (Google Translate).
- **Language detection:** `langdetect` with special disambiguation logic for Spanish vs. Catalan (both detected as `es` or `ca`).
- **Plex integration:** Uses `plexapi` to browse libraries and write summaries back via `PUT` to the Plex API.
- **Caching:** In-memory TTL cache for media listings (default 300s, configurable via `MEDIA_CACHE_TTL_SEC`).

**Key API endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/auth/bootstrap` | Check if first-run setup needed |
| POST | `/auth/register` | Create first user (only if no users) |
| POST | `/auth/login` | Authenticate, get JWT |
| GET | `/auth/me` | Get current user profile (id, username) |
| PUT | `/auth/profile` | Update username and/or password |
| GET/PUT | `/settings` | Read/write Plex + AI config |
| GET | `/plex/libraries` | List Plex libraries |
| GET | `/media` | Paginated media list with language filter |
| POST | `/media/translate` | Translate summaries via configured AI |
| POST | `/media/process` | Write translations back to Plex |

**Auth notes:**
- No minimum password length enforced
- `PUT /auth/profile` accepts `{ username?: str, new_password?: str }` — no current password required
- bcrypt used directly (not via passlib, which is incompatible with bcrypt 4+)

### Frontend (`frontend/`)

Next.js 16 app-router application with Tailwind CSS v4 and shadcn/ui components.

**Tailwind v4 setup:**
- CSS-first config: `@import "tailwindcss"` in `globals.css`, no `tailwind.config.js`
- PostCSS via `postcss.config.mjs` (ESM format) with `@tailwindcss/postcss`
- Turbopack is the default bundler (cannot be disabled in Next.js 16)

**Page routing:**

- `/` (`app/page.tsx`) — Login/Register page; handles bootstrap check on load; shows logo
- `/media` (`app/media/page.tsx`) — Main UI: browse Plex media, filter, translate, apply
- `/settings` (`app/settings/page.tsx`) — Configure Plex credentials, manage AI profiles, select libraries
- `/profile` (`app/profile/page.tsx`) — Change username and/or password
- `/help` (`app/help/page.tsx`) — Usage guide with step-by-step instructions

**Key files:**

- `lib/api.ts` — Fetch wrapper that injects JWT from `localStorage`, handles 401 auto-logout, proxies to `NEXT_PUBLIC_API_BASE_URL`
- `lib/useAuth.ts` — Auth guard hook; returns `false` until token verified, redirects to `/` if not logged in (prevents flash)
- `app/providers.tsx` — Wraps app in `next-themes` ThemeProvider
- `app/_nav.tsx` — Navigation bar with NavigationMenu, theme toggle, logout (logout clears sessionStorage cache)
- `app/layout.tsx` — Root layout with `<Toaster />` from sonner

**shadcn/ui components** live in `components/ui/`:
- `alert.tsx` — Alert, AlertTitle, AlertDescription
- `button.tsx` — Button (exports `buttonVariants`)
- `card.tsx` — Card, CardContent, CardHeader, CardTitle
- `checkbox.tsx` — Checkbox
- `input.tsx` — Input
- `label.tsx` — Label
- `navigation-menu.tsx` — NavigationMenu, NavigationMenuList, NavigationMenuItem, NavigationMenuLink
- `pagination.tsx` — Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis (uses `<button>`, not `<a>`)
- `select.tsx` — Select, SelectContent, SelectItem, SelectTrigger, SelectValue
- `skeleton.tsx` — Skeleton
- `sonner.tsx` — Toaster (position top-center)
- `table.tsx` — Table, TableHeader, TableBody, TableRow, TableHead, TableCell
- `textarea.tsx` — Textarea
- `toggle.tsx` — Toggle (active state uses yellow theme colors)

## `/media` page patterns

- **TanStack Table** (`@tanstack/react-table`) with `manualPagination: true` for server-side pagination
- `getRowId: (row) => String(row.ratingKey)` — uses ratingKey as row ID
- **Cache strategy:**
  - Page data cached in `sessionStorage` (`plex_page_cache`) — persists across navigation, cleared on logout
  - Translations cached in `sessionStorage` (`plex_translations`)
  - Processed items cached in `sessionStorage` (`plex_processed`)
  - Page size persisted in `localStorage` (`plex_page_size`) — survives browser close
  - **Buscar** only clears cache if something was processed (`Object.keys(processed).length > 0`), otherwise reuses cache
  - Toast "Búsqueda completada" only fires on new server requests, not on page navigation or cache hits
- **Active AI profile** shown below action buttons with name · provider · model in yellow
- **Skeleton** shown in table body while loading
- **Sonner toasts** for Buscar (new search only), Traducir, Procesar actions

## Environment Variables

**Backend:**
| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | _(required)_ | Secret for JWT signing |
| `APP_DB_PATH` | `/data/app.db` | SQLite database path |
| `JWT_EXPIRES_MINUTES` | `10080` (7 days) | Token lifetime |
| `CORS_ORIGINS` | `http://localhost:3000` | Allowed CORS origins (use `*` for dev) |
| `MEDIA_CACHE_TTL_SEC` | `300` | Media listing cache TTL |

**Frontend:**
| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000` | Backend API URL |

Create `frontend/.env.local` for local dev:
```
NEXT_PUBLIC_API_BASE_URL=http://<your-server-ip>:8000
```

## Key Patterns

- **AI profile switching:** The active profile is stored as `active_ai_profile_id` in settings. `POST /media/translate` uses whatever profile is active at call time.
- **Plex write-back:** `POST /media/process` sends translated summaries to Plex using the Plex API token directly (not via `plexapi`), using `requests.put` with the `X-Plex-Token` header.
- **Media pagination:** `/media` uses `page` + `page_size` (default 50). `limit_total` parameter restricts total items fetched from Plex.
- **Auth guard:** All protected pages use `useAuth()` hook and return `null` until ready, preventing flash of unauthenticated content.
- **Theme:** Dark/light via `next-themes`. Yellow/amber (`yellow-400`/`yellow-500`) is the primary accent color throughout.
