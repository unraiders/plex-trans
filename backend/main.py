import json
import os
import re
import sqlite3
import threading
import time
import unicodedata
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

import requests
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from langdetect import DetectorFactory, detect, detect_langs
from openai import OpenAI
import bcrypt
from plexapi.exceptions import Unauthorized
from plexapi.server import PlexServer
from pydantic import BaseModel, Field


load_dotenv()


def _env(name: str, default: str = "") -> str:
    v = os.getenv(name, default)
    return (v or "").strip()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _db_path() -> str:
    return _env("APP_DB_PATH", "/data/app.db") or "/data/app.db"


@contextmanager
def db_conn():
    path = _db_path()
    parent = os.path.dirname(path) or "."
    os.makedirs(parent, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def db_init() -> None:
    with db_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                plex_ip TEXT,
                plex_port TEXT,
                plex_token TEXT,
                bibliotecas TEXT,
                ia TEXT,
                ia_url TEXT,
                ia_modelo TEXT,
                ai_api_key TEXT,
                ai_profiles TEXT,
                active_ai_profile_id TEXT,
                offline_mode INTEGER DEFAULT 0,
                media_cache_last_updated TEXT,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS media_cache (
                rating_key TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                language_name TEXT NOT NULL,
                language_code TEXT NOT NULL,
                summary TEXT NOT NULL,
                library TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        cols = {
            r["name"] for r in conn.execute("PRAGMA table_info(settings)").fetchall()
        }
        if "ai_profiles" not in cols:
            conn.execute("ALTER TABLE settings ADD COLUMN ai_profiles TEXT")
        if "active_ai_profile_id" not in cols:
            conn.execute("ALTER TABLE settings ADD COLUMN active_ai_profile_id TEXT")
        if "offline_mode" not in cols:
            conn.execute("ALTER TABLE settings ADD COLUMN offline_mode INTEGER DEFAULT 0")
        if "media_cache_last_updated" not in cols:
            conn.execute("ALTER TABLE settings ADD COLUMN media_cache_last_updated TEXT")
        cur = conn.execute("SELECT id FROM settings WHERE id = 1")
        row = cur.fetchone()
        if row is None:
            conn.execute(
                """
                INSERT INTO settings (
                    id,
                    bibliotecas,
                    ia,
                    ia_url,
                    ia_modelo,
                    ai_profiles,
                    active_ai_profile_id,
                    updated_at
                )
                VALUES (1, '[]', 'openai', '', '', '[]', '', ?)
                """,
                (_now_iso(),),
            )


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


JWT_ALG = "HS256"


def _jwt_secret() -> str:
    secret = _env("JWT_SECRET", "")
    if not secret:
        raise RuntimeError("JWT_SECRET no configurado")
    return secret


def _create_access_token(user_id: int) -> str:
    exp_minutes = int(_env("JWT_EXPIRES_MINUTES", "10080") or "10080")
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "exp": now + timedelta(minutes=exp_minutes),
        "iat": now,
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALG)


def _decode_token(token: str) -> int:
    try:
        payload = jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALG])
        sub = payload.get("sub")
        if not sub:
            raise HTTPException(status_code=401, detail="Token inválido")
        return int(sub)
    except (JWTError, ValueError):
        raise HTTPException(status_code=401, detail="Token inválido")


def get_current_user(authorization: Optional[str] = Header(None)) -> sqlite3.Row:
    if not authorization:
        raise HTTPException(status_code=401, detail="Falta Authorization")
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Authorization inválida")
    user_id = _decode_token(parts[1])
    with db_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
        return row


class AuthPayload(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=200)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class BootstrapStatus(BaseModel):
    needs_setup: bool


class SettingsIn(BaseModel):
    plex_ip: Optional[str] = None
    plex_port: Optional[str] = None
    plex_token: Optional[str] = None
    bibliotecas: Optional[List[str]] = None
    ia: Optional[str] = Field(default=None, pattern="^(openai|ollama|deep_translator)$")
    ia_url: Optional[str] = None
    ia_modelo: Optional[str] = None
    ai_api_key: Optional[str] = None
    ai_profiles: Optional[List[Dict[str, Any]]] = None
    active_ai_profile_id: Optional[str] = None
    offline_mode: Optional[bool] = None


class AIProfileOut(BaseModel):
    id: str
    name: str = ""
    ia: str = "openai"
    ia_url: str = ""
    ia_modelo: str = ""
    ai_api_key_set: bool = False


class SettingsOut(BaseModel):
    plex_ip: str = ""
    plex_port: str = ""
    plex_token_set: bool = False
    bibliotecas: List[str] = Field(default_factory=list)
    ia: str = "openai"
    ia_url: str = ""
    ia_modelo: str = ""
    ai_api_key_set: bool = False
    ai_profiles: List[AIProfileOut] = Field(default_factory=list)
    active_ai_profile_id: str = ""
    offline_mode: bool = False
    media_cache_last_updated: Optional[str] = None


def _ai_profiles_parse(raw: Any) -> List[Dict[str, Any]]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [dict(x) for x in raw if isinstance(x, dict)]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw or "[]")
            if isinstance(parsed, list):
                return [dict(x) for x in parsed if isinstance(x, dict)]
        except Exception:
            return []
    return []


def _ai_profile_label(ia: str) -> str:
    p = (ia or "").strip().lower()
    if p == "ollama":
        return "Ollama"
    if p == "deep_translator":
        return "deep-translator"
    return "OpenAI"


