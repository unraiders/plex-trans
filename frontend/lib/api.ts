let _apiBaseUrl: string | null = null

async function getApiBaseUrl(): Promise<string> {
  if (_apiBaseUrl) return _apiBaseUrl
  try {
    const res = await fetch('/api/config', { cache: 'no-store' })
    const data = await res.json()
    _apiBaseUrl = data.apiBaseUrl || 'http://localhost:8000'
  } catch {
    _apiBaseUrl = 'http://localhost:8000'
  }
  return _apiBaseUrl
}

export type ApiFetchOptions = {
  method?: string
  body?: unknown
  token?: string
  signal?: AbortSignal
}

export type ApiError = Error & {
  status?: number
  data?: unknown
}

export function getToken(): string {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem('token') || ''
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return
  if (!token) window.localStorage.removeItem('token')
  else window.localStorage.setItem('token', token)
}

export async function apiFetch<T = unknown>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method, body, token, signal } = options
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const authToken = token || getToken()
  if (authToken) headers.Authorization = `Bearer ${authToken}`

  const baseUrl = await getApiBaseUrl()

  const res = await fetch(`${baseUrl}${path}`, {
    method: method || 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    signal,
  })

  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (!res.ok) {
    const msg =
      (data as any)?.detail || (data as any)?.message || `HTTP ${res.status}`
    if (
      res.status === 401 &&
      typeof window !== 'undefined' &&
      !String(path || '').startsWith('/auth/')
    ) {
      setToken('')
      window.location.href = '/'
    }
    const err: ApiError = new Error(msg)
    err.status = res.status
    err.data = data
    throw err
  }

  return data as T
}
