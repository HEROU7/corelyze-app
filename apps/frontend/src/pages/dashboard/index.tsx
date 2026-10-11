import { useEffect, useState } from "react"
import { CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CorelyzeMark } from "@/components/brand/corelyze-logo"
import { cn } from "@/lib/utils"
import {
  Cpu,
  Wrench,
  Sparkles,
  Search,
  ArrowRight,
  Activity,
  Zap,
  ShieldCheck,
  BarChart3,
  Layers,
  Gauge,
  Loader2,
  RotateCcw,
} from "lucide-react"
import { Link } from "react-router-dom"
import { hardwareService } from "@/services/hardware.service"

interface LiveStats {
  componentes: number
  categorias: number
  marcas: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<LiveStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      hardwareService.getComponents(),
      hardwareService.getCategories(),
      hardwareService.getMarcas(),
    ])
      .then(([componentes, categorias, marcas]) => {
        if (cancelled) return
        setStats({ componentes: componentes.length, categorias: categorias.length, marcas: marcas.length })
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "No se pudo conectar con la API")
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

  const statsCards = [
    {
      title: "Componentes en Catálogo",
      value: loading ? "…" : error ? "—" : (stats?.componentes ?? 0).toLocaleString("es-US"),
      icon: <Layers className="h-5 w-5" />,
      description: loading
        ? "Consultando el catálogo…"
        : error
          ? "API no disponible"
          : `${stats!.categorias} categorías · ${stats!.marcas} marcas`,
    },
    {
      title: "Builds Recomendados",
      value: "50+",
      icon: <Sparkles className="h-5 w-5" />,
      description: "Optimizadas por uso y presupuesto",
    },
    {
      title: "Compatibilidad Activa",
      value: "Tiempo Real",
      icon: <ShieldCheck className="h-5 w-5" />,
      description: "Validación física, eléctrica y lógica",
    },
    {
      title: "Análisis de Bottlenecks",
      value: "Multi-Res",
      icon: <BarChart3 className="h-5 w-5" />,
      description: "1080p, 1440p y 4K",
    },
  ]

  const modules = [
    {
      title: "Simulador de Ensamble",
      description: "Construye configuraciones desde cero con validación de compatibilidad en tiempo real.",
      icon: <Wrench className="h-6 w-6" />,
      href: "/simulator",
      features: ["Socket/Chipset", "RAM DDR4/DDR5", "Balance energético", "Cuellos de botella"],
    },
    {
      title: "Builds Recomendadas",
      description: "Configuraciones pre-optimizadas con análisis de rendimiento y relación calidad/precio.",
      icon: <Sparkles className="h-6 w-6" />,
      href: "/builds",
      features: ["Por presupuesto", "Por propósito", "Pros/Contras", "Puntuación C/P"],
    },
    {
      title: "Escaneo Local",
      description: "Detecta automáticamente el hardware de tu PC usando el agente Tauri.",
      icon: <Search className="h-6 w-6" />,
      href: "/scanner",
      features: ["Inventario completo", "Diagnóstico", "Reporte detallado", "Integración con agente"],
    },
  ]

  const apiState = error ? "error" : loading ? "loading" : "ok"

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="glass-panel glass-panel-accent top-hairline lift rounded-2xl p-6">
        <div className="flex flex-wrap items-center gap-5">
          <CorelyzeMark
            size={52}
            className="drop-shadow-[0_0_18px_color-mix(in_srgb,var(--section-accent)_55%,transparent)]"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1
                className="bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl"
                style={{
                  backgroundImage: "linear-gradient(90deg, var(--section-accent), var(--section-accent-2))",
                }}
              >
                Corelyze
              </h1>
              <Badge variant="section">v1.0</Badge>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Diagnóstico, simulación, compatibilidad y recomendación de hardware de PC.
            </p>
          </div>

          <div className="ml-auto hidden items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 backdrop-blur-xl lg:flex">
            {apiState === "loading" && <Loader2 className="h-4 w-4 animate-spin text-yellow-300" />}
            {apiState === "ok" && <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>}
            {apiState === "error" && <span className="h-2 w-2 rounded-full bg-destructive" aria-hidden="true" />}
            <div className="text-left">
              <div className="text-[9px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
                Catálogo
              </div>
              <div
                className={cn(
                  "text-xs font-semibold",
                  apiState === "ok"
                    ? "text-emerald-300"
                    : apiState === "loading"
                      ? "text-yellow-300"
                      : "text-destructive",
                )}
              >
                {apiState === "ok" ? "Sincronizado" : apiState === "loading" ? "Consultando…" : "Sin conexión"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">
            No se pudo conectar con la API en http://localhost:3000/api: {error}
          </p>
          <Button size="sm" variant="outline" onClick={retry}>
            <RotateCcw className="h-4 w-4" />
            Reintentar
          </Button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat, index) => (
          <div
            key={index}
            className="glass-panel top-hairline lift group rounded-2xl p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {stat.title}
              </span>
              <span
                className="chip-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-section/20 text-section shadow-[0_0_24px_-10px_var(--section-accent)] transition-transform duration-300 group-hover:scale-110"
              >
                {index === 0 && loading ? <Loader2 className="h-5 w-5 animate-spin" /> : stat.icon}
              </span>
            </div>
            <div
              className="mt-4 text-3xl font-bold tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {stat.value}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{stat.description}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div
          className="h-px flex-1 opacity-60"
          style={{ backgroundImage: "linear-gradient(90deg, var(--section-accent), transparent)" }}
          aria-hidden="true"
        />
        <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Módulos principales
        </span>
        <div
          className="h-px flex-1 opacity-60"
          style={{ backgroundImage: "linear-gradient(270deg, var(--section-accent), transparent)" }}
          aria-hidden="true"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {modules.map((module, index) => (
          <div
            key={index}
            className="glass-panel glass-panel-accent top-hairline lift group flex flex-col rounded-2xl p-6"
          >
            <div className="flex items-center gap-3">
              <span className="chip-gradient flex h-11 w-11 items-center justify-center rounded-xl border border-section/20 text-section shadow-[0_0_26px_-10px_var(--section-accent)] transition-transform duration-300 group-hover:scale-110">
                {module.icon}
              </span>
              <div className="min-w-0">
                <h3
                  className="truncate text-lg font-semibold tracking-tight"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {module.title}
                </h3>
              </div>
            </div>

            <p className="mt-4 flex-1 text-sm leading-relaxed text-muted-foreground">
              {module.description}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {module.features.map((feature, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {feature}
                </Badge>
              ))}
            </div>

            <Button asChild className="mt-6 w-full group/cta">
              <Link to={module.href}>
                Acceder al módulo
                <ArrowRight className="h-4 w-4 transition-transform group-hover/cta:translate-x-1" />
              </Link>
            </Button>
          </div>
        ))}
      </div>

      <div className="glass-panel top-hairline rounded-2xl">
        <CardContent className="flex flex-col gap-6 p-6">
          <div className="flex items-center gap-3">
            <Cpu className="h-5 w-5 text-section glow-text" />
            <h2 className="text-lg font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              Corelyze — Análisis Profesional de Hardware
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Solución integral para diagnóstico, simulación, gestión de compatibilidad y recomendación de hardware de PC.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="glass-sheen flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                <Activity className="h-5 w-5" />
              </span>
              <div>
                <div className="text-sm font-medium">Motor de Reglas</div>
                <div className="text-xs text-muted-foreground">Validación configurable</div>
              </div>
            </div>
            <div className="glass-sheen flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-yellow-500/15 text-yellow-400">
                <Zap className="h-5 w-5" />
              </span>
              <div>
                <div className="text-sm font-medium">Cálculo en Tiempo Real</div>
                <div className="text-xs text-muted-foreground">Sin demoras</div>
              </div>
            </div>
            <div className="glass-sheen flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400">
                <Gauge className="h-5 w-5" />
              </span>
              <div>
                <div className="text-sm font-medium">Escaneo Nativo</div>
                <div className="text-xs text-muted-foreground">Agente Tauri + Rust</div>
              </div>
            </div>
          </div>
        </CardContent>
      </div>
    </div>
  )
}