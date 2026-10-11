import { useEffect, useMemo, useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  BatteryCharging,
  Box,
  CheckCircle2,
  Cpu,
  Fan,
  Gauge,
  HardDrive,
  Laptop,
  Loader2,
  MemoryStick,
  Plug,
  RefreshCw,
  ShieldCheck,
  Video,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatEstimatedPrice } from "@/lib/price"
import { EstimatedPriceNotice } from "@/components/estimated-price-notice"
import { hardwareService } from "@/services/hardware.service"
import {
  estimatePowerBudget,
  psuSupportsComponents,
  type PowerLine,
} from "@/lib/power"
import type { CategorySlug, Component } from "@/services/types"

interface SlotDef {
  slug: CategorySlug
  label: string
  icon: LucideIcon
}

const SLOTS: SlotDef[] = [
  { slug: "cpu", label: "Procesador", icon: Cpu },
  { slug: "gpu", label: "Tarjeta Gráfica", icon: Video },
  { slug: "motherboard", label: "Placa Madre", icon: Laptop },
  { slug: "ram", label: "Memoria RAM", icon: MemoryStick },
  { slug: "storage", label: "Almacenamiento", icon: HardDrive },
  { slug: "case", label: "Gabinete", icon: Box },
  { slug: "cooler", label: "Refrigeración", icon: Fan },
]

const EMPTY_SELECTION = (): Record<string, Component | null> => ({
  cpu: null,
  gpu: null,
  motherboard: null,
  ram: null,
  storage: null,
  case: null,
  cooler: null,
  psu: null,
})

