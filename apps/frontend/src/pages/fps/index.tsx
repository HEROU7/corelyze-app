import { useEffect, useMemo, useState } from "react"
import { useLocation } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import {
  Gamepad2,
  Zap,
  Search,
  Loader2,
  ScanLine,
  Cpu,
  Video,
  MemoryStick,
  HardDrive,
  Crosshair,
  Trophy,
  Rocket,
  Disc3,
  Box,
} from "lucide-react"
import {
  FPS_RESOLUTIONS,
  FPS_PRESETS,
  GAME_CATEGORIES,
  type FpsPreset,
  type FpsResolution,
  type GameCategory,
} from "@/lib/fps-data"
import {
  estimateAll,
  summarizeEstimates,
  profileFromComponents,
  profileFromHardware,
  type FpsEstimate,
  type FpsSystemProfile,
} from "@/lib/fps-estimator"
import { matchDetectedHardware } from "@/lib/diagnostics"
import { hardwareService } from "@/services/hardware.service"
import type { Component, HardwareScanResult } from "@/services/types"

interface LocationState {
  profile?: FpsSystemProfile
  resolution?: FpsResolution
  preset?: FpsPreset
  source?: string
}

interface TauriInternals {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
}

async function scanLocal(): Promise<HardwareScanResult | null> {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__
  if (!internals?.invoke) return null
  try {
    const payload = (await internals.invoke("scan_hardware")) as Record<string, unknown> | null | undefined
    if (!payload || typeof payload !== "object") return null
    return {
      scannedAt: new Date().toISOString(),
      hardware: {
        hostname: String(payload.hostname ?? "—"),
        platform: String(payload.platform ?? "—"),
        os: String(payload.platform ?? "—"),
        osVersion: "",
        arch: String(payload.arch ?? "—"),
        cpuModel: String(payload.cpuModel ?? "—"),
        cpuCores: Number(payload.cpuCores ?? 0),
        cpuLogical: Number(payload.cpuLogical ?? 0),
        cpuSpeedGhz: Number(payload.cpuSpeedGhz ?? 0),
        totalMemoryGB: Number(payload.totalMemoryGB ?? 0),
        freeMemoryGB: Number(payload.freeMemoryGB ?? 0),
        usedMemoryGB: Math.max(0, Number(payload.totalMemoryGB ?? 0) - Number(payload.freeMemoryGB ?? 0)),
        gpus: Array.isArray(payload.gpus)
          ? (payload.gpus as Array<Record<string, unknown>>).map((g) => ({
              name: String(g.name ?? "—"),
              vramGB: g.vramGB === null || g.vramGB === undefined ? null : Number(g.vramGB),
            }))
          : [],
        motherboard: null,
        storage: Array.isArray(payload.storage)
          ? (payload.storage as Array<Record<string, unknown>>).map((d) => ({
              model: String(d.model ?? "—"),
              type: (d.kind === "SSD" || d.kind === "HDD" ? d.kind : "Desconocido") as
                | "SSD"
                | "HDD"
                | "Desconocido",
              capacityGB: Number(d.capacityGB ?? 0),
              freeGB: Number(d.freeGB ?? 0),
            }))
          : [],
        driverIssues: [],
        source: "tauri",
      },
    }
  } catch {
    return null
  }
}

const CATEGORY_ICONS: Record<GameCategory, typeof Trophy> = {
  Competitivos: Crosshair,
  eSports: Trophy,
  "AAA Exigentes": Rocket,
  Simulación: Disc3,
  Sandbox: Box,
}

function bottleneckBadge(kind: FpsEstimate["bottleneck"]): "success" | "warning" | "info" | "destructive" {
  switch (kind) {
    case "GPU":
      return "info"
    case "CPU":
      return "warning"
    case "RAM":
    case "VRAM":
      return "destructive"
    case "ALMACENAMIENTO":
      return "destructive"
    default:
      return "success"
  }
}

