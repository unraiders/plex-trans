'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  RowSelectionState,
} from '@tanstack/react-table'
import { X } from 'lucide-react'

import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Checkbox } from '../../components/ui/checkbox'
import { Input } from '../../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { Skeleton } from '../../components/ui/skeleton'
import { Toggle } from '../../components/ui/toggle'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table'
import { Textarea } from '../../components/ui/textarea'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '../../components/ui/pagination'
import Nav from '../_nav'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../lib/useAuth'
import { toast } from 'sonner'

type PlexLibrary = { type: string; title: string }
type AIProfile = { id: string; name?: string; ia?: string; ia_modelo?: string }
type Settings = { ia?: string; ai_profiles?: AIProfile[]; active_ai_profile_id?: string; offline_mode?: boolean }

type MediaItem = {
  ratingKey: string | number
  title: string
  library: string
  type: string
  language_name?: string
  language_code?: string
  summary?: string
  translation?: string
}

type MediaListResponse = {
  items: MediaItem[]
  total: number
  page: number
  page_size: number
}

type TranslateResponseItem = { ratingKey: string | number; translation: string }
type ProcessResponse = { updated: number; errors: number }
type PageCacheEntry = { items: MediaItem[]; total: number; page: number }

export default function MediaPage() {
  const ready = useAuth()
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [loading, setLoading] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [processing, setProcessing] = useState(false)

  const [libraries, setLibraries] = useState<PlexLibrary[]>([])
  const [aiProfileLabel, setAiProfileLabel] = useState<{ name: string; ia: string; modelo: string } | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const [library, setLibrary] = useState('')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState('')
  const [pageSize, setPageSize] = useState(() => {
    try { const s = localStorage.getItem('plex_page_size'); return s ? Number(s) : 50 } catch { return 50 }
  })
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [nonSpanishOnly, setNonSpanishOnly] = useState(true)

  const [items, setItems] = useState<MediaItem[]>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [translations, setTranslations] = useState<Record<string, string>>(() => {
    try { const s = sessionStorage.getItem('plex_translations'); return s ? JSON.parse(s) : {} } catch { return {} }
  })
  const [processed, setProcessed] = useState<Record<string, boolean>>(() => {
    try { const s = sessionStorage.getItem('plex_processed'); return s ? JSON.parse(s) : {} } catch { return {} }
  })
  const [pageCache, setPageCache] = useState<Record<string, PageCacheEntry>>(() => {
    try { const s = sessionStorage.getItem('plex_page_cache'); return s ? JSON.parse(s) : {} } catch { return {} }
  })
  const searchAbortRef = useRef<AbortController | null>(null)
  const searchRequestIdRef = useRef(0)

  const effectivePageSize = useMemo(() => Number(pageSize || 50), [pageSize])
  const effectiveLimitTotal = useMemo(() => {
    const n = Number(String(limit || '').trim())
    return Number.isFinite(n) && n > 0 ? Math.max(1, Math.floor(n)) : 0
  }, [limit])

  const queryKey = useMemo(
    () =>
      JSON.stringify({
        search: search.trim(),
        library: library.trim(),
        pageSize: Number(effectivePageSize || 50),
        nonSpanishOnly: !!nonSpanishOnly,
        limitTotal: effectiveLimitTotal,
      }),
    [effectivePageSize, effectiveLimitTotal, library, nonSpanishOnly, search]
  )

  const selectedKeys = useMemo(
    () => Object.keys(rowSelection).filter((k) => rowSelection[k]),
    [rowSelection]
  )
  const selectedItems = useMemo(() => {
    const keys = new Set(selectedKeys)
    return items.filter((it) => keys.has(String(it.ratingKey)))
  }, [items, selectedKeys])
  const keysToTranslate = useMemo(
    () =>
      selectedItems
        .filter((it) => String(it.translation || '').trim().length === 0)
        .map((it) => String(it.ratingKey)),
    [selectedItems]
  )
  const canTranslate = keysToTranslate.length > 0
  const canProcess = useMemo(
    () => selectedKeys.some((k) => String(translations[k] || '').trim().length > 0),
    [selectedKeys, translations]
  )

  const pageCount = useMemo(
    () => (total ? Math.max(1, Math.ceil(total / effectivePageSize)) : 1),
    [effectivePageSize, total]
  )
  const rangeStart = total ? (page - 1) * effectivePageSize + 1 : 0
  const rangeEnd = total ? Math.min(total, page * effectivePageSize) : 0

  // Columns definition
  const columns = useMemo<ColumnDef<MediaItem>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={(v) => {
              // only toggle rows that are not processed
              const rows = table.getRowModel().rows
              const next: RowSelectionState = { ...rowSelection }
              for (const row of rows) {
                const k = String((row.original as MediaItem).ratingKey)
                if (!processed[k]) next[k] = v === true
              }
              setRowSelection(next)
            }}
            disabled={items.length === 0 || items.every((it) => processed[String(it.ratingKey)])}
          />
        ),
        cell: ({ row }) => {
          const k = String((row.original as MediaItem).ratingKey)
          return (
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={() => {
                if (!processed[k]) row.toggleSelected()
              }}
              disabled={!!processed[k]}
            />
          )
        },
        enableSorting: false,
        enableHiding: false,
        size: 40,
      },
      {
        id: 'title',
        header: 'Título',
        cell: ({ row }) => {
          const it = row.original as MediaItem
          return (
            <div>
              <div className="text-sm text-zinc-900 dark:text-zinc-100">{it.title}</div>
              <div className="muted text-xs">
                {it.library} · {it.type} · {String(it.ratingKey)}
              </div>
            </div>
          )
        },
        size: 260,
      },
      {
        id: 'language',
        header: 'Idioma',
        cell: ({ row }) => {
          const it = row.original as MediaItem
          return (
            <span className="text-sm">
              {it.language_name}{' '}
              <span className="muted">({it.language_code || '-'})</span>
            </span>
          )
        },
        size: 140,
      },
      {
        id: 'summary',
        header: 'Sinopsis',
        cell: ({ row }) => {
          const it = row.original as MediaItem
          return <Textarea readOnly value={it.summary || ''} className="min-h-[104px]" />
        },
      },
      {
        id: 'translation',
        header: 'Traducción',
        cell: ({ row }) => {
          const it = row.original as MediaItem
          const k = String(it.ratingKey)
          return (
            <Textarea
              value={it.translation || ''}
              onChange={(e) => {
                const v = e.target.value
                setTranslations((prev) => {
                  const next = { ...prev }
                  if (!String(v || '').trim()) delete next[k]
                  else next[k] = v
                  return next
                })
                setItems((prev) =>
                  prev.map((x) =>
                    String(x.ratingKey) === k ? { ...x, translation: v } : x
                  )
                )
                setRowSelection((prev) => ({ ...prev, [k]: false }))
              }}
              placeholder="Traducción aparecerá aquí tras pulsar Traducir"
              className="min-h-[104px]"
            />
          )
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, processed, rowSelection, translations]
  )

  const table = useReactTable({
    data: items,
    columns,
    getRowId: (row) => String(row.ratingKey),
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    enableRowSelection: (row) => !processed[String((row.original as MediaItem).ratingKey)],
  })

  useEffect(() => {
    let mounted = true
    apiFetch<PlexLibrary[]>('/plex/libraries')
      .then((d) => { if (mounted) setLibraries(d || []) })
      .catch(() => { setLibraries([]) })
    apiFetch<Settings>('/settings')
      .then((s) => {
        if (!mounted) return
        const profiles = (s?.ai_profiles || []).filter((p) => !!p?.id)
        const active = profiles.find((p) => p.id === s?.active_ai_profile_id) || profiles[0] || null
        setAiProfileLabel(active ? {
          name: active.name?.trim() || 'Sin nombre',
          ia: (active.ia || s?.ia || '').trim(),
          modelo: (active.ia_modelo || '').trim(),
        } : null)
        setIsOffline(!!s?.offline_mode)
      })
      .catch(() => { setAiProfileLabel(null) })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    try { sessionStorage.setItem('plex_translations', JSON.stringify(translations)) } catch {}
  }, [translations])
  useEffect(() => {
    try { sessionStorage.setItem('plex_processed', JSON.stringify(processed)) } catch {}
  }, [processed])
  useEffect(() => {
    try { sessionStorage.setItem('plex_page_cache', JSON.stringify(pageCache)) } catch {}
  }, [pageCache])
  useEffect(() => {
    try { localStorage.setItem('plex_page_size', String(pageSize)) } catch {}
  }, [pageSize])

  function cancelBuscar() {
    searchAbortRef.current?.abort()
  }

  async function fetchPage(nextPage: number, pageSizeOverride?: number, showToast = false) {
    const requestId = (searchRequestIdRef.current += 1)
    searchAbortRef.current?.abort()
    const controller = new AbortController()
    searchAbortRef.current = controller
    setError('')
    setOk('')
    setLoading(true)
    try {
      const cacheKey = `${queryKey}:${nextPage}`
      const cached = pageCache[cacheKey]
      if (cached) {
        const hydrated = (cached.items || []).map((x) => ({
          ...x,
          translation: translations[String(x.ratingKey)] ?? x.translation ?? '',
        }))
        setItems(hydrated)
        setTotal(Number(cached.total || 0))
        setPage(Number(cached.page || nextPage))
        setOk(`Cargados: ${hydrated.length}`)
        return
      }
      setItems([])
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      if (library.trim()) params.set('library', library.trim())
      params.set('page', String(nextPage))
      params.set('page_size', String(pageSizeOverride ?? effectivePageSize ?? 50))
      params.set('non_spanish_only', nonSpanishOnly ? 'true' : 'false')
      if (effectiveLimitTotal > 0) params.set('limit_total', String(effectiveLimitTotal))
      const data = await apiFetch<MediaListResponse>(`/media?${params.toString()}`, {
        signal: controller.signal,
      })
      if (requestId !== searchRequestIdRef.current) return
      const normalizedBase: MediaItem[] = (data.items || []).map((x) => ({
        ...x,
        translation: x.translation || '',
      }))
      setPageCache((prev) => ({
        ...prev,
        [cacheKey]: { items: normalizedBase, total: Number(data.total || 0), page: Number(data.page || nextPage) },
      }))
      const normalized = normalizedBase.map((x) => ({
        ...x,
        translation: translations[String(x.ratingKey)] ?? x.translation ?? '',
      }))
      setItems(normalized)
      setTotal(Number(data.total || 0))
      setPage(Number(data.page || nextPage))
      setOk(`Cargados: ${normalized.length}`)
      if (showToast) toast.info(`Búsqueda completada`, { description: `${Number(data.total || 0)} elemento(s) encontrados` })
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        if (requestId === searchRequestIdRef.current) setOk('Búsqueda cancelada')
        return
      }
      setError(e?.message || 'Error')
    } finally {
      if (requestId === searchRequestIdRef.current) setLoading(false)
    }
  }

  async function buscar() {
    setError('')
    setOk('')
    setItems([])
    setRowSelection({})
    if (Object.keys(processed).length > 0) {
      setTranslations({})
      setProcessed({})
      setPageCache({})
    }
    setTotal(0)
    setPage(1)
    await fetchPage(1, undefined, true)
  }

  async function traducirSeleccion() {
    setError('')
    setOk('')
    setTranslating(true)
    const t0 = Date.now()
    try {
      const keys = keysToTranslate
      if (keys.length === 0) throw new Error('No hay selección')
      const res = await apiFetch<TranslateResponseItem[]>('/media/translate', {
        method: 'POST',
        body: { ratingKeys: keys },
      })
      const map = new Map((res || []).map((r) => [String(r.ratingKey), r]))
      setItems((prev) =>
        prev.map((it) => {
          const r = map.get(String(it.ratingKey))
          return r ? { ...it, translation: r.translation || '' } : it
        })
      )
      setTranslations((prev) => {
        const next = { ...prev }
        for (const r of res || []) next[String(r.ratingKey)] = r.translation || ''
        return next
      })
      const secs = ((Date.now() - t0) / 1000).toFixed(1)
      setOk(`Traducidos: ${res.length} · ${secs}s`)
      toast.info(`Traducción completada`, { description: `${res.length} elemento(s) traducidos en ${secs}s` })
    } catch (e: any) {
      setError(e?.message || 'Error')
    } finally {
      setTranslating(false)
    }
  }

  async function procesarSeleccion() {
    setError('')
    setOk('')
    setProcessing(true)
    try {
      const payload = selectedKeys
        .map((k) => ({ ratingKey: k, translation: String(translations[k] || '') }))
        .filter((x) => x.translation.trim())
      if (payload.length === 0) throw new Error('No hay traducciones para procesar')
      const res = await apiFetch<ProcessResponse>('/media/process', {
        method: 'POST',
        body: { items: payload },
      })
      setProcessed((prev) => {
        const next = { ...prev }
        for (const it of payload) next[it.ratingKey] = true
        return next
      })
      setRowSelection((prev) => {
        const next = { ...prev }
        for (const it of payload) next[it.ratingKey] = false
        return next
      })
      setOk(`Actualizados: ${res.updated} | Errores: ${res.errors}`)
      toast.info(`Proceso completado`, { description: `${res.updated} actualizado(s) · ${res.errors} error(es)` })
    } catch (e: any) {
      setError(e?.message || 'Error')
    } finally {
      setProcessing(false)
    }
  }

  function getPageNumbers(current: number, max: number): number[] {
    const half = 2
    let start = Math.max(1, current - half)
    let end = Math.min(max, start + 4)
    start = Math.max(1, end - 4)
    const out: number[] = []
    for (let i = start; i <= end; i++) out.push(i)
    return out
  }

  if (!ready) return null

  return (
    <div>
      <Nav />
      <div className="mx-auto w-full max-w-7xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              Medios
              {isOffline && (
                <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                  Modo offline
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && <p className="error text-sm">{error}</p>}
            {ok && <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">{ok}</p>}

            {/* Filtros */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base">Búsqueda</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-12">
                <div className="grid gap-2 md:col-span-3">
                  <label className="text-xs text-zinc-700 dark:text-zinc-300">Biblioteca</label>
                  <Select
                    value={library ? library : '__all__'}
                    onValueChange={(v) => setLibrary(v === '__all__' ? '' : v)}
                  >
                    <SelectTrigger aria-label="Biblioteca">
                      <SelectValue placeholder="Selecciona biblioteca" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">(Usar las configuradas)</SelectItem>
                      {libraries.map((l) => (
                        <SelectItem key={`${l.type}:${l.title}`} value={l.title}>
                          {l.title} ({l.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2 md:col-span-3">
                  <label className="text-xs text-zinc-700 dark:text-zinc-300">Filtro por título</label>
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>

                <div className="flex flex-col gap-3 md:col-span-4 md:flex-row md:items-end">
                  <Toggle 
                    pressed={nonSpanishOnly}
                    onPressedChange={setNonSpanishOnly}
                    
                  >
                    Solo no español
                  </Toggle>
                  <div className="grid w-full gap-2 md:w-48">
                    <label className="text-xs text-zinc-700 dark:text-zinc-300">Límite</label>
                    <Input
                      value={limit}
                      onChange={(e) => setLimit(e.target.value)}
                      placeholder="(sin límite)"
                      inputMode="numeric"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end md:col-span-2 md:pt-5">
                  <div className="flex w-full items-center gap-2">
                    <Button onClick={buscar} disabled={loading} type="button" className="w-full">
                      {loading ? 'Buscando...' : 'Buscar'}
                    </Button>
                    {loading && (
                      <Button
                        onClick={cancelBuscar}
                        type="button"
                        variant="secondary"
                        size="icon"
                        title="Cancelar búsqueda"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Acciones */}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={traducirSeleccion}
                disabled={loading || translating || processing || selectedKeys.length === 0 || !canTranslate}
                type="button"
              >
                {translating ? 'Traduciendo...' : 'Traducir'}
              </Button>
              <Button
                onClick={procesarSeleccion}
                disabled={loading || translating || processing || selectedKeys.length === 0 || !canProcess}
                type="button"
                variant="secondary"
              >
                {processing ? 'Procesando...' : 'Procesar'}
              </Button>
            </div>
            {!!aiProfileLabel && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Perfil IA activo:{' '}
                <span className="font-semibold text-yellow-600 dark:text-yellow-400">{aiProfileLabel.name}</span>
                {aiProfileLabel.ia && <> · <span className="font-semibold text-yellow-600 dark:text-yellow-400">{aiProfileLabel.ia}</span></>}
                {aiProfileLabel.modelo && <> · <span className="font-semibold text-yellow-600 dark:text-yellow-400">{aiProfileLabel.modelo}</span></>}
              </p>
            )}

            {/* Data Table */}
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id} className="border-0">
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          style={header.column.columnDef.size ? { width: header.column.columnDef.size } : undefined}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-[104px] w-full" /></TableCell>
                        <TableCell><Skeleton className="h-[104px] w-full" /></TableCell>
                      </TableRow>
                    ))
                  ) : table.getRowModel().rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="muted text-center">
                        Sin resultados
                      </TableCell>
                    </TableRow>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        data-state={row.getIsSelected() ? 'selected' : undefined}
                        className={row.getIsSelected() ? 'bg-yellow-50 dark:bg-yellow-900/10' : undefined}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Paginación */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="muted text-sm">
                {total > 0 ? `Mostrando ${rangeStart}-${rangeEnd} de ${total}` : 'Sin resultados'}
                {selectedKeys.length > 0 && (
                  <span className="ml-2 font-medium text-yellow-600 dark:text-yellow-400">· {selectedKeys.length} seleccionado{selectedKeys.length !== 1 ? 's' : ''}</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="muted text-xs">Por página</span>
                  <Select
                    value={String(effectivePageSize)}
                    onValueChange={(v) => {
                      const next = Number(v)
                      if (!Number.isFinite(next) || next <= 0) return
                      setPageSize(next)
                      setLimit('')
                      setPage(1)
                      fetchPage(1, next)
                    }}
                  >
                    <SelectTrigger className="h-9 w-[96px] px-2 text-sm" aria-label="Por página">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {![5, 10, 25, 50, 100].includes(effectivePageSize) && (
                        <SelectItem value={String(effectivePageSize)}>{effectivePageSize}</SelectItem>
                      )}
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Pagination className="w-auto mx-0 justify-start">
                  <PaginationContent className="flex-wrap">
                    <PaginationItem>
                      <PaginationPrevious disabled={loading || page <= 1} onClick={() => fetchPage(page - 1)} />
                    </PaginationItem>

                    {(() => {
                      const pages = getPageNumbers(page, pageCount)
                      const items = []
                      if (pages[0] > 1) {
                        items.push(
                          <PaginationItem key="start">
                            <PaginationLink onClick={() => fetchPage(1)} disabled={loading}>1</PaginationLink>
                          </PaginationItem>
                        )
                        if (pages[0] > 2) {
                          items.push(<PaginationItem key="ellipsis-start"><PaginationEllipsis /></PaginationItem>)
                        }
                      }
                      pages.forEach((p) => {
                        items.push(
                          <PaginationItem key={p}>
                            <PaginationLink isActive={p === page} onClick={() => fetchPage(p)} disabled={loading}>{p}</PaginationLink>
                          </PaginationItem>
                        )
                      })
                      if (pages[pages.length - 1] < pageCount) {
                        if (pages[pages.length - 1] < pageCount - 1) {
                          items.push(<PaginationItem key="ellipsis-end"><PaginationEllipsis /></PaginationItem>)
                        }
                        items.push(
                          <PaginationItem key="end">
                            <PaginationLink onClick={() => fetchPage(pageCount)} disabled={loading}>{pageCount}</PaginationLink>
                          </PaginationItem>
                        )
                      }
                      return items
                    })()}

                    <PaginationItem>
                      <PaginationNext disabled={loading || page >= pageCount} onClick={() => fetchPage(page + 1)} />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
