import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Loader2,
  Sparkles,
  DollarSign,
  TrendingUp,
  CheckCircle,
  ShieldCheck,
  RotateCcw,
  PackageOpen,
  Layers,
  Search,
  SlidersHorizontal,
  Cpu,
  Video,
  MonitorPlay,
  ArrowRight,
  X,
} from "lucide-react"
import { hardwareService } from "@/services/hardware.service"
import { formatEstimatedPrice } from "@/lib/price"
import { EstimatedPriceNotice } from "@/components/estimated-price-notice"
import type { Build } from "@/services/types"

const CATEGORY_LABEL: Record<string, string> = {
  ENTRY: "Entry",
  MID_RANGE: "Mid-Range",
  HIGH_END: "High-End",
  ULTRA: "Ultra",
  CUSTOM: "Custom",
}

const PRICE_RANGES = [
  { key: "all", label: "Todos los precios", min: 0, max: Number.POSITIVE_INFINITY },
  { key: "lt600", label: "Menos de $600", min: 0, max: 600 },
  { key: "600-1000", label: "$600 – $1,000", min: 600, max: 1000 },
  { key: "1000-1500", label: "$1,000 – $1,500", min: 1000, max: 1500 },
  { key: "1500-2000", label: "$1,500 – $2,000", min: 1500, max: 2000 },
  { key: "gt2000", label: "$2,000 o más", min: 2000, max: Number.POSITIVE_INFINITY },
]

const RESOLUTIONS = ["1080p", "1440p", "4K"]

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-primary disabled:opacity-50"

function formatPrice(value: string | null): string {
  return formatEstimatedPrice(value)
}

function componentName(build: Build, slug: string): string {
  const ec = build.componentes.find((e) => e.componente.categoria.slug === slug)
  return ec?.componente.nombre ?? ""
}

function resolutionOf(build: Build): string {
  const r = build.especificaciones?.resolucion
  return typeof r === "string" ? r : ""
}