def _ai_profiles_ensure(
    conn: sqlite3.Connection, data: Dict[str, Any]
) -> Dict[str, Any]:
    profiles = _ai_profiles_parse(data.get("ai_profiles"))
    active_id = (data.get("active_ai_profile_id") or "").strip()
    if (
        profiles
        and active_id
        and any(str(p.get("id") or "") == active_id for p in profiles)
    ):
        data["ai_profiles"] = profiles
        data["active_ai_profile_id"] = active_id
        return data

    legacy_ia = (data.get("ia") or "openai").strip().lower() or "openai"
    legacy_url = (data.get("ia_url") or "").strip()
    legacy_model = (data.get("ia_modelo") or "").strip()
    legacy_key = (data.get("ai_api_key") or "").strip()

    if not profiles:
        default_id = "default"
        profiles = [
            {
                "id": default_id,
                "name": _ai_profile_label(legacy_ia),
                "ia": legacy_ia,
                "ia_url": legacy_url,
                "ia_modelo": legacy_model,
                "ai_api_key": legacy_key,
            }
        ]
        active_id = default_id
    else:
        if not active_id or not any(
            str(p.get("id") or "") == active_id for p in profiles
        ):
            active_id = str(profiles[0].get("id") or "default") or "default"
            profiles[0]["id"] = active_id

    data["ai_profiles"] = profiles
    data["active_ai_profile_id"] = active_id
    with db_conn() as c2:
        c2.execute(
            """
            UPDATE settings
            SET ai_profiles = ?,
                active_ai_profile_id = ?,
                updated_at = ?
            WHERE id = 1
            """,
            (
                json.dumps(profiles, ensure_ascii=False),
                active_id,
                _now_iso(),
            ),
        )
    data["updated_at"] = _now_iso()
    return data


