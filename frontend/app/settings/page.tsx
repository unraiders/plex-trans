'use client'

import { useEffect, useMemo, useState } from 'react'

import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Checkbox } from '../../components/ui/checkbox'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import Nav from '../_nav'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../lib/useAuth'

type AIProfile = {
  id: string
  name?: string
  ia?: string
  ia_url?: string
  ia_modelo?: string
  ai_api_key_set?: boolean
}

type Settings = {
  plex_ip?: string
  plex_port?: string
  bibliotecas?: string[]
  plex_token_set?: boolean
  ia?: string
  ia_url?: string
  ia_modelo?: string
  ai_api_key_set?: boolean
  ai_profiles?: AIProfile[]
  active_ai_profile_id?: string
}

type PlexLibrary = {
  type: string
  title: string
}

export default function SettingsPage() {
  const ready = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const [settings, setSettings] = useState<Settings | null>(null)
  const [libraries, setLibraries] = useState<PlexLibrary[]>([])

  const [plexIp, setPlexIp] = useState('')
  const [plexPort, setPlexPort] = useState('')
  const [plexToken, setPlexToken] = useState('')
  const [selectedLibraries, setSelectedLibraries] = useState<string[]>([])
  const [profiles, setProfiles] = useState<AIProfile[]>([])
  const [activeProfileId, setActiveProfileId] = useState<string>('')
  const [aiApiKey, setAiApiKey] = useState('')
  const [aiApiKeyDirty, setAiApiKeyDirty] = useState(false)

  const plexTokenHint = useMemo(() => {
    if (!settings) return ''
    return settings.plex_token_set ? 'Configurado (no se muestra)' : 'No configurado'
  }, [settings])

  const activeProfile = useMemo(() => {
    if (!profiles.length) return null
    return profiles.find((p) => p.id === activeProfileId) || profiles[0]
  }, [activeProfileId, profiles])

  const aiKeyHint = useMemo(() => {
    if (activeProfile) {
      return activeProfile.ai_api_key_set ? 'Configurado (no se muestra)' : 'No configurado'
    }
    if (!settings) return ''
    return settings.ai_api_key_set ? 'Configurado (no se muestra)' : 'No configurado'
  }, [activeProfile, settings])

  const ia = activeProfile?.ia || 'openai'
  const iaUrl = activeProfile?.ia_url || ''
  const iaModelo = activeProfile?.ia_modelo || ''
  const isDeepTranslator = ia === 'deep_translator'

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      setError('')
      try {
        const s = await apiFetch<Settings>('/settings')
        if (!mounted) return
        setSettings(s)
        setPlexIp(s.plex_ip || '')
        setPlexPort(s.plex_port || '')
        setSelectedLibraries(s.bibliotecas || [])
        const incomingProfiles = (s.ai_profiles || []).filter((p) => !!p?.id)
        if (incomingProfiles.length > 0) {
          setProfiles(incomingProfiles)
          setActiveProfileId(s.active_ai_profile_id || incomingProfiles[0].id)
        } else {
          const fallback: AIProfile = {
            id: 'default',
            name: 'OpenAI',
            ia: s.ia || 'openai',
            ia_url: s.ia_url || '',
            ia_modelo: s.ia_modelo || '',
            ai_api_key_set: !!s.ai_api_key_set,
          }
          setProfiles([fallback])
          setActiveProfileId('default')
        }
        setAiApiKey('')
        setAiApiKeyDirty(false)

        try {
          const libs = await apiFetch<PlexLibrary[]>('/plex/libraries')
          if (!mounted) return
          setLibraries(libs || [])
        } catch (e: any) {
          if (!mounted) return
          setLibraries([])
          setError(e?.message || 'Error cargando bibliotecas')
        }
      } catch (e: any) {
        if (!mounted) return
        setError(e?.message || 'Error')
      } finally {
        if (!mounted) return
        setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  function toggleLibrary(name: string) {
    setSelectedLibraries((prev) => {
      const set = new Set(prev)
      if (set.has(name)) set.delete(name)
      else set.add(name)
      return Array.from(set)
    })
  }

  function updateActiveProfile(patch: Partial<AIProfile>) {
    if (!activeProfile) return
    setProfiles((prev) =>
      prev.map((p) => (p.id === activeProfile.id ? { ...p, ...patch } : p))
    )
  }

  function createProfile() {
    const id =
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto && crypto.randomUUID()) ||
      `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const next: AIProfile = {
      id,
      name: `Perfil ${profiles.length + 1}`,
      ia: ia || 'openai',
      ia_url: iaUrl || '',
      ia_modelo: iaModelo || '',
      ai_api_key_set: false,
    }
    setProfiles((prev) => [...prev, next])
    setActiveProfileId(id)
    setAiApiKey('')
    setAiApiKeyDirty(false)
  }

  function deleteActiveProfile() {
    if (!activeProfile) return
    if (profiles.length <= 1) return
    const remaining = profiles.filter((p) => p.id !== activeProfile.id)
    setProfiles(remaining)
    setActiveProfileId(remaining[0].id)
    setAiApiKey('')
    setAiApiKeyDirty(false)
  }

  async function save() {
    setSaving(true)
    setError('')
    setOk('')
    try {
      const outgoingProfiles = profiles.map((p) => {
        const base: Record<string, unknown> = {
          id: p.id,
          name: p.name || '',
          ia: p.ia || 'openai',
          ia_url: p.ia_url || '',
          ia_modelo: p.ia_modelo || '',
        }
        if (p.id === activeProfileId && aiApiKeyDirty) {
          base.ai_api_key = aiApiKey
        }
        return base
      })
      const body: Record<string, unknown> = {
        plex_ip: plexIp,
        plex_port: plexPort,
        bibliotecas: selectedLibraries,
        ai_profiles: outgoingProfiles,
        active_ai_profile_id: activeProfileId,
      }
      if (plexToken) body.plex_token = plexToken
      const updated = await apiFetch<Settings>('/settings', { method: 'PUT', body })
      setSettings(updated)
      setPlexToken('')
      setAiApiKey('')
      setAiApiKeyDirty(false)
      setOk('Guardado')
      try {
        const libs = await apiFetch<PlexLibrary[]>('/plex/libraries')
        setLibraries(libs || [])
      } catch (e: any) {
        setLibraries([])
        setError(e?.message || 'Error cargando bibliotecas')
      }
    } catch (e: any) {
      setError(e?.message || 'Error')
    } finally {
      setSaving(false)
    }
  }

  if (!ready) return null

  return (
    <div>
      <Nav />
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Ajustes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && <p className="muted text-sm">Cargando...</p>}
            {error && <p className="error text-sm">{error}</p>}
            {ok && <p className="ok text-sm">{ok}</p>}

            <div className="grid gap-3 md:grid-cols-3">
              <div className="grid gap-2">
                <Label>Plex IP</Label>
                <Input value={plexIp} onChange={(e) => setPlexIp(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Plex Puerto</Label>
                <Input value={plexPort} onChange={(e) => setPlexPort(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Plex Token</Label>
                <Input
                  value={plexToken}
                  onChange={(e) => setPlexToken(e.target.value)}
                  placeholder={plexTokenHint}
                  type="password"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bibliotecas</CardTitle>
          </CardHeader>
          <CardContent>
            {libraries.length === 0 ? (
              <p className="muted text-sm">
                No se han podido cargar bibliotecas. Comprueba Plex y guarda antes.
              </p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {libraries.map((l) => (
                  <label
                    key={`${l.type}:${l.title}`}
                    className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-100"
                  >
                    <Checkbox
                      checked={selectedLibraries.includes(l.title)}
                      onCheckedChange={() => toggleLibrary(l.title)}
                    />
                    <span className="flex-1">{l.title}</span>
                    <span className="muted text-xs">({l.type})</span>
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>IA</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="grid gap-2">
                <Label>Perfil</Label>
                <Select
                  value={activeProfileId || undefined}
                  onValueChange={(v) => {
                    setActiveProfileId(v)
                    setAiApiKey('')
                    setAiApiKeyDirty(false)
                  }}
                >
                  <SelectTrigger aria-label="Perfil">
                    <SelectValue placeholder="Selecciona perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name || p.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" onClick={createProfile}>
                  Nuevo perfil
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={deleteActiveProfile}
                  disabled={profiles.length <= 1}
                >
                  Eliminar
                </Button>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label>Nombre</Label>
                <Input
                  value={activeProfile?.name || ''}
                  onChange={(e) => updateActiveProfile({ name: e.target.value })}
                />
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="grid gap-2">
                  <Label>IA</Label>
                  <Select
                    value={ia}
                    onValueChange={(next) => {
                      updateActiveProfile({
                        ia: next,
                        ...(next === 'deep_translator'
                          ? { ia_url: '', ia_modelo: '' }
                          : {}),
                      })
                      if (next === 'deep_translator') {
                        setAiApiKey('')
                        setAiApiKeyDirty(false)
                      }
                    }}
                  >
                    <SelectTrigger aria-label="IA">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="ollama">Ollama</SelectItem>
                      <SelectItem value="deep_translator">deep-translator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>IA URL</Label>
                  <Input
                    value={iaUrl}
                    onChange={(e) => updateActiveProfile({ ia_url: e.target.value })}
                    disabled={isDeepTranslator}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>IA Modelo</Label>
                  <Input
                    value={iaModelo}
                    onChange={(e) => updateActiveProfile({ ia_modelo: e.target.value })}
                    placeholder={ia === 'openai' ? 'gpt-4o-mini' : 'llama3.1:8b'}
                    disabled={isDeepTranslator}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>AI API Key</Label>
                  <Input
                    value={aiApiKey}
                    onChange={(e) => {
                      setAiApiKey(e.target.value)
                      setAiApiKeyDirty(true)
                    }}
                    placeholder={aiKeyHint}
                    type="password"
                    disabled={isDeepTranslator}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <Button onClick={save} disabled={saving} type="button">
                {saving ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
