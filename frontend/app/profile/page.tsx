'use client'

import { useEffect, useState } from 'react'

import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import Nav from '../_nav'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../lib/useAuth'

type UserProfile = {
  id: number
  username: string
}

export default function ProfilePage() {
  const ready = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [username, setUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    let mounted = true
    apiFetch<UserProfile>('/auth/me')
      .then((d) => {
        if (!mounted) return
        setProfile(d)
        setUsername(d.username)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  const passwordsMatch = newPassword === confirmPassword
  const hasPasswordChange = newPassword.length > 0
  const hasUsernameChange = profile ? username !== profile.username : false
  const canSubmit =
    (hasUsernameChange || (hasPasswordChange && passwordsMatch)) &&
    username.length > 0 &&
    (!hasPasswordChange || passwordsMatch) &&
    !saving

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setOk('')
    setSaving(true)
    try {
      const body: Record<string, string> = {}
      if (hasUsernameChange) body.username = username
      if (hasPasswordChange) body.new_password = newPassword
      await apiFetch('/auth/profile', { method: 'PUT', body })
      if (hasUsernameChange && profile) {
        setProfile({ ...profile, username })
      }
      setNewPassword('')
      setConfirmPassword('')
      setOk('Perfil actualizado correctamente')
    } catch (err: any) {
      setError(err?.message || 'Error')
    } finally {
      setSaving(false)
    }
  }

  if (!ready) return null

  return (
    <div>
      <Nav />
      <div className="mx-auto w-full max-w-xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Perfil</CardTitle>
          </CardHeader>
          <CardContent>
            {error && <p className="error mb-4 text-sm">{error}</p>}
            {ok && <p className="ok mb-4 text-sm">{ok}</p>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-2">
                <Label>Nombre de usuario</Label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>

              <div className="grid gap-2">
                <Label>Nueva contraseña</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Dejar vacío para no cambiar"
                />
              </div>

              {hasPasswordChange && (
                <div className="grid gap-2">
                  <Label>Confirmar contraseña</Label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  {confirmPassword.length > 0 && !passwordsMatch && (
                    <p className="error text-xs">Las contraseñas no coinciden</p>
                  )}
                </div>
              )}

              <div className="flex justify-end">
                <Button type="submit" disabled={!canSubmit}>
                  {saving ? 'Guardando...' : 'Guardar'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