def _ai_profile_active(settings: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    profiles = _ai_profiles_parse(settings.get("ai_profiles"))
    active_id = (settings.get("active_ai_profile_id") or "").strip()
    if profiles and active_id:
        for p in profiles:
            if str(p.get("id") or "") == active_id:
                return p
    if profiles:
        return profiles[0]
    return None


def _settings_with_ai_profile(settings: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(settings)
    p = _ai_profile_active(settings)
    if not p:
        return out
    out["ia"] = (p.get("ia") or "openai").strip().lower() or "openai"
    out["ia_url"] = (p.get("ia_url") or "").strip()
    out["ia_modelo"] = (p.get("ia_modelo") or "").strip()
    out["ai_api_key"] = (p.get("ai_api_key") or "").strip()
    return out


def _settings_get() -> Dict[str, Any]:
    with db_conn() as conn:
        row = conn.execute("SELECT * FROM settings WHERE id = 1").fetchone()
        if row is None:
            raise HTTPException(status_code=500, detail="Settings no inicializados")
        data = dict(row)
        data["bibliotecas"] = json.loads(data.get("bibliotecas") or "[]")
        data = _ai_profiles_ensure(conn, data)
        data["ai_profiles"] = _ai_profiles_parse(data.get("ai_profiles"))
        return data


def _settings_update(payload: SettingsIn) -> Dict[str, Any]:
    current = _settings_get()
    updated: Dict[str, Any] = dict(current)
    incoming = payload.model_dump(exclude_unset=True)
    if "bibliotecas" in incoming and incoming["bibliotecas"] is None:
        incoming["bibliotecas"] = []
    incoming_profiles = incoming.pop("ai_profiles", None)
    incoming_active_id = incoming.pop("active_ai_profile_id", None)

    for k, v in incoming.items():
        if k == "ai_api_key" and v is None:
            continue
        updated[k] = v
    updated["updated_at"] = _now_iso()

    if updated.get("bibliotecas") is None:
        updated["bibliotecas"] = []
    bibliotecas_json = json.dumps(updated.get("bibliotecas") or [], ensure_ascii=False)

    existing_profiles = _ai_profiles_parse(updated.get("ai_profiles"))
    merged_profiles: List[Dict[str, Any]] = []
    if incoming_profiles is not None:
        existing_by_id = {
            str(p.get("id") or ""): p for p in existing_profiles if p.get("id")
        }
        for raw in incoming_profiles or []:
            if not isinstance(raw, dict):
                continue
            pid = str(raw.get("id") or "").strip() or str(uuid4())
            base = dict(existing_by_id.get(pid) or {})
            base["id"] = pid
            base["name"] = (
                raw.get("name") if raw.get("name") is not None else base.get("name")
            ) or ""
            base["ia"] = (
                raw.get("ia") if raw.get("ia") is not None else base.get("ia")
            ) or "openai"
            base["ia_url"] = (
                raw.get("ia_url")
                if raw.get("ia_url") is not None
                else base.get("ia_url")
            ) or ""
            base["ia_modelo"] = (
                raw.get("ia_modelo")
                if raw.get("ia_modelo") is not None
                else base.get("ia_modelo")
            ) or ""
            if "ai_api_key" in raw:
                base["ai_api_key"] = (raw.get("ai_api_key") or "").strip()
            merged_profiles.append(base)
    else:
        merged_profiles = existing_profiles

    if not merged_profiles:
        merged_profiles = [
            {
                "id": "default",
                "name": _ai_profile_label(str(updated.get("ia") or "openai")),
                "ia": (updated.get("ia") or "openai"),
                "ia_url": (updated.get("ia_url") or ""),
                "ia_modelo": (updated.get("ia_modelo") or ""),
                "ai_api_key": (updated.get("ai_api_key") or ""),
            }
        ]

    active_id = str(
        incoming_active_id or updated.get("active_ai_profile_id") or ""
    ).strip()
    if not active_id or not any(
        str(p.get("id") or "") == active_id for p in merged_profiles
    ):
        active_id = str(merged_profiles[0].get("id") or "default") or "default"
        merged_profiles[0]["id"] = active_id

    if incoming_profiles is None:
        p0 = None
        for p in merged_profiles:
            if str(p.get("id") or "") == active_id:
                p0 = p
                break
        if p0 is None:
            p0 = merged_profiles[0]
        if "ia" in incoming:
            p0["ia"] = (updated.get("ia") or "openai").strip().lower() or "openai"
        if "ia_url" in incoming:
            p0["ia_url"] = (updated.get("ia_url") or "").strip()
        if "ia_modelo" in incoming:
            p0["ia_modelo"] = (updated.get("ia_modelo") or "").strip()
        if "ai_api_key" in incoming and incoming.get("ai_api_key") is not None:
            p0["ai_api_key"] = (updated.get("ai_api_key") or "").strip()

    updated["ai_profiles"] = merged_profiles
    updated["active_ai_profile_id"] = active_id

    if "offline_mode" in incoming:
        updated["offline_mode"] = 1 if incoming["offline_mode"] else 0

    with db_conn() as conn:
        conn.execute(
            """
            UPDATE settings
            SET plex_ip = ?,
                plex_port = ?,
                plex_token = ?,
                bibliotecas = ?,
                ia = ?,
                ia_url = ?,
                ia_modelo = ?,
                ai_api_key = ?,
                ai_profiles = ?,
                active_ai_profile_id = ?,
                offline_mode = ?,
                updated_at = ?
            WHERE id = 1
            """,
            (
                updated.get("plex_ip"),
                updated.get("plex_port"),
                updated.get("plex_token"),
                bibliotecas_json,
                updated.get("ia"),
                updated.get("ia_url"),
                updated.get("ia_modelo"),
                updated.get("ai_api_key"),
                json.dumps(merged_profiles, ensure_ascii=False),
                active_id,
                updated.get("offline_mode", 0),
                updated.get("updated_at"),
            ),
        )
    return _settings_get()


def _settings_out(data: Dict[str, Any]) -> SettingsOut:
    active_profile = _ai_profile_active(data) or {}
    active_id = str(data.get("active_ai_profile_id") or "").strip()
    profiles_out: List[AIProfileOut] = []
    for p in _ai_profiles_parse(data.get("ai_profiles")):
        pid = str(p.get("id") or "")
        if not pid:
            continue
        profiles_out.append(
            AIProfileOut(
                id=pid,
                name=str(p.get("name") or ""),
                ia=str(p.get("ia") or "openai"),
                ia_url=str(p.get("ia_url") or ""),
                ia_modelo=str(p.get("ia_modelo") or ""),
                ai_api_key_set=bool((p.get("ai_api_key") or "").strip()),
            )
        )
    return SettingsOut(
        plex_ip=(data.get("plex_ip") or ""),
        plex_port=(data.get("plex_port") or ""),
        plex_token_set=bool((data.get("plex_token") or "").strip()),
        bibliotecas=list(data.get("bibliotecas") or []),
        ia=(active_profile.get("ia") or data.get("ia") or "openai"),
        ia_url=(active_profile.get("ia_url") or data.get("ia_url") or ""),
        ia_modelo=(active_profile.get("ia_modelo") or data.get("ia_modelo") or ""),
        ai_api_key_set=bool(
            (active_profile.get("ai_api_key") or data.get("ai_api_key") or "").strip()
        ),
        ai_profiles=profiles_out,
        active_ai_profile_id=active_id,
        offline_mode=bool(data.get("offline_mode")),
        media_cache_last_updated=data.get("media_cache_last_updated") or None,
    )


def _plex_connect(settings: Dict[str, Any]) -> PlexServer:
    ip = (settings.get("plex_ip") or "").strip()
    port = (settings.get("plex_port") or "").strip()
    token = (settings.get("plex_token") or "").strip()
    if not ip or not port or not token:
        raise HTTPException(
            status_code=400, detail="PLEX_IP/PLEX_PORT/PLEX_TOKEN no configurados"
        )

    errors: List[str] = []
    try:
        base_url = f"http://{ip}:{port}"
        return PlexServer(base_url, token)
    except Unauthorized as e:
        errors.append(f"HTTP 401 Unauthorized: {e}")
    except Exception as e:
        errors.append(f"HTTP error: {e}")

    try:
        base_url = f"https://{ip}:{port}"
        sess = requests.Session()
        sess.verify = False
        return PlexServer(base_url, token, session=sess)
    except Unauthorized as e:
        errors.append(f"HTTPS 401 Unauthorized: {e}")
    except Exception as e:
        errors.append(f"HTTPS error: {e}")

    raise HTTPException(
        status_code=502, detail="No se pudo conectar a Plex: " + " | ".join(errors)
    )


def _norm(texto: str) -> str:
    t = (texto or "").lower().strip()
    t = unicodedata.normalize("NFKD", t)
    t = "".join(ch for ch in t if not unicodedata.combining(ch))
    return t


def _title_matches(title: str, filtro: str) -> bool:
    f = (filtro or "").strip()
    if not f:
        return True
    haystack = _norm(title)
    tokens = [_norm(tok) for tok in f.split() if tok.strip()]
    if not tokens:
        return True
    return all(tok in haystack for tok in tokens)


def _get_summary(video: Any, plex: PlexServer) -> str:
    summary = (getattr(video, "summary", "") or "").strip()
    if summary:
        return summary
    try:
        if hasattr(video, "reload"):
            video.reload()
            summary = (getattr(video, "summary", "") or "").strip()
            if summary:
                return summary
    except Exception:
        pass
    try:
        rk = getattr(video, "ratingKey", None)
        if rk is None:
            return ""
        full = plex.fetchItem(int(rk))
        return (getattr(full, "summary", "") or "").strip()
    except Exception:
        return ""


def _format_title(video: Any) -> str:
    try:
        if (
            hasattr(video, "parentTitle")
            and hasattr(video, "index")
            and getattr(video, "type", "") == "season"
        ):
            serie = getattr(video, "parentTitle", "") or ""
            idx = getattr(video, "index", None)
            if isinstance(idx, int):
                return f"{serie} Temporada {idx}"
            if idx:
                return f"{serie} Temporada {idx}"
            return f"{serie} Temporada"
        if (
            hasattr(video, "grandparentTitle")
            and hasattr(video, "parentIndex")
            and hasattr(video, "index")
        ):
            serie = getattr(video, "grandparentTitle", "") or ""
            temporada = getattr(video, "parentIndex", None)
            episodio = getattr(video, "index", None)
            ep_titulo = getattr(video, "title", "") or ""
            if isinstance(temporada, int) and isinstance(episodio, int):
                return f"{serie} S{temporada:02d}E{episodio:02d} - {ep_titulo}"
            if temporada and episodio:
                return f"{serie} S{temporada}E{episodio} - {ep_titulo}"
            return f"{serie} - {ep_titulo}"
        return getattr(video, "title", "") or ""
    except Exception:
        return getattr(video, "title", "") or ""


def detectar_idioma_texto(texto: str) -> Tuple[str, str]:
    try:
        DetectorFactory.seed = 0
        contenido = (texto or "").strip()
        if len(contenido) < 20:
            return "desconocido", ""
        probabilidades = detect_langs(contenido)
        probs: Dict[str, float] = {
            p.lang: float(p.prob) for p in (probabilidades or [])
        }
        if probs.get("es", 0.0) >= 0.35:
            return "Español", "es"
        if probabilidades:
            primary = max(probabilidades, key=lambda x: x.prob).lang
            if primary == "pt" and probs.get("es", 0.0) >= 0.20:
                return "Español", "es"
            if primary == "ca":
                palabras = re.findall(r"[a-zàèéíïòóúüñç]+", contenido.lower())
                es_especificas = {
                    "como",
                    "para",
                    "pero",
                    "porque",
                    "quien",
                    "quién",
                    "tambien",
                    "también",
                    "esta",
                    "este",
                    "estos",
                    "estas",
                    "los",
                    "las",
                    "sus",
                    "muy",
                    "más",
                }
                ca_especificas = {
                    "com",
                    "per",
                    "però",
                    "perque",
                    "perquè",
                    "qui",
                    "també",
                    "aquest",
                    "aquesta",
                    "aquests",
                    "aquestes",
                    "els",
                    "les",
                    "seus",
                    "seves",
                    "molt",
                    "amb",
                }
                es_hits = sum(1 for w in palabras if w in es_especificas)
                ca_hits = sum(1 for w in palabras if w in ca_especificas)
                if ca_hits >= 2 and ca_hits >= es_hits:
                    pass
                elif (es_hits >= 2 and es_hits > ca_hits) or (
                    es_hits >= 1 and probs.get("es", 0.0) >= 0.28 and es_hits > ca_hits
                ):
                    return "Español", "es"
        codigo = (
            max(probabilidades, key=lambda x: x.prob).lang
            if probabilidades
            else detect(contenido)
        )
        nombres = {
            "es": "Español",
            "en": "Inglés",
            "fr": "Francés",
            "de": "Alemán",
            "it": "Italiano",
            "pt": "Portugués",
            "ca": "Catalán",
        }
        return nombres.get(codigo, codigo), codigo
    except Exception:
        return "desconocido", ""


def es_idioma_espanol(nombre: Optional[str], codigo: Optional[str]) -> bool:
    n = (nombre or "").strip().lower()
    c = (codigo or "").strip().lower()
    return n in {"español", "spanish", "castellano"} or c in {"es", "spa", "es-es"}


def _translate_openai(texto: str, settings: Dict[str, Any]) -> str:
    api_key = (settings.get("ai_api_key") or "").strip()
    if not api_key:
        raise HTTPException(
            status_code=400, detail="AI_API_KEY no configurada para OpenAI"
        )
    base_url = (settings.get("ia_url") or "").strip() or None
    model = (settings.get("ia_modelo") or "").strip() or "gpt-4o-mini"
    client = OpenAI(api_key=api_key, base_url=base_url)
    prompt = (
        "Traduce el siguiente texto al español, manteniendo tono neutro, fidelidad y claridad. "
        "No añadas información nueva, no inventes nombres, y no uses HTML. "
        "Texto a traducir:\n" + texto
    )
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "Eres un traductor profesional al español."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
        max_tokens=900,
    )
    return (resp.choices[0].message.content or "").strip()


def _translate_ollama(texto: str, settings: Dict[str, Any]) -> str:
    base = (settings.get("ia_url") or "").strip() or "http://localhost:11434"
    model = (settings.get("ia_modelo") or "").strip() or "llama3.1:8b"
    from ollama import Client

    client = Client(host=base.rstrip("/"))
    sistema = (
        "Eres un traductor profesional al español. Traduce de forma fiel y clara, "
        "sin añadir información nueva, sin inventar nombres y sin HTML."
    )
    try:
        r = client.chat(
            model=model,
            messages=[
                {"role": "system", "content": sistema},
                {
                    "role": "user",
                    "content": (
                        "Traduce el siguiente texto al español, manteniendo tono neutro, fidelidad y claridad.\n"
                        + texto
                    ),
                },
            ],
            options={"temperature": 0.2},
            keep_alive="0s",
        )
        contenido = (r.get("message", {}) or {}).get("content", "")
        if contenido:
            return contenido.strip()
    except Exception:
        pass

    prompt = (
        "Traduce al español, tono neutro y fiel. Sin añadir información ni HTML.\n\nTexto:\n"
        + texto
    )
    r2 = client.generate(
        model=model,
        prompt=prompt,
        options={"temperature": 0.2},
        keep_alive="0s",
    )
    return (r2.get("response", "") or "").strip()


def _translate_deep_translator(texto: str) -> str:
    from deep_translator import GoogleTranslator

    return (GoogleTranslator(source="auto", target="es").translate(texto) or "").strip()


def traducir(texto: str, settings: Dict[str, Any]) -> str:
    proveedor = (settings.get("ia") or "openai").strip().lower()
    if proveedor == "ollama":
        return _translate_ollama(texto, settings)
    if proveedor == "deep_translator":
        return _translate_deep_translator(texto)
    return _translate_openai(texto, settings)


def actualizar_sinopsis_plex(
    plex: PlexServer, video: Any, nueva: str, bloquear: bool = True
) -> None:
    try:
        if hasattr(video, "edit"):
            kwargs = {"summary.value": nueva, "summary.locked": 1 if bloquear else 0}
            video.edit(**kwargs)
            video.reload()
            return
    except Exception:
        pass

    type_map = {"movie": 1, "show": 2, "season": 3, "episode": 4}
    tipo = getattr(video, "type", "movie")
    tipo_code = type_map.get(tipo, 1)
    from urllib.parse import quote

    path = (
        f"/library/metadata/{video.ratingKey}?type={tipo_code}"
        f"&summary.value={quote(nueva)}&summary.locked={'1' if bloquear else '0'}"
    )
    plex.query(path, method="PUT")
    try:
        video.reload()
    except Exception:
        pass


class LibraryOut(BaseModel):
    title: str
    type: str


class MediaItem(BaseModel):
    ratingKey: str
    type: str
    title: str
    language_name: str
    language_code: str
    summary: str
    library: str


class MediaListResponse(BaseModel):
    items: List[MediaItem]
    total: int
    page: int
    page_size: int


class ImportResult(BaseModel):
    imported: int
    by_library: Dict[str, int]


class MediaCacheStats(BaseModel):
    total: int
    by_library: Dict[str, int]


class TranslateRequest(BaseModel):
    ratingKeys: List[str] = Field(min_length=1)


class TranslationOut(BaseModel):
    ratingKey: str
    translation: str
    translation_language_name: str
    translation_language_code: str


class ProcessItem(BaseModel):
    ratingKey: str
    translation: str


class ProcessRequest(BaseModel):
    items: List[ProcessItem] = Field(min_length=1)


class ProcessResult(BaseModel):
    updated: int
    errors: int


_MEDIA_CACHE_LOCK = threading.Lock()
_MEDIA_CACHE: Dict[str, Tuple[float, List[MediaItem]]] = {}


def _media_cache_ttl_sec() -> int:
    try:
        return int(_env("MEDIA_CACHE_TTL_SEC", "300") or "300")
    except Exception:
        return 300


def _media_cache_key(
    settings: Dict[str, Any],
    bibliotecas: List[str],
    filtro: str,
    non_spanish_only: bool,
) -> str:
    payload = {
        "settings_v": (settings.get("updated_at") or ""),
        "bibliotecas": list(bibliotecas),
        "filtro": (filtro or "").strip(),
        "non_spanish_only": bool(non_spanish_only),
    }
    return json.dumps(payload, ensure_ascii=False, sort_keys=True)


def _media_cache_get(key: str) -> Optional[List[MediaItem]]:
    ttl = _media_cache_ttl_sec()
    now = time.time()
    with _MEDIA_CACHE_LOCK:
        hit = _MEDIA_CACHE.get(key)
        if not hit:
            return None
        created_at, items = hit
        if ttl > 0 and (now - created_at) > ttl:
            _MEDIA_CACHE.pop(key, None)
            return None
        return items


def _media_cache_set(key: str, items: List[MediaItem]) -> None:
    with _MEDIA_CACHE_LOCK:
        _MEDIA_CACHE[key] = (time.time(), items)


def _media_cache_clear() -> None:
    with _MEDIA_CACHE_LOCK:
        _MEDIA_CACHE.clear()


app = FastAPI(title="Plex Language Backend", version="0.1.0")

cors_origins = [
    o.strip()
    for o in _env("CORS_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    db_init()


@app.get("/auth/bootstrap", response_model=BootstrapStatus)
def auth_bootstrap() -> BootstrapStatus:
    with db_conn() as conn:
        cnt = conn.execute("SELECT COUNT(1) AS c FROM users").fetchone()["c"]
        return BootstrapStatus(needs_setup=cnt == 0)


@app.post("/auth/register", response_model=AuthResponse)
def auth_register(payload: AuthPayload) -> AuthResponse:
    with db_conn() as conn:
        cnt = conn.execute("SELECT COUNT(1) AS c FROM users").fetchone()["c"]
        if cnt != 0:
            raise HTTPException(status_code=403, detail="Registro deshabilitado")
        password_hash = _hash_password(payload.password)
        try:
            cur = conn.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                (payload.username, password_hash, _now_iso()),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="Usuario ya existe")
        user_id = int(cur.lastrowid)
        return AuthResponse(access_token=_create_access_token(user_id))


@app.post("/auth/login", response_model=AuthResponse)
def auth_login(payload: AuthPayload) -> AuthResponse:
    with db_conn() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE username = ?", (payload.username,)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=401, detail="Credenciales inválidas")
        if not _verify_password(payload.password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Credenciales inválidas")
        return AuthResponse(access_token=_create_access_token(int(row["id"])))


class UpdateProfilePayload(BaseModel):
    username: Optional[str] = Field(None, min_length=1, max_length=80)
    new_password: Optional[str] = Field(None, min_length=1, max_length=200)


class UserProfileOut(BaseModel):
    id: int
    username: str


@app.get("/auth/me", response_model=UserProfileOut)
def auth_me(user=Depends(get_current_user)) -> UserProfileOut:
    return UserProfileOut(id=int(user["id"]), username=user["username"])


@app.put("/auth/profile")
def auth_update_profile(
    payload: UpdateProfilePayload, user=Depends(get_current_user)
):
    user_id = int(user["id"])
    with db_conn() as conn:
        if payload.username and payload.username != user["username"]:
            existing = conn.execute(
                "SELECT id FROM users WHERE username = ? AND id != ?",
                (payload.username, user_id),
            ).fetchone()
            if existing:
                raise HTTPException(status_code=409, detail="Ese nombre de usuario ya existe")
            conn.execute(
                "UPDATE users SET username = ? WHERE id = ?",
                (payload.username, user_id),
            )
        if payload.new_password:
            new_hash = _hash_password(payload.new_password)
            conn.execute(
                "UPDATE users SET password_hash = ? WHERE id = ?",
                (new_hash, user_id),
            )
    return {"ok": True}


@app.get("/settings", response_model=SettingsOut)
def settings_get(_user=Depends(get_current_user)) -> SettingsOut:
    return _settings_out(_settings_get())


@app.put("/settings", response_model=SettingsOut)
def settings_put(payload: SettingsIn, _user=Depends(get_current_user)) -> SettingsOut:
    updated = _settings_update(payload)
    _media_cache_clear()
    return _settings_out(updated)


@app.get("/plex/libraries", response_model=List[LibraryOut])
def plex_libraries(_user=Depends(get_current_user)) -> List[LibraryOut]:
    settings = _settings_get()
    plex = _plex_connect(settings)
    out: List[LibraryOut] = []
    for s in plex.library.sections():
        if getattr(s, "type", None) in {"movie", "show"}:
            out.append(LibraryOut(title=s.title, type=s.type))
    out.sort(key=lambda x: (x.type, x.title.lower()))
    return out


@app.get("/media", response_model=MediaListResponse)
def media_list(
    search: str = Query(default="", max_length=200),
    library: str = Query(default="", max_length=200),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
    limit_total: int = Query(default=0, ge=0, le=5000),
    non_spanish_only: bool = Query(default=True),
    _user=Depends(get_current_user),
) -> MediaListResponse:
    settings = _settings_get()

    # Rama offline: leer desde media_cache en lugar de Plex
    if settings.get("offline_mode"):
        filtro = (search or "").strip()
        lib_filter = (library or "").strip()
        with db_conn() as conn:
            rows = conn.execute("SELECT * FROM media_cache").fetchall()
        all_items: List[MediaItem] = []
        for r in rows:
            if lib_filter and r["library"] != lib_filter:
                continue
            if filtro and not _title_matches(r["title"], filtro):
                continue
            all_items.append(MediaItem(
                ratingKey=r["rating_key"],
                type=r["type"],
                title=r["title"],
                language_name=r["language_name"],
                language_code=r["language_code"],
                summary=r["summary"],
                library=r["library"],
            ))
        if limit_total:
            all_items = all_items[:limit_total]
        total = len(all_items)
        start = (page - 1) * page_size
        end = start + page_size
        return MediaListResponse(items=all_items[start:end], total=total, page=page, page_size=page_size)

    plex = _plex_connect(settings)

    bibliotecas: List[str] = []
    if library.strip():
        bibliotecas = [library.strip()]
    else:
        bibliotecas = list(settings.get("bibliotecas") or [])
    if not bibliotecas:
        raise HTTPException(status_code=400, detail="No hay bibliotecas configuradas")

    filtro = (search or "").strip()
    primera = filtro.split()[0] if filtro else ""
    start = (page - 1) * page_size
    end = start + page_size

    cache_key = _media_cache_key(settings, bibliotecas, filtro, non_spanish_only)
    all_items = _media_cache_get(cache_key)
    if all_items is None:
        all_items = []

        for lib in bibliotecas:
            section = plex.library.section(lib)
            tipo = getattr(section, "type", None)
            if tipo not in {"movie", "show"}:
                continue

            if tipo == "movie":
                if primera:
                    candidates = section.search(title=primera)
                else:
                    candidates = section.all()
                for m in candidates:
                    if filtro and not _title_matches(getattr(m, "title", ""), filtro):
                        continue
                    summary = _get_summary(m, plex)
                    if not summary:
                        if non_spanish_only:
                            continue
                        lang_name, lang_code = "desconocido", ""
                    else:
                        lang_name, lang_code = detectar_idioma_texto(summary)
                        if non_spanish_only and es_idioma_espanol(lang_name, lang_code):
                            continue
                    all_items.append(
                        MediaItem(
                            ratingKey=str(getattr(m, "ratingKey", "")),
                            type=str(getattr(m, "type", "movie")),
                            title=str(getattr(m, "title", "")),
                            language_name=lang_name,
                            language_code=lang_code,
                            summary=summary,
                            library=lib,
                        )
                    )

            if tipo == "show":
                if primera:
                    shows = section.search(title=primera, libtype="show")
                    seasons_direct = section.search(title=primera, libtype="season")
                    eps_direct = section.search(title=primera, libtype="episode")
                else:
                    shows = section.all()
                    seasons_direct = []
                    eps_direct = []

                seen: set[str] = set()

                for sh in shows:
                    show_title = str(getattr(sh, "title", "") or "")
                    if _title_matches(show_title, filtro):
                        summary = _get_summary(sh, plex)
                        if not summary:
                            if not non_spanish_only:
                                rk = str(getattr(sh, "ratingKey", ""))
                                if rk and rk not in seen:
                                    all_items.append(
                                        MediaItem(
                                            ratingKey=rk,
                                            type=str(getattr(sh, "type", "show")),
                                            title=show_title,
                                            language_name="desconocido",
                                            language_code="",
                                            summary="",
                                            library=lib,
                                        )
                                    )
                                    seen.add(rk)
                        else:
                            lang_name, lang_code = detectar_idioma_texto(summary)
                            if not (
                                non_spanish_only
                                and es_idioma_espanol(lang_name, lang_code)
                            ):
                                rk = str(getattr(sh, "ratingKey", ""))
                                if rk and rk not in seen:
                                    all_items.append(
                                        MediaItem(
                                            ratingKey=rk,
                                            type=str(getattr(sh, "type", "show")),
                                            title=show_title,
                                            language_name=lang_name,
                                            language_code=lang_code,
                                            summary=summary,
                                            library=lib,
                                        )
                                    )
                                    seen.add(rk)

                    try:
                        for se in sh.seasons():
                            se_title = _format_title(se)
                            if filtro and not _title_matches(se_title, filtro):
                                continue
                            summary = _get_summary(se, plex)
                            if not summary:
                                if non_spanish_only:
                                    continue
                                lang_name, lang_code = "desconocido", ""
                            else:
                                lang_name, lang_code = detectar_idioma_texto(summary)
                                if non_spanish_only and es_idioma_espanol(
                                    lang_name, lang_code
                                ):
                                    continue
                            rk = str(getattr(se, "ratingKey", ""))
                            if not rk or rk in seen:
                                continue
                            all_items.append(
                                MediaItem(
                                    ratingKey=rk,
                                    type=str(getattr(se, "type", "season")),
                                    title=se_title,
                                    language_name=lang_name,
                                    language_code=lang_code,
                                    summary=summary,
                                    library=lib,
                                )
                            )
                            seen.add(rk)
                    except Exception:
                        pass

                    try:
                        for ep in sh.episodes():
                            ep_title = _format_title(ep)
                            if filtro and not _title_matches(ep_title, filtro):
                                continue
                            summary = _get_summary(ep, plex)
                            if not summary:
                                if non_spanish_only:
                                    continue
                                lang_name, lang_code = "desconocido", ""
                            else:
                                lang_name, lang_code = detectar_idioma_texto(summary)
                                if non_spanish_only and es_idioma_espanol(
                                    lang_name, lang_code
                                ):
                                    continue
                            rk = str(getattr(ep, "ratingKey", ""))
                            if not rk or rk in seen:
                                continue
                            all_items.append(
                                MediaItem(
                                    ratingKey=rk,
                                    type=str(getattr(ep, "type", "episode")),
                                    title=ep_title,
                                    language_name=lang_name,
                                    language_code=lang_code,
                                    summary=summary,
                                    library=lib,
                                )
                            )
                            seen.add(rk)
                    except Exception:
                        continue

                for se in seasons_direct:
                    se_title = _format_title(se)
                    if filtro and not _title_matches(se_title, filtro):
                        continue
                    summary = _get_summary(se, plex)
                    if not summary:
                        if non_spanish_only:
                            continue
                        lang_name, lang_code = "desconocido", ""
                    else:
                        lang_name, lang_code = detectar_idioma_texto(summary)
                        if non_spanish_only and es_idioma_espanol(lang_name, lang_code):
                            continue
                    rk = str(getattr(se, "ratingKey", ""))
                    if not rk or rk in seen:
                        continue
                    all_items.append(
                        MediaItem(
                            ratingKey=rk,
                            type=str(getattr(se, "type", "season")),
                            title=se_title,
                            language_name=lang_name,
                            language_code=lang_code,
                            summary=summary,
                            library=lib,
                        )
                    )
                    seen.add(rk)

                for ep in eps_direct:
                    ep_title = _format_title(ep)
                    if filtro and not _title_matches(ep_title, filtro):
                        continue
                    summary = _get_summary(ep, plex)
                    if not summary:
                        if non_spanish_only:
                            continue
                        lang_name, lang_code = "desconocido", ""
                    else:
                        lang_name, lang_code = detectar_idioma_texto(summary)
                        if non_spanish_only and es_idioma_espanol(lang_name, lang_code):
                            continue
                    rk = str(getattr(ep, "ratingKey", ""))
                    if not rk or rk in seen:
                        continue
                    all_items.append(
                        MediaItem(
                            ratingKey=rk,
                            type=str(getattr(ep, "type", "episode")),
                            title=ep_title,
                            language_name=lang_name,
                            language_code=lang_code,
                            summary=summary,
                            library=lib,
                        )
                    )
                    seen.add(rk)

        _media_cache_set(cache_key, all_items)

    if limit_total:
        all_items = all_items[:limit_total]
    total = len(all_items)
    page_items = all_items[start:end]
    return MediaListResponse(
        items=page_items, total=total, page=page, page_size=page_size
    )


@app.post("/media/import", response_model=ImportResult)
def media_import(_user=Depends(get_current_user)) -> ImportResult:
    settings = _settings_get()
    plex = _plex_connect(settings)
    bibliotecas: List[str] = list(settings.get("bibliotecas") or [])
    if not bibliotecas:
        raise HTTPException(status_code=400, detail="No hay bibliotecas configuradas")

    all_items: List[MediaItem] = []
    seen: set = set()

    for lib in bibliotecas:
        try:
            section = plex.library.section(lib)
        except Exception:
            continue
        tipo = getattr(section, "type", None)
        if tipo not in {"movie", "show"}:
            continue

        if tipo == "movie":
            for m in section.all():
                summary = _get_summary(m, plex)
                if not summary:
                    continue
                lang_name, lang_code = detectar_idioma_texto(summary)
                if es_idioma_espanol(lang_name, lang_code):
                    continue
                rk = str(getattr(m, "ratingKey", ""))
                if not rk or rk in seen:
                    continue
                all_items.append(MediaItem(
                    ratingKey=rk,
                    type=str(getattr(m, "type", "movie")),
                    title=str(getattr(m, "title", "")),
                    language_name=lang_name,
                    language_code=lang_code,
                    summary=summary,
                    library=lib,
                ))
                seen.add(rk)

        if tipo == "show":
            for sh in section.all():
                summary = _get_summary(sh, plex)
                if summary:
                    lang_name, lang_code = detectar_idioma_texto(summary)
                    if not es_idioma_espanol(lang_name, lang_code):
                        rk = str(getattr(sh, "ratingKey", ""))
                        if rk and rk not in seen:
                            all_items.append(MediaItem(
                                ratingKey=rk,
                                type=str(getattr(sh, "type", "show")),
                                title=str(getattr(sh, "title", "")),
                                language_name=lang_name,
                                language_code=lang_code,
                                summary=summary,
                                library=lib,
                            ))
                            seen.add(rk)
                try:
                    for se in sh.seasons():
                        summary = _get_summary(se, plex)
                        if not summary:
                            continue
                        lang_name, lang_code = detectar_idioma_texto(summary)
                        if es_idioma_espanol(lang_name, lang_code):
                            continue
                        rk = str(getattr(se, "ratingKey", ""))
                        if not rk or rk in seen:
                            continue
                        all_items.append(MediaItem(
                            ratingKey=rk,
                            type=str(getattr(se, "type", "season")),
                            title=_format_title(se),
                            language_name=lang_name,
                            language_code=lang_code,
                            summary=summary,
                            library=lib,
                        ))
                        seen.add(rk)
                except Exception:
                    pass
                try:
                    for ep in sh.episodes():
                        summary = _get_summary(ep, plex)
                        if not summary:
                            continue
                        lang_name, lang_code = detectar_idioma_texto(summary)
                        if es_idioma_espanol(lang_name, lang_code):
                            continue
                        rk = str(getattr(ep, "ratingKey", ""))
                        if not rk or rk in seen:
                            continue
                        all_items.append(MediaItem(
                            ratingKey=rk,
                            type=str(getattr(ep, "type", "episode")),
                            title=_format_title(ep),
                            language_name=lang_name,
                            language_code=lang_code,
                            summary=summary,
                            library=lib,
                        ))
                        seen.add(rk)
                except Exception:
                    continue

    now = _now_iso()
    with db_conn() as conn:
        conn.execute("DELETE FROM media_cache")
        for it in all_items:
            conn.execute(
                """
                INSERT INTO media_cache
                    (rating_key, type, title, language_name, language_code, summary, library, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (it.ratingKey, it.type, it.title, it.language_name, it.language_code, it.summary, it.library, now),
            )
        conn.execute(
            "UPDATE settings SET media_cache_last_updated = ? WHERE id = 1",
            (now,),
        )

    by_library: Dict[str, int] = {}
    for it in all_items:
        by_library[it.library] = by_library.get(it.library, 0) + 1

    return ImportResult(imported=len(all_items), by_library=by_library)


@app.get("/media/cache/stats", response_model=MediaCacheStats)
def media_cache_stats(_user=Depends(get_current_user)) -> MediaCacheStats:
    with db_conn() as conn:
        rows = conn.execute(
            "SELECT library, COUNT(*) as cnt FROM media_cache GROUP BY library"
        ).fetchall()
    by_library = {r["library"]: r["cnt"] for r in rows}
    return MediaCacheStats(total=sum(by_library.values()), by_library=by_library)


@app.post("/media/translate", response_model=List[TranslationOut])
def media_translate(
    payload: TranslateRequest, _user=Depends(get_current_user)
) -> List[TranslationOut]:
    settings = _settings_get()
    ai_settings = _settings_with_ai_profile(settings)
    plex = _plex_connect(settings)

    out: List[TranslationOut] = []
    for key in payload.ratingKeys:
        video = plex.fetchItem(int(key))
        summary = _get_summary(video, plex)
        if not summary:
            out.append(
                TranslationOut(
                    ratingKey=str(key),
                    translation="",
                    translation_language_name="desconocido",
                    translation_language_code="",
                )
            )
            continue
        translated = traducir(summary, ai_settings)
        lang_name, lang_code = detectar_idioma_texto(translated)
        if translated and not es_idioma_espanol(lang_name, lang_code):
            lang_name = "desconocido"
            lang_code = ""
        out.append(
            TranslationOut(
                ratingKey=str(key),
                translation=(translated or ""),
                translation_language_name=lang_name,
                translation_language_code=lang_code,
            )
        )
    return out


@app.post("/media/process", response_model=ProcessResult)
def media_process(
    payload: ProcessRequest, _user=Depends(get_current_user)
) -> ProcessResult:
    settings = _settings_get()
    plex = _plex_connect(settings)
    updated = 0
    errors = 0
    processed_translations: Dict[str, str] = {}
    for item in payload.items:
        try:
            translation = (item.translation or "").strip()
            if not translation:
                continue
            video = plex.fetchItem(int(item.ratingKey))
            actualizar_sinopsis_plex(plex, video, translation, bloquear=True)
            updated += 1
            processed_translations[item.ratingKey] = translation
        except Exception:
            errors += 1
    _media_cache_clear()
    if processed_translations:
        now = _now_iso()
        with db_conn() as conn:
            for rk, tr in processed_translations.items():
                conn.execute(
                    """
                    UPDATE media_cache
                    SET summary = ?, language_name = 'Español', language_code = 'es', updated_at = ?
                    WHERE rating_key = ?
                    """,
                    (tr, now, rk),
                )
    return ProcessResult(updated=updated, errors=errors)
