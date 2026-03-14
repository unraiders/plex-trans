'use client'

import { useEffect, useMemo, useState } from 'react'

import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { apiFetch, setToken } from '../lib/api'

type BootstrapResponse = {
  needs_setup: boolean
}

type AuthResponse = {
  access_token: string
}

function useBootstrap() {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    let mounted = true
    apiFetch<BootstrapResponse>('/auth/bootstrap')
      .then((d) => {
        if (!mounted) return
        setNeedsSetup(!!d.needs_setup)
      })
      .catch((e: any) => {
        if (!mounted) return
        setError(e?.message || 'Error')
      })
    return () => {
      mounted = false
    }
  }, [])

  return { needsSetup, error }
}

export default function HomePage() {
  const { needsSetup, error } = useBootstrap()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [msg, setMsg] = useState<string>('')
  const passwordOk = password.length > 0

  useEffect(() => {
    if (needsSetup === true) setMode('register')
    if (needsSetup === false) setMode('login')
  }, [needsSetup])

  const title = useMemo(() => {
    if (needsSetup == null) return 'Conectando...'
    if (needsSetup) return 'Inicializar usuario'
    return mode === 'login' ? 'Login' : 'Crear usuario'
  }, [mode, needsSetup])

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMsg('')
    setLoading(true)
    try {
      const path = mode === 'register' ? '/auth/register' : '/auth/login'
      const data = await apiFetch<AuthResponse>(path, {
        method: 'POST',
        body: { username, password },
      })
      setToken(data.access_token)
      window.location.href = '/media'
    } catch (err: any) {
      setMsg(err?.message || 'Error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex justify-center">
          <img src="/logo.png" alt="Plex Trans" className="h-24 w-24" />
        </div>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-xl">{title}</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            {error && <p className="error text-sm">{error}</p>}
            {msg && <p className="error text-sm">{msg}</p>}

            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-2">
                <Label>Usuario</Label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>

              <div className="grid gap-2">
                <Label>Contraseña</Label>
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>

              <div className="flex items-center justify-end gap-3">
                <Button
                  disabled={loading || !username || (mode === 'register' && !passwordOk)}
                  type="submit"
                >
                  {loading ? 'Procesando...' : mode === 'register' ? 'Crear' : 'Entrar'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