function specNum(component: Component | null | undefined, key: string, fallback = 0): number {
  const value = (component?.especificaciones as Record<string, unknown> | null)?.[key]
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function specStr(component: Component | null | undefined, key: string): string {
  const value = (component?.especificaciones as Record<string, unknown> | null)?.[key]
  return value === null || value === undefined ? "" : String(value)
}

function formatPrice(precio: string | null): string {
  return formatEstimatedPrice(precio)
}

function LoadGauge({ percent, label }: { percent: number; label: string }) {
  const clamped = Math.max(0, Math.min(130, percent))
  const deg = clamped * 3.6
  const color =
    clamped <= 80
      ? "var(--section-accent)"
      : clamped <= 100
        ? "hsl(38 94% 55%)"
        : "hsl(0 78% 55%)"
  return (
    <div className="relative h-44 w-44 shrink-0">
      <div
        className="absolute inset-0 rounded-full transition-[background] duration-500"
        style={{
          background: `conic-gradient(${color} ${deg}deg, rgba(255,255,255,0.08) ${deg}deg 360deg)`,
          boxShadow: "0 0 40px -12px var(--section-accent)",
        }}
      />
      <div className="absolute inset-[16px] flex flex-col items-center justify-center rounded-full border border-white/10 bg-card/85 backdrop-blur">
        <span className="text-3xl font-bold tabular-nums">{Math.round(clamped)}%</span>
        <span className="px-3 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
    </div>
  )
}

export default function PsuCalculatorPage() {
  const [catalog, setCatalog] = useState<Record<string, Component[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [selected, setSelected] = useState<Record<string, Component | null>>(EMPTY_SELECTION)
  const [extraFans, setExtraFans] = useState(0)
  const [extraHdds, setExtraHdds] = useState(0)

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
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "No se pudo cargar el catálogo")
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reload])

  const retry = () => {
    setLoading(true)
    setError(null)
    setReload((r) => r + 1)
  }

  const extraLines = useMemo<PowerLine[]>(() => {
    const lines: PowerLine[] = []
    if (extraFans > 0) {
      lines.push({ slot: "Ventiladores", name: `${extraFans} ventilador(es) adicional(es)`, watts: extraFans * 2 })
    }
    if (extraHdds > 0) {
      lines.push({ slot: "Discos", name: `${extraHdds} disco(s) adicional(es)`, watts: extraHdds * 9 })
    }
    return lines
  }, [extraFans, extraHdds])

  const components = useMemo(
    () => Object.values(selected).filter((c): c is Component => Boolean(c)),
    [selected],
  )

  const budget = useMemo(
    () => estimatePowerBudget(components, extraLines),
    [components, extraLines],
  )

  const chosenPsu = selected.psu
  const chosenPsuWatts = specNum(chosenPsu, "watts", 0)
  const psuLoadPercent =
    chosenPsuWatts > 0 ? (budget.estimatedWatts / chosenPsuWatts) * 100 : (budget.estimatedWatts / Math.max(1, budget.recommendedWatts)) * 100
  const psuCovered = chosenPsu ? chosenPsuWatts >= budget.recommendedWatts : false

  const psuOptions = useMemo(
    () =>
      (catalog.psu ?? [])
        .slice()
        .sort((a, b) => specNum(a, "watts") - specNum(b, "watts")),
    [catalog.psu],
  )

  const compatibleOptions = useMemo(
    () => psuOptions.filter((psu) => psuSupportsComponents(psu, components)),
    [psuOptions, components],
  )

  const setSlot = (slug: CategorySlug | "psu", componentId: string) => {
    const component = (catalog[slug] ?? []).find((c) => c.id === componentId) ?? null
    setSelected((prev) => ({ ...prev, [slug]: component }))
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <BatteryCharging className="h-6 w-6 text-primary" />
            Calculadora de Fuente (PSU)
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Selecciona los componentes de tu ensamble para estimar el consumo real y obtener la fuente
            recomendada con margen de seguridad.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={retry} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          Recargar catálogo
        </Button>
      </div>

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Cargando catálogo de componentes…
          </CardContent>
        </Card>
      )}

      {!loading && error && (
        <Card className="border-destructive/50">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <XCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button size="sm" onClick={retry}>
              Reintentar
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Cpu className="h-4 w-4 text-primary" />
                  Componentes del sistema
                </CardTitle>
                <CardDescription>Elige las piezas para calcular su consumo.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {SLOTS.map((slot) => {
                  const Icon = slot.icon
                  const options = catalog[slot.slug] ?? []
                  const current = selected[slot.slug]
                  return (
                    <label key={slot.slug} className="space-y-1.5">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" />
                        {slot.label}
                      </span>
                      <select
                        value={current?.id ?? ""}
                        onChange={(e) => setSlot(slot.slug, e.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-background/60 px-3 text-sm outline-none transition-colors focus:border-primary"
                      >
                        <option value="">— Sin seleccionar —</option>
                        {options.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre} · {specNum(c, "tdp") ? `${specNum(c, "tdp")}W` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  )
                })}

                <label className="space-y-1.5">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Fan className="h-3.5 w-3.5" />
                    Ventiladores adicionales
                  </span>
                  <select
                    value={extraFans}
                    onChange={(e) => setExtraFans(Number(e.target.value))}
                    className="h-10 w-full rounded-md border border-input bg-background/60 px-3 text-sm outline-none transition-colors focus:border-primary"
                  >
                    {Array.from({ length: 9 }, (_, i) => (
                      <option key={i} value={i}>
                        {i} · {i * 2}W
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <HardDrive className="h-3.5 w-3.5" />
                    Discos adicionales
                  </span>
                  <select
                    value={extraHdds}
                    onChange={(e) => setExtraHdds(Number(e.target.value))}
                    className="h-10 w-full rounded-md border border-input bg-background/60 px-3 text-sm outline-none transition-colors focus:border-primary"
                  >
                    {Array.from({ length: 7 }, (_, i) => (
                      <option key={i} value={i}>
                        {i} · {i * 9}W
                      </option>
                    ))}
                  </select>
                </label>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Plug className="h-4 w-4 text-primary" />
                  Fuente actual (opcional)
                </CardTitle>
                <CardDescription>Compara tu fuente actual contra el consumo estimado.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <select
                  value={chosenPsu?.id ?? ""}
                  onChange={(e) => setSlot("psu", e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background/60 px-3 text-sm outline-none transition-colors focus:border-primary"
                >
                  <option value="">— Sin fuente seleccionada —</option>
                  {psuOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} · {specNum(c, "watts")}W {specStr(c, "certificacion")}
                    </option>
                  ))}
                </select>

                {chosenPsu && (
                  <div
                    className={cn(
                      "flex items-start gap-2 rounded-lg border p-3 text-sm",
                      psuCovered
                        ? "border-section/40 bg-section/10 text-section"
                        : "border-destructive/50 bg-destructive/10 text-destructive",
                    )}
                  >
                    {psuCovered ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <div>
                      <p className="font-medium">
                        {psuCovered
                          ? "La fuente cubre el consumo recomendado"
                          : "La fuente es insuficiente para este ensamble"}
                      </p>
                      <p className="text-xs opacity-90">
                        {chosenPsuWatts}W seleccionados · {budget.recommendedWatts}W recomendados ·
                        carga estimada {Math.round((budget.estimatedWatts / Math.max(1, chosenPsuWatts)) * 100)}%
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-section/30">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Gauge className="h-4 w-4 text-primary" />
                  Resultado del cálculo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex flex-wrap items-center gap-6">
                  <LoadGauge
                    percent={psuLoadPercent}
                    label={chosenPsu ? "Carga sobre tu fuente" : "Carga sobre PSU recomendada"}
                  />
                  <div className="grid flex-1 grid-cols-2 gap-3">
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-xs text-muted-foreground">Consumo estimado</div>
                      <div className="mt-1 text-2xl font-bold text-primary">
                        {budget.estimatedWatts} W
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-xs text-muted-foreground">Fuente recomendada</div>
                      <div className="mt-1 text-2xl font-bold">{budget.recommendedWatts} W</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-xs text-muted-foreground">Margen de seguridad</div>
                      <div className="mt-1 text-2xl font-bold">{budget.headroomWatts} W</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-xs text-muted-foreground">Carga objetivo</div>
                      <div className="mt-1 text-2xl font-bold">~{budget.loadPercent}%</div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant="section" className="gap-1">
                    <Zap className="h-3 w-3" />
                    {budget.tier}
                  </Badge>
                  {components.length > 0 && (
                    <Badge variant="secondary">
                      {components.length} componente(s) seleccionado(s)
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="h-4 w-4 text-primary" />
                  Desglose de consumo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {budget.lines.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Selecciona componentes para ver el desglose por pieza.
                  </p>
                )}
                {budget.lines.map((line) => (
                  <div key={`${line.slot}-${line.name}-${line.watts}`} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-muted-foreground" title={line.name}>
                        {line.name}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">{line.watts} W</span>
                    </div>
                    <Progress
                      value={
                        budget.estimatedWatts > 0
                          ? (line.watts / budget.estimatedWatts) * 100
                          : 0
                      }
                    />
                  </div>
                ))}
                {budget.notes.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-white/10 pt-3">
                    {budget.notes.map((note, i) => (
                      <li key={i} className="text-xs text-muted-foreground">
                        {note}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Fuentes compatibles del catálogo
                </CardTitle>
                <CardDescription>
                  {components.length === 0
                    ? "Añade componentes para filtrar fuentes adecuadas."
                    : `${compatibleOptions.length} fuente(s) cumplen con ${budget.recommendedWatts}W o más.`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {compatibleOptions.length === 0 && components.length > 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No hay fuentes en el catálogo que alcancen el consumo estimado.
                  </p>
                )}
                {compatibleOptions.slice(0, 8).map((psu) => {
                  const watts = specNum(psu, "watts")
                  const cert = specStr(psu, "certificacion")
                  const modular = specStr(psu, "modular")
                  return (
                    <div
                      key={psu.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium" title={psu.nombre}>
                            {psu.nombre}
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-semibold text-primary">{watts}W</span>
                          {cert && <Badge variant="section">{cert}</Badge>}
                          {modular && <span>{modular}</span>}
                          <span>{formatPrice(psu.precio)}</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={chosenPsu?.id === psu.id ? "default" : "outline"}
                        onClick={() => setSlot("psu", psu.id)}
                      >
                        {chosenPsu?.id === psu.id ? "Seleccionada" : "Usar esta"}
                      </Button>
                    </div>
                  )
                })}

                <EstimatedPriceNotice className="pt-2" />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