export default function BuildsPage() {
  const navigate = useNavigate()
  const [builds, setBuilds] = useState<Build[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  const [search, setSearch] = useState("")
  const [cpu, setCpu] = useState("all")
  const [gpu, setGpu] = useState("all")
  const [priceKey, setPriceKey] = useState("all")
  const [resolution, setResolution] = useState("all")

  useEffect(() => {
    let cancelled = false
    hardwareService
      .getBuilds({ limit: 50 })
      .then((data) => {
        if (cancelled) return
        setBuilds(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "No se pudieron cargar los builds")
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

  const processors = useMemo(() => {
    if (!builds) return []
    return [...new Set(builds.map((b) => componentName(b, "cpu")).filter(Boolean))].sort()
  }, [builds])

  const graphics = useMemo(() => {
    if (!builds) return []
    return [...new Set(builds.map((b) => componentName(b, "gpu")).filter(Boolean))].sort()
  }, [builds])

  const resolutions = useMemo(() => {
    if (!builds) return RESOLUTIONS
    const found = [...new Set(builds.map(resolutionOf).filter(Boolean))]
    return found.length > 0 ? found : RESOLUTIONS
  }, [builds])

  const filtered = useMemo(() => {
    if (!builds) return []
    const q = search.trim().toLowerCase()
    const range = PRICE_RANGES.find((r) => r.key === priceKey) ?? PRICE_RANGES[0]
    return builds.filter((b) => {
      if (q) {
        const haystack = [
          b.nombre,
          b.descripcion ?? "",
          b.componentes.map((e) => e.componente.nombre).join(" "),
        ]
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      if (cpu !== "all" && componentName(b, "cpu") !== cpu) return false
      if (gpu !== "all" && componentName(b, "gpu") !== gpu) return false
      if (resolution !== "all" && resolutionOf(b) !== resolution) return false
      const price = b.precioTotal ? Number.parseFloat(b.precioTotal) : 0
      if (price < range.min || price > range.max) return false
      return true
    })
  }, [builds, search, cpu, gpu, resolution, priceKey])

  const filtersActive =
    search.trim() !== "" || cpu !== "all" || gpu !== "all" || priceKey !== "all" || resolution !== "all"

  const resetFilters = () => {
    setSearch("")
    setCpu("all")
    setGpu("all")
    setPriceKey("all")
    setResolution("all")
  }

  const loadInSimulator = (build: Build) => {
    navigate("/simulator", {
      state: {
        buildName: build.nombre,
        componentIds: build.componentes.map((ec) => ec.componenteId),
      },
    })
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Sparkles className="h-7 w-7 text-primary glow-text" />
          Builds Recomendadas
        </h1>
        <p className="text-muted-foreground">
          Configuraciones pre-optimizadas con análisis de rendimiento y relación calidad/precio.
        </p>
        <EstimatedPriceNotice className="pt-1" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, descripción o componente…"
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Cpu className="h-3.5 w-3.5" /> Procesador
              </span>
              <select value={cpu} onChange={(e) => setCpu(e.target.value)} className={selectClass}>
                <option value="all">Todos</option>
                {processors.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Video className="h-3.5 w-3.5" /> Tarjeta Gráfica
              </span>
              <select value={gpu} onChange={(e) => setGpu(e.target.value)} className={selectClass}>
                <option value="all">Todas</option>
                {graphics.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <DollarSign className="h-3.5 w-3.5" /> Presupuesto
              </span>
              <select value={priceKey} onChange={(e) => setPriceKey(e.target.value)} className={selectClass}>
                {PRICE_RANGES.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MonitorPlay className="h-3.5 w-3.5" /> Resolución
              </span>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                className={selectClass}
              >
                <option value="all">Todas</option>
                {resolutions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {filtersActive && (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                {filtered.length} de {builds?.length ?? 0} builds coinciden
              </span>
              <Button size="sm" variant="ghost" onClick={resetFilters}>
                <X className="h-4 w-4" />
                Limpiar filtros
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando builds desde el motor local de Corelyze…
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">No se pudieron cargar los builds: {error}</p>
          <Button size="sm" variant="outline" onClick={retry}>
            <RotateCcw className="h-4 w-4" />
            Reintentar
          </Button>
        </div>
      )}

      {!loading && !error && builds !== null && builds.length === 0 && (
        <Card className="border-dashed border-2 border-border/60 bg-muted/20">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <PackageOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Sin builds publicados todavía</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              La API responde correctamente (0 builds en PostgreSQL). Cuando existan builds
              pre-configurados en el sistema, aparecerán aquí con sus componentes, precio y puntuación.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && builds !== null && builds.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Layers className="h-4 w-4" />
            {filtered.length} {filtered.length === 1 ? "build" : "builds"} mostrados
          </div>

          {filtered.length === 0 ? (
            <Card className="border-dashed border-2 border-border/60 bg-muted/20">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Sin resultados</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Ningún build coincide con los filtros seleccionados.
                </p>
                <Button size="sm" variant="outline" className="mt-4" onClick={resetFilters}>
                  <X className="h-4 w-4" />
                  Limpiar filtros
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {filtered.map((build) => (
                <Card key={build.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-lg">{build.nombre}</CardTitle>
                      <Badge variant="secondary">{CATEGORY_LABEL[build.categoria] ?? build.categoria}</Badge>
                    </div>
                    <CardDescription>{build.descripcion}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {build.casoUso.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {build.casoUso.map((uso) => (
                          <Badge key={uso} variant="info" className="text-[10px]">
                            {uso}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <TrendingUp className="h-3.5 w-3.5" /> Puntuación
                          <span className="font-semibold text-foreground">
                            {build.puntuacionGlobal ? Number.parseFloat(build.puntuacionGlobal).toFixed(2) : "—"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Layers className="h-3.5 w-3.5" /> {build.componentes.length} componentes
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Precio estimado de mercado
                        </div>
                        <div className="text-lg font-bold">{formatPrice(build.precioTotal)}</div>
                      </div>
                    </div>
                    {build.puntuacionGlobal && (
                      <Progress value={Number.parseFloat(build.puntuacionGlobal) * 100} />
                    )}
                    <div className="grid gap-2 md:grid-cols-2">
                      {build.pros.length > 0 && (
                        <div>
                          <div className="text-xs font-medium text-emerald-400 mb-1">Pros</div>
                          <ul className="space-y-1">
                            {build.pros.map((p, i) => (
                              <li key={i} className="flex gap-1.5 text-xs text-muted-foreground">
                                <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                                {p}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {build.contras.length > 0 && (
                        <div>
                          <div className="text-xs font-medium text-destructive mb-1">Contras</div>
                          <ul className="space-y-1">
                            {build.contras.map((c, i) => (
                              <li key={i} className="flex gap-1.5 text-xs text-muted-foreground">
                                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                                {c}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 border-t pt-3">
                      {build.componentes.map((ec) => (
                        <Badge key={ec.id} variant="outline" className="text-[10px]">
                          {ec.componente.categoria.nombre}: {ec.componente.nombre}
                        </Badge>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => loadInSimulator(build)}
                    >
                      Cargar en el Simulador
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Motor de Curación
          </CardTitle>
          <CardDescription>Características de los builds recomendados</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="h-4 w-4 text-emerald-400" />
            <span>Pros/Contras detallados</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <DollarSign className="h-4 w-4 text-yellow-400" />
            <span>Puntuación Calidad/Precio</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4 text-blue-400" />
            <span>Análisis de rendimiento</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span>Verificados y probados</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