function GameCard({ estimate }: { estimate: FpsEstimate }) {
  const Icon = CATEGORY_ICONS[estimate.game.category]
  const pct = Math.min(100, (estimate.avgFps / 240) * 100)
  return (
    <Card className="lift group relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-80"
        style={{ backgroundImage: "linear-gradient(90deg, transparent, var(--section-accent), transparent)" }}
        aria-hidden="true"
      />
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-section/20 bg-section/10 text-section">
                <Icon className="h-4 w-4" />
              </span>
              <span className="truncate" style={{ fontFamily: "var(--font-display)" }}>
                {estimate.game.name}
              </span>
            </CardTitle>
            <CardDescription className="mt-1">
              {estimate.game.category} · {estimate.game.year}
            </CardDescription>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-3xl font-bold tracking-tight text-orange-400 glow-text" style={{ fontFamily: "var(--font-display)" }}>
              {estimate.avgFps}
            </div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              FPS promedio
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={pct} />

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2.5 text-center">
            <div className="text-sm font-semibold text-foreground">{estimate.low1Fps}</div>
            <div className="text-[10px] text-muted-foreground">1% Low</div>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2.5 text-center">
            <div className="text-sm font-semibold text-foreground">{estimate.rating.monitorHz} Hz</div>
            <div className="text-[10px] text-muted-foreground">Monitor sugerido</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge variant={bottleneckBadge(estimate.bottleneck)} className="text-[10px]">
            {estimate.bottleneck === "EQUILIBRADO" ? "Equilibrado" : `Limitado por ${estimate.bottleneck}`}
          </Badge>
          {estimate.game.rayTracing && (
            <Badge variant="secondary" className="text-[10px]">
              Ray Tracing
            </Badge>
          )}
          {estimate.game.upscaler && (
            <Badge variant="secondary" className="text-[10px]">
              DLSS/FSR
            </Badge>
          )}
          {estimate.warningVram && (
            <Badge variant="destructive" className="text-[10px]">
              VRAM insuficiente
            </Badge>
          )}
        </div>

        <div className="space-y-2 border-t border-white/[0.06] pt-2.5">
          <Badge
            variant={estimate.rating.tier === "144hz" || estimate.rating.tier === "extrema" ? "section" : "secondary"}
            className="text-[10px]"
          >
            {estimate.rating.label}
          </Badge>
          {estimate.game.notes && (
            <p className="whitespace-normal break-words text-xs leading-snug text-muted-foreground">
              {estimate.game.notes}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

const PICKERS = [
  { key: "gpu" as const, label: "Tarjeta gráfica", icon: Video, categorySlug: "gpu" },
  { key: "cpu" as const, label: "Procesador", icon: Cpu, categorySlug: "cpu" },
  { key: "ram" as const, label: "Memoria RAM", icon: MemoryStick, categorySlug: "ram" },
  { key: "storage" as const, label: "Almacenamiento", icon: HardDrive, categorySlug: "storage" },
]

type PickKey = "gpu" | "cpu" | "ram" | "storage"
const EMPTY_PICKS: Record<PickKey, string> = { gpu: "", cpu: "", ram: "", storage: "" }

export default function FpsPage() {
  const location = useLocation()
  const navState = (location.state as LocationState | null) ?? null

  const [profile, setProfile] = useState<FpsSystemProfile | null>(navState?.profile ?? null)
  const [sourceLabel, setSourceLabel] = useState(navState?.source ?? "Sistema")
  const [resolution, setResolution] = useState<FpsResolution>(navState?.resolution ?? "1080p")
  const [preset, setPreset] = useState<FpsPreset>(navState?.preset ?? "Medio")

  const [catalog, setCatalog] = useState<Record<string, Component[]>>({})
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [detecting, setDetecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picks, setPicks] = useState<Record<PickKey, string>>(EMPTY_PICKS)

  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<GameCategory | "Todos">("Todos")

  useEffect(() => {
    let cancelled = false
    hardwareService
      .getComponents()
      .then((components) => {
        if (cancelled) return
        const grouped: Record<string, Component[]> = {}
        for (const c of components) {
          ;(grouped[c.categoria.slug] ??= []).push(c)
        }
        setCatalog(grouped)
        setLoadingCatalog(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "No se pudo cargar el catálogo")
        setLoadingCatalog(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const applyPicks = (next: Record<PickKey, string>) => {
    setPicks(next)
    const ids = Object.values(next).filter(Boolean)
    if (ids.length === 0) return
    const list: Component[] = []
    for (const picker of PICKERS) {
      const found = catalog[picker.categorySlug]?.find((c) => c.id === next[picker.key])
      if (found) list.push(found)
    }
    if (list.length > 0) {
      setProfile(profileFromComponents(list))
      setSourceLabel("Manual")
    }
  }

  const detect = async () => {
    setDetecting(true)
    setError(null)
    try {
      const native = await scanLocal()
      const res = native ?? (await hardwareService.scanHardware())
      if (!res?.hardware) throw new Error("El escaneo no devolvió información de hardware")

      const components = await hardwareService.getComponents()
      const matched = matchDetectedHardware(res.hardware, components)
      const matchedList = Object.values(matched.bySlot).filter((c): c is Component => Boolean(c))

      setProfile(profileFromHardware(res.hardware, matchedList))
      setSourceLabel("PC detectada")

      const next: Record<PickKey, string> = EMPTY_PICKS
      if (matched.bySlot.gpu) next.gpu = matched.bySlot.gpu.id
      if (matched.bySlot.cpu) next.cpu = matched.bySlot.cpu.id
      if (matched.bySlot.ram) next.ram = matched.bySlot.ram.id
      if (matched.bySlot.storage) next.storage = matched.bySlot.storage.id
      setPicks(next)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo detectar el hardware")
    } finally {
      setDetecting(false)
    }
  }

  const estimates = useMemo(() => {
    if (!profile) return []
    const all = estimateAll(profile, resolution, preset)
    const q = search.trim().toLowerCase()
    return all.filter((e) => {
      if (category !== "Todos" && e.game.category !== category) return false
      if (q && !e.game.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [profile, resolution, preset, search, category])

  const summary = useMemo(() => (estimates.length > 0 ? summarizeEstimates(estimates) : null), [estimates])

  const groupedList = useMemo(() => {
    const map = new Map<GameCategory, FpsEstimate[]>()
    for (const e of estimates) {
      const list = map.get(e.game.category) ?? []
      list.push(e)
      map.set(e.game.category, list)
    }
    return map
  }, [estimates])

  const hasProfile = profile !== null

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Gamepad2 className="h-7 w-7 text-primary glow-text" />
            Estimador de FPS
          </h1>
          <p className="text-muted-foreground">
            50 juegos populares · proyección basada en GPU, CPU, RAM y almacenamiento detectados.
          </p>
        </div>
        {hasProfile && profile && (
          <Badge variant="section" className="px-3 py-1">
            Sistema: {profile.gpu?.name ?? "Sin GPU"} · {profile.cpu?.name ?? "Sin CPU"}
          </Badge>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Sistema a evaluar
            </CardTitle>
            <Button size="sm" variant="outline" onClick={detect} disabled={detecting}>
              {detecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
              {detecting ? "Detectando…" : "Detectar mi PC"}
            </Button>
          </div>
          <CardDescription>
            Fuente: {sourceLabel}. Puedes elegir componentes del catálogo o usar el detectado por el Escaneo Local.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasProfile && profile ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Video className="h-3.5 w-3.5 text-primary" /> GPU
                </div>
                <div className="mt-1 truncate text-sm font-medium">{profile.gpu?.name ?? "—"}</div>
                <div className="text-[10px] text-muted-foreground">
                  {profile.gpu ? `Score ${profile.gpu.score} · ${profile.gpu.vramGB ?? "?"} GB VRAM` : ""}
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Cpu className="h-3.5 w-3.5 text-primary" /> CPU
                </div>
                <div className="mt-1 truncate text-sm font-medium">{profile.cpu?.name ?? "—"}</div>
                <div className="text-[10px] text-muted-foreground">
                  {profile.cpu ? `Score ${profile.cpu.score}` : ""}
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <MemoryStick className="h-3.5 w-3.5 text-primary" /> RAM
                </div>
                <div className="mt-1 truncate text-sm font-medium">
                  {profile.ramGB > 0 ? `${profile.ramGB} GB ${profile.ramType}` : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {profile.ramSpeedMhz ? `${profile.ramSpeedMhz} MHz` : ""}
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <HardDrive className="h-3.5 w-3.5 text-primary" /> Almacenamiento
                </div>
                <div className="mt-1 truncate text-sm font-medium">{profile.storageType}</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {loadingCatalog
                ? "Cargando catálogo…"
                : "Aún no hay un sistema definido. Detecta tu PC o elige componentes a continuación."}
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {PICKERS.map((picker) => {
              const Icon = picker.icon
              return (
                <label key={picker.key} className="block space-y-1">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                    {picker.label}
                  </span>
                  <select
                    value={picks[picker.key]}
                    onChange={(e) => applyPicks({ ...picks, [picker.key]: e.target.value })}
                    className={cn(
                      "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors",
                      "focus:border-primary focus:ring-1 focus:ring-primary/40",
                      Object.values(picks).some(Boolean) && !picks[picker.key] && "text-muted-foreground",
                    )}
                  >
                    <option value="">Sin seleccionar</option>
                    {(catalog[picker.categorySlug] ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.marca.nombre} {c.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Segmented
            options={FPS_RESOLUTIONS}
            value={resolution}
            onChange={setResolution}
          />
          <Segmented options={FPS_PRESETS} value={preset} onChange={setPreset} />
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar juego…"
            className="h-9 w-56 rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/40"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["Todos", ...GAME_CATEGORIES] as const).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              category === cat
                ? "border-section/40 bg-section/15 text-section"
                : "border-white/[0.08] bg-white/[0.03] text-muted-foreground hover:text-foreground",
            )}
          >
            {cat === "Todos" ? "Todos los juegos" : cat}
          </button>
        ))}
      </div>

      {summary && (
        <div className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.05] sm:grid-cols-3">
          <div className="bg-white/[0.02] p-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Promedio en {summary.total} títulos
            </div>
            <div className="mt-1 text-3xl font-bold text-orange-400 glow-text" style={{ fontFamily: "var(--font-display)" }}>
              {summary.average} FPS
            </div>
            <div className="text-[11px] text-muted-foreground">
              {resolution} · {preset}
            </div>
          </div>
          <div className="bg-white/[0.02] p-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Fluidos (60+ FPS)
            </div>
            <div className="mt-1 text-3xl font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }}>
              {summary.count60}
            </div>
            <div className="text-[11px] text-muted-foreground">de {summary.total} juegos</div>
          </div>
          <div className="bg-white/[0.02] p-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Listos para 144Hz
            </div>
            <div className="mt-1 text-3xl font-bold text-cyan-300" style={{ fontFamily: "var(--font-display)" }}>
              {summary.count144}
            </div>
            <div className="text-[11px] text-muted-foreground">de {summary.total} juegos</div>
          </div>
        </div>
      )}

      {!hasProfile && (
        <div className="glass-panel top-hairline rounded-2xl p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-section/20 bg-section/10 text-section">
            <Gamepad2 className="h-8 w-8" />
          </div>
          <h3 className="mt-4 text-lg font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Define tu sistema para comenzar
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Selecciona por lo menos una GPU o un procesador en los desplegables superiores, o usa «Detectar mi PC»
            para sincronizar el escaneo local.
          </p>
        </div>
      )}

      {hasProfile && estimates.length === 0 && (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-6 text-center text-sm text-muted-foreground">
          No se encontraron juegos con el filtro «{search || category}».
        </div>
      )}

      {hasProfile &&
        [...groupedList.entries()].map(([cat, list]) => {
          const CatIcon = CATEGORY_ICONS[cat]
          return (
            <div key={cat} className="flex flex-col gap-4">
              <div className="flex items-center gap-4 pt-2">
                <div
                  className="h-px flex-1 opacity-70"
                  style={{ backgroundImage: "linear-gradient(90deg, transparent, var(--section-accent))" }}
                  aria-hidden="true"
                />
                <div className="flex items-center gap-2.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-section/25 bg-section/10 text-section shadow-[0_0_24px_-10px_var(--section-accent)]">
                    <CatIcon className="h-5 w-5" />
                  </span>
                  <h2
                    className="text-2xl font-bold tracking-tight text-foreground"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {cat}
                  </h2>
                  <Badge variant="section" className="px-2.5 py-0.5 text-sm font-semibold">
                    {list.length}
                  </Badge>
                </div>
                <div
                  className="h-px flex-1 opacity-70"
                  style={{ backgroundImage: "linear-gradient(270deg, transparent, var(--section-accent))" }}
                  aria-hidden="true"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {list.map((estimate) => (
                  <GameCard key={estimate.game.id} estimate={estimate} />
                ))}
              </div>
            </div>
          )
        })}
    </div>
  )
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] p-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            value === option
              ? "bg-section/20 text-section shadow-[0_0_16px_-6px_var(--section-accent)]"
              : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  )
}