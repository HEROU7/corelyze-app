import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Gamepad2, Zap, ArrowRight } from "lucide-react"
import { FPS_PRESETS, FPS_RESOLUTIONS } from "@/lib/fps-data"
import type { FpsPreset, FpsResolution } from "@/lib/fps-data"
import {
  estimateAll,
  summarizeEstimates,
  type FpsSystemProfile,
  type FpsEstimate,
} from "@/lib/fps-estimator"

const FEATURED_GAME_IDS = [
  "valorant",
  "cs2",
  "fortnite",
  "warzone",
  "cyberpunk",
  "rdr2",
  "wukong",
  "minecraftrtx",
]

function accentFor(tier: FpsEstimate["rating"]["tier"]): string {
  switch (tier) {
    case "extrema":
    case "144hz":
      return "text-orange-400"
    case "alta":
    case "fluida":
      return "text-amber-300"
    case "jugable":
      return "text-yellow-400"
    default:
      return "text-red-400"
  }
}

interface SegmentedProps<T extends string> {
  options: readonly T[]
  value: T
  onChange: (value: T) => void
}

function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] p-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            value === option
              ? "bg-orange-500/20 text-orange-300 shadow-[0_0_16px_-6px_#f97316]"
              : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

export function FpsWidget({
  profile,
  resolution: initialResolution = "1080p",
  preset: initialPreset = "Medio",
  title = "Estimación rápida de FPS",
  compact = false,
}: {
  profile: FpsSystemProfile | null
  resolution?: FpsResolution
  preset?: FpsPreset
  title?: string
  compact?: boolean
}) {
  const [resolution, setResolution] = useState<FpsResolution>(initialResolution)
  const [preset, setPreset] = useState<FpsPreset>(initialPreset)

  const { estimates, summary } = useMemo(() => {
    if (!profile) return { estimates: [] as FpsEstimate[], summary: null }
    const estimates = estimateAll(profile, resolution, preset)
    return { estimates, summary: summarizeEstimates(estimates) }
  }, [profile, resolution, preset])

  const featured = useMemo(() => {
    if (!profile) return []
    const byId = new Map(estimates.map((e) => [e.game.id, e]))
    return FEATURED_GAME_IDS.map((id) => byId.get(id)).filter((e): e is FpsEstimate => Boolean(e))
  }, [estimates, profile])

  if (!profile) {
    return (
      <div className="glass-panel top-hairline rounded-2xl p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="chip-gradient flex h-11 w-11 items-center justify-center rounded-xl border border-orange-500/30 text-orange-400 shadow-[0_0_24px_-8px_#f97316]">
            <Gamepad2 className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              {title}
            </h3>
            <p className="text-xs text-muted-foreground">
              Selecciona componentes o detecta tu PC para proyectar FPS por juego.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/fps">
              <Zap className="h-4 w-4 text-orange-400" />
              Abrir Estimador de FPS
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-panel top-hairline lift overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-start justify-between gap-4 p-6 pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="chip-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange-500/30 text-orange-400 shadow-[0_0_24px_-8px_#f97316]">
            <Gamepad2 className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              {title}
              <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-300">
                {summary ? `${summary.total} títulos` : ""}
              </span>
            </h3>
            <p className="text-xs text-muted-foreground">
              {profile.gpu?.name ?? "Sin GPU"} · {profile.cpu?.name ?? "Sin CPU"} ·{" "}
              {profile.ramGB > 0 ? `${profile.ramGB} GB ${profile.ramType}` : "RAM desconocida"} ·{" "}
              {profile.storageType}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented options={FPS_RESOLUTIONS} value={resolution} onChange={setResolution} />
          <Segmented options={FPS_PRESETS} value={preset} onChange={setPreset} />
        </div>
      </div>

      {summary && (
        <div className="grid gap-px border-y border-white/[0.07] bg-white/[0.05] sm:grid-cols-3">
          <div className="bg-white/[0.02] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Promedio global
            </div>
            <div className="mt-1 text-2xl font-bold text-orange-400 glow-text" style={{ fontFamily: "var(--font-display)" }}>
              {summary.average} FPS
            </div>
            <div className="text-[11px] text-muted-foreground">en {summary.total} juegos ({resolution} · {preset})</div>
          </div>
          <div className="bg-white/[0.02] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Al menos 60 FPS
            </div>
            <div className="mt-1 text-2xl font-bold text-emerald-400" style={{ fontFamily: "var(--font-display)" }}>
              {summary.count60}
            </div>
            <div className="text-[11px] text-muted-foreground">de {summary.total} títulos fluidos</div>
          </div>
          <div className="bg-white/[0.02] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Listos para 144Hz
            </div>
            <div className="mt-1 text-2xl font-bold text-cyan-300" style={{ fontFamily: "var(--font-display)" }}>
              {summary.count144}
            </div>
            <div className="text-[11px] text-muted-foreground">de {summary.total} títulos esports/competitivos</div>
          </div>
        </div>
      )}

      <div className={cn("grid gap-3 p-6", compact ? "grid-cols-2 sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4")}>
        {featured.map((estimate) => {
          const pct = Math.min(100, (estimate.avgFps / 240) * 100)
          return (
            <div
              key={estimate.game.id}
              className="group/row rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5 transition-colors hover:border-orange-500/30"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{estimate.game.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {estimate.game.category} · 1% low {estimate.low1Fps}
                  </div>
                </div>
                <div className={cn("shrink-0 text-lg font-bold", accentFor(estimate.rating.tier))}>
                  {estimate.avgFps}
                  <span className="text-[10px] font-medium text-muted-foreground"> FPS</span>
                </div>
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400"
                  style={{ width: `${pct}%`, boxShadow: "0 0 12px -2px #f97316" }}
                />
              </div>
              <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
                <Badge variant="secondary" className="max-w-full truncate text-[10px]">
                  {estimate.rating.label}
                </Badge>
                {estimate.warningVram && (
                  <Badge variant="destructive" className="shrink-0 text-[10px]">
                    VRAM
                  </Badge>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] bg-white/[0.02] px-6 py-4">
        <p className="text-[11px] text-muted-foreground">
          Proyección estimada según GPU, CPU, RAM y almacenamiento · resultados orientativos.
        </p>
        <Button asChild size="sm" className="group/cta">
          <Link to="/fps" state={{ profile, resolution, preset }}>
            Ver análisis completo
            <ArrowRight className="h-4 w-4 transition-transform group-hover/cta:translate-x-1" />
          </Link>
        </Button>
      </div>
    </div>
  )
}