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

- **SQLite database** at `/data/app.db` (path overridable via `APP_DB_PATH`) — three tables: `users`, `settings`, `media_cache`
- **Auth:** JWT tokens with `bcrypt` (direct, not via passlib). First-run bootstrap flow: if no users exist, `/auth/bootstrap` returns `needs_setup: true` and `/auth/register` is open.
- **Settings:** Plex connection config + AI profiles stored as JSON in the `settings` table. Supports multiple named AI profiles with an active profile pointer. Also stores `offline_mode` (bool) and `media_cache_last_updated` (ISO timestamp).
- **Translation providers:** `openai` (with custom base URL support for OpenAI-compatible APIs), `ollama` (local LLM), `deep_translator` (Google Translate).
- **Language detection:** `langdetect` with special disambiguation logic for Spanish vs. Catalan (both detected as `es` or `ca`).
- **Plex integration:** Uses `plexapi` to browse libraries and write summaries back via `PUT` to the Plex API.
- **Caching:** In-memory TTL cache for media listings (default 300s, configurable via `MEDIA_CACHE_TTL_SEC`).
- **Offline mode:** `media_cache` SQLite table stores non-Spanish media (rating_key, type, title, language_name, language_code, summary, library, updated_at, translation). When `offline_mode=true`, `GET /media` serves from this table instead of querying Plex. `POST /media/process` also updates `media_cache.translation` and sets language to Spanish.

**Key API endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/auth/bootstrap` | Check if first-run setup needed |
| POST | `/auth/register` | Create first user (only if no users) |
| POST | `/auth/login` | Authenticate, get JWT |
| GET | `/auth/me` | Get current user profile (id, username) |
| PUT | `/auth/profile` | Update username and/or password |
| GET/PUT | `/settings` | Read/write Plex + AI config |
| GET | `/plex/libraries` | List Plex libraries with media counts (total, seasons, episodes) |
| GET | `/media` | Paginated media list with language filter (serves from cache if offline_mode) |
| POST | `/media/translate` | Translate summaries via configured AI |
| POST | `/media/process` | Write translations back to Plex (also updates media_cache in offline mode) |
| POST | `/media/import` | Import all non-Spanish media from Plex into media_cache |
| GET | `/media/cache/stats` | Return total and per-library count from media_cache |

**Auth notes:**
- No minimum password length enforced
- `PUT /auth/profile` accepts `{ username?: str, new_password?: str }` — no current password required
- bcrypt used directly (not via passlib, which is incompatible with bcrypt 4+)

**Library stats (`GET /plex/libraries`):**
- `LibraryOut` now includes `total`, `seasons`, `episodes` (all Optional[int])
- `_section_total(base_url, token, section_key, media_type)` fetches only `totalSize` from Plex using `X-Plex-Container-Size=0&X-Plex-Container-Start=0` — no items loaded, very fast
- Media type codes: 1=movie, 2=show, 3=season, 4=episode
- Failures per-library are caught silently; the library still appears without stats

**sqlite3.Row access rule:** Always access `sqlite3.Row` columns **inside** the `with db_conn()` context. Accessing them after connection close silently returns wrong/empty data.

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
- `switch.tsx` — Switch (`@radix-ui/react-switch`); checked state uses `bg-yellow-500`
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
  - Filter state cached in `sessionStorage` (`plex_last_search`) — search, library, limit, nonSpanishOnly, page
  - Page size persisted in `localStorage` (`plex_page_size`) — survives browser close
  - **Buscar** always clears `pageCache`, `translations`, `processed` and `plex_last_search`, then fetches with `forceRefresh=true`
  - Toast "Búsqueda completada" only fires on new server requests, not on page navigation or cache hits
- **Auto-restore on navigation:** on mount, if `plex_last_search` exists in sessionStorage, `fetchPage` is called automatically to restore the previous view
- **Auto-load after import:** settings page sets `plex_autoload=1` in sessionStorage after a successful import; `/media` on mount detects this flag, removes it, and calls `fetchPage(1, undefined, false, true)` to load the cache immediately
- **Translation persistence (offline mode):** items returned from API with non-empty `translation` (from `media_cache.translation`) are auto-populated into `processed` and `translations` states on every `fetchPage` — both cached and fresh paths. This means processed items show their translation and have disabled checkboxes even in new sessions.
- **Language update after process:** `procesarSeleccion` updates `items` and `pageCache` immediately to show `Español (es)` without requiring a new search
- **forceRefresh parameter:** `fetchPage(page, pageSizeOverride?, showToast?, forceRefresh?)` — when `true`, skips cache lookup unconditionally. Used by Buscar and page-size changes to avoid stale-closure cache hits.
- **Page size change:** clears `pageCache` and calls `fetchPage` with `forceRefresh=true` to avoid stale `queryKey` from React async state batching
- **Offline mode badge:** yellow badge in CardTitle when `isOffline=true`
- **Active AI profile** shown below action buttons with name · provider · model in yellow
- **Skeleton** shown in table body while loading
- **Sonner toasts** for Buscar (new search only), Traducir, Procesar actions

## `/settings` page patterns

- **Library auto-save:** `toggleLibrary()` immediately calls `PUT /settings` with the new `bibliotecas` array — no Guardar needed
- **Offline switch auto-save:** `onCheckedChange` immediately calls `PUT /settings` with `offline_mode`
- **Guardar** button only covers Plex connection fields and AI profiles
- **Library stats:** each library card shows badges — movies: yellow "N películas"; shows: yellow "N series" + orange "N temporadas" + teal "N episodios". `loadingLibraries` state controls "Cargando bibliotecas..." vs error message.
- **Import timer:** `importElapsedRef` (ref, incremented every second) + `importElapsed` (state, for render). `formatElapsed(secs)` returns `mm:ss`. Button shows `Importando... mm:ss` while running. On finish, `importDuration` state is set and persisted to `localStorage` (`plex_import_duration`) — survives page navigation.
- **Import cancel:** `AbortController` pattern via `importAbortRef`; cancel button (X icon) shown alongside import button while importing
- **Post-import auto-load:** after successful import, clears `plex_page_cache` + `plex_last_search` and sets `plex_autoload=1` in sessionStorage

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
- **Plex write-back:** `POST /media/process` sends translated summaries to Plex using the Plex API token directly (not via `plexapi`), using `requests.put` with the `X-Plex-Token` header. In offline mode it also updates `media_cache.translation` and sets `language_name='Español'`, `language_code='es'`.
- **Media pagination:** `/media` uses `page` + `page_size` (default 50). `limit_total` parameter restricts total items fetched from Plex.
- **Auth guard:** All protected pages use `useAuth()` hook and return `null` until ready, preventing flash of unauthenticated content.
- **Theme:** Dark/light via `next-themes`. Yellow/amber (`yellow-400`/`yellow-500`) is the primary accent color throughout.
- **Offline mode data flow:** import → `media_cache` table → `GET /media` offline branch → frontend auto-populates `processed`/`translations` from items with non-empty `translation` → `POST /media/process` updates `media_cache.translation` → next search shows translation and disabled checkbox.
- **React async state in fetchPage:** `queryKey` is memoized from state; calling `fetchPage` synchronously after `setPageSize` reads the stale `queryKey`. Fix: pass `forceRefresh=true` to skip cache, and clear `pageCache` before the call.
