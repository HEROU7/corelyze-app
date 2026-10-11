import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation } from "react-router-dom"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Loader2,
  Search,
  ArrowRight,
  X,
  Check,
  RotateCcw,
  Cpu,
  Laptop,
  MemoryStick,
  HardDrive,
  Fan,
  Plug,
  Box,
  Video,
  Wrench,
  ShieldCheck,
  Zap,
  BarChart3,
  Power,
  Layers,
  Wallet,
  Save,
  FileDown,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatEstimatedPrice } from "@/lib/price"
import { EstimatedPriceNotice } from "@/components/estimated-price-notice"
import { hardwareService } from "@/services/hardware.service"
import { estimatePowerBudget } from "@/lib/power"
import { printReport, type ReportData } from "@/lib/report"
import { PowerPanel } from "@/components/power-panel"
import { FpsWidget } from "@/components/fps/fps-widget"
import { profileFromComponents } from "@/lib/fps-estimator"
import type {
  BottleneckAnalysis,
  BottleneckScore,
  CategorySlug,
  Component,
  CompatibilityIssue,
  CompatibilityResult,
  Severity,
} from "@/services/types"

interface SlotDef {
  slug: CategorySlug
  label: string
  icon: LucideIcon
}

const SLOTS: SlotDef[] = [
  { slug: "cpu", label: "Procesador", icon: Cpu },
  { slug: "motherboard", label: "Placa Madre", icon: Laptop },
  { slug: "ram", label: "Memoria RAM", icon: MemoryStick },
  { slug: "gpu", label: "Tarjeta Gráfica", icon: Video },
  { slug: "storage", label: "Almacenamiento", icon: HardDrive },
  { slug: "psu", label: "Fuente de Poder", icon: Plug },
  { slug: "case", label: "Gabinete", icon: Box },
  { slug: "cooler", label: "Cooler", icon: Fan },
]

const SLOT_ICONS: Record<string, LucideIcon> = Object.fromEntries(
  SLOTS.map((s) => [s.slug, s.icon]),
)

const EMPTY_SELECTION = (): Record<string, Component | null> => ({
  cpu: null,
  motherboard: null,
  ram: null,
  gpu: null,
  storage: null,
  psu: null,
  case: null,
  cooler: null,
})

function strAt(es: Record<string, unknown> | null, key: string): string {
  const v = es?.[key]
  if (v === null || v === undefined) return ""
  return String(v)
}

function formatSpecs(c: Component): string[] {
  const es = c.especificaciones
  switch (c.categoria.slug) {
    case "cpu":
      return [
        strAt(es, "socket"),
        strAt(es, "ramType"),
        `${strAt(es, "nucleos")} núcleos / ${strAt(es, "hilos")} hilos`,
        `${strAt(es, "frecuenciaBase")}–${strAt(es, "frecuenciaTurbo")} GHz`,
        `${strAt(es, "tdp")}W TDP`,
      ]
    case "motherboard":
      return [
        strAt(es, "socket"),
        strAt(es, "tipoRam"),
        strAt(es, "factorForma"),
        strAt(es, "chipset"),
        `${strAt(es, "slotsRam")} slots RAM`,
      ]
    case "ram":
      return [
        strAt(es, "tipo"),
        `${strAt(es, "capacidad")}GB (${strAt(es, "modulos")}x)`,
        `${strAt(es, "frecuencia")}MHz`,
        strAt(es, "latencia"),
      ]
    case "gpu":
      return [
        `${strAt(es, "vram")}GB VRAM`,
        `${strAt(es, "tdp")}W TDP`,
        `${strAt(es, "longitud")}mm`,
        strAt(es, "bus"),
      ]
    case "storage":
      return [strAt(es, "tipo"), `${strAt(es, "capacidad")}GB`, strAt(es, "interfaz")]
    case "psu":
      return [`${strAt(es, "watts")}W`, strAt(es, "certificacion"), strAt(es, "modular")]
    case "case":
      return [
        strAt(es, "factorForma"),
        `GPU ≤ ${strAt(es, "maxGpuLength")}mm`,
        `Cooler ≤ ${strAt(es, "maxCoolerHeight")}mm`,
        `${strAt(es, "slots")} slots`,
      ]
    case "cooler":
      return [strAt(es, "tipo"), `${strAt(es, "tdp")}W`, `${strAt(es, "altura")}mm`, `${strAt(es, "ruido")}dBA`]
    default:
      return []
  }
}

function formatPrice(precio: string | null): string {
  return formatEstimatedPrice(precio)
}

function severityClass(severity: Severity): string {
  switch (severity) {
    case "CRITICAL":
      return "border-destructive/60 bg-destructive/15 text-destructive"
    case "HIGH":
      return "border-red-500/50 bg-red-500/10 text-red-400"
    case "MEDIUM":
      return "border-yellow-500/50 bg-yellow-500/10 text-yellow-400"
    case "LOW":
      return "border-blue-500/50 bg-blue-500/10 text-blue-400"
  }
}

function impactVariant(impact: BottleneckScore["impact"]): "info" | "warning" | "destructive" {
  switch (impact) {
    case "LOW":
      return "info"
    case "MEDIUM":
      return "warning"
    default:
      return "destructive"
  }
}

function bottleneckLabel(kind: string): string {
  switch (kind) {
    case "CPU":
      return "Limitado por CPU"
    case "GPU":
      return "Limitado por GPU"
    case "RAM":
      return "Limitado por RAM"
    case "STORAGE":
      return "Limitado por almacenamiento"
    case "NONE":
      return "Sin cuello de botella"
    default:
      return "Balanceado"
  }
}

function IssueBlock({ issue, kind }: { issue: CompatibilityIssue; kind: "issue" | "warning" }) {
  const label = kind === "issue" ? issue.type : `ADVERTENCIA · ${issue.type}`
  return (
    <div className={cn("rounded-lg border p-3 text-sm", severityClass(issue.severity))}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        <Badge variant={kind === "issue" ? "destructive" : "warning"} className="text-[10px]">
          {issue.severity}
        </Badge>
      </div>
      <p className="mt-1 text-xs opacity-90">{issue.description}</p>
      {issue.suggestion && (
        <p className="mt-1 text-xs opacity-75">💡 {issue.suggestion}</p>
      )}
    </div>
  )
}

export default function SimulatorPage() {
  const location = useLocation()
  const navState = location.state as { buildName?: string; componentIds?: string[] } | null
  const pendingIds = useRef<string[] | null>(navState?.componentIds ?? null)

  const [catalog, setCatalog] = useState<Record<string, Component[]>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  const [selected, setSelected] = useState<Record<string, Component | null>>(EMPTY_SELECTION)
  const [pickerCategory, setPickerCategory] = useState<CategorySlug | null>(null)
  const [search, setSearch] = useState("")
  const [fromBuildName, setFromBuildName] = useState<string | null>(null)

  const [validationError, setValidationError] = useState<string | null>(null)
  const [compat, setCompat] = useState<CompatibilityResult | null>(null)
  const [validatedKey, setValidatedKey] = useState("")
  const [bottleneck, setBottleneck] = useState<BottleneckAnalysis | null>(null)
  const [resolvedBottleneckKey, setResolvedBottleneckKey] = useState("")

  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState("")
  const [saveDesc, setSaveDesc] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [showPower, setShowPower] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      hardwareService.getComponents(),
      hardwareService.getCategories(),
    ])
      .then(([components]) => {
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
        setLoadError(err instanceof Error ? err.message : "No se pudo cargar el catálogo")
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reload])

  const retry = () => {
    setLoading(true)
    setLoadError(null)
    setReload((r) => r + 1)
  }

  useEffect(() => {
    if (!pendingIds.current || Object.keys(catalog).length === 0) return
    const ids = pendingIds.current
    pendingIds.current = null
    const next = EMPTY_SELECTION()
    for (const list of Object.values(catalog)) {
      for (const c of list) {
        if (ids.includes(c.id)) next[c.categoria.slug] = c
      }
    }
    setSelected(next)
    if (navState?.buildName) setFromBuildName(navState.buildName)
  }, [catalog, navState])

  const openSave = () => {
    setSaveName(fromBuildName ?? "Mi Ensamble")
    setSaveDesc("")
    setSaveError(null)
    setSaveOpen(true)
  }

  const saveBuild = async () => {
    if (!saveName.trim()) {
      setSaveError("Ingresa un nombre para el ensamble.")
      return
    }
    if (selectedIds.length === 0) {
      setSaveError("Selecciona al menos un componente antes de guardar.")
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const build = await hardwareService.createBuild({
        nombre: saveName.trim(),
        descripcion: saveDesc.trim() || undefined,
        componentIds: selectedIds,
      })
      setSaveSuccess(`Ensamble "${build.nombre}" guardado correctamente.`)
      setSaveOpen(false)
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "No se pudo guardar el ensamble")
    } finally {
      setSaving(false)
    }
  }

  const selectedIds = useMemo(() => {
    return Object.values(selected)
      .filter((c): c is Component => Boolean(c))
      .map((c) => c.id)
  }, [selected])

  const selectedKey = useMemo(() => selectedIds.slice().sort().join("|"), [selectedIds])

  const totalPrice = useMemo(() => {
    return Object.values(selected)
      .filter((c): c is Component => Boolean(c))
      .reduce((acc, c) => acc + (Number.parseFloat(c.precio ?? "0") || 0), 0)
  }, [selected])

  const selectedList = useMemo(
    () => Object.values(selected).filter((c): c is Component => Boolean(c)),
    [selected],
  )

  const fpsProfile = useMemo(
    () => (selected.gpu || selected.cpu ? profileFromComponents(selectedList) : null),
    [selected.gpu, selected.cpu, selectedList],
  )

  useEffect(() => {
    if (selectedIds.length < 2) return
    let cancelled = false
    hardwareService
      .validateCompatibility(selectedIds)
      .then((res) => {
        if (!cancelled) {
          setCompat(res)
          setValidatedKey(selectedKey)
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setCompat(null)
        setValidatedKey(selectedKey)
        setValidationError(err instanceof Error ? err.message : "Error al validar compatibilidad")
      })
    return () => {
      cancelled = true
    }
  }, [selectedKey, selectedIds])

  const validating = selectedIds.length >= 2 && validatedKey !== selectedKey
  const effectiveValidationError = selectedIds.length >= 2 ? validationError : null
  const effectiveCompat = selectedIds.length >= 2 ? compat : null

  const cpu = selected.cpu
  const gpu = selected.gpu
  const ram = selected.ram

  const bottleneckKey = useMemo(() => {
    if (!cpu || !gpu) return ""
    return [cpu.id, gpu.id, ram?.id ?? ""].join("|")
  }, [cpu, gpu, ram])

  useEffect(() => {
    if (!bottleneckKey) return
    if (!cpu || !gpu) return
    let cancelled = false
    hardwareService
      .analyzeBottlenecks({
        cpuId: cpu.id,
        gpuId: gpu.id,
        ramIds: ram ? [ram.id] : [],
        resolution: "1080p",
      })
      .then((res) => {
        if (!cancelled) {
          setBottleneck(res)
          setResolvedBottleneckKey(bottleneckKey)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBottleneck(null)
          setResolvedBottleneckKey(bottleneckKey)
        }
      })
    return () => {
      cancelled = true
    }
  }, [bottleneckKey, cpu, gpu, ram])

  const effectiveBottleneck =
    bottleneckKey !== "" && resolvedBottleneckKey === bottleneckKey ? bottleneck : null

  const exportPdf = () => {
    if (selectedList.length === 0) return
    const budget = estimatePowerBudget(selectedList)
    const data: ReportData = {
      title: "Reporte de Ensamble - Simulador",
      subtitle: `${selectedList.length} componentes seleccionados`,
      meta: [
        { label: "Fecha de emisión", value: new Date().toLocaleString("es-US") },
        { label: "Total estimado", value: formatPrice(totalPrice.toFixed(2)) },
        { label: "Consumo estimado", value: `${budget.estimatedWatts} W` },
        { label: "Fuente recomendada", value: budget.tier },
      ],
      sections: [
        {
          heading: "Componentes",
          rows: [...selectedList]
            .sort(
              (a, b) =>
                SLOTS.findIndex((s) => s.slug === a.categoria.slug) -
                SLOTS.findIndex((s) => s.slug === b.categoria.slug),
            )
            .map((c) => ({
              label: c.categoria.nombre,
              value: `${c.marca.nombre} ${c.nombre} — ${formatPrice(c.precio)}`,
            })),
        },
        {
          heading: "Consumo energético",
          rows: [
            ...budget.lines.map((l) => ({ label: l.name, value: `${l.watts} W` })),
            { label: "Consumo total estimado", value: `${budget.estimatedWatts} W` },
            {
              label: "Fuente recomendada",
              value: `${budget.tier} (margen ${budget.headroomWatts} W)`,
            },
          ],
        },
      ],
    }
    if (effectiveCompat) {
      data.sections.push({
        heading: "Estado de compatibilidad",
        rows: [
          {
            label: "Resultado",
            value: effectiveCompat.compatible
              ? "Configuración compatible"
              : "Configuración incompatible",
          },
          { label: "Score", value: `${effectiveCompat.score}/100` },
          ...effectiveCompat.issues.map((issue) => ({
            label: `Problema · ${issue.type} (${issue.severity})`,
            value: `${issue.description} ${issue.suggestion ?? ""}`.trim(),
          })),
          ...effectiveCompat.warnings.map((issue) => ({
            label: `Advertencia · ${issue.type}`,
            value: issue.description,
          })),
        ],
      })
    }
    if (effectiveBottleneck) {
      data.sections.push({
        heading: "Análisis de cuellos de botella",
        rows: [
          {
            label: "Resultado",
            value: `${
              effectiveBottleneck.overallBottleneck
            } · desbalance ${effectiveBottleneck.bottleneckPercentage}%`,
          },
          {
            label: "Recomendaciones",
            value:
              effectiveBottleneck.recommendations.length > 0
                ? effectiveBottleneck.recommendations.join(". ")
                : "Sin recomendaciones",
          },
        ],
      })
    }
    if (budget.notes.length > 0) {
      data.sections.push({ heading: "Notas de energía", items: budget.notes })
    }
    data.footer = `Total estimado: ${formatPrice(totalPrice.toFixed(2))} · ${budget.tier}`
    printReport(data)
  }

  const pickerList = useMemo(() => {
    if (!pickerCategory) return []
    const list = catalog[pickerCategory] || []
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter((c) =>
      [c.nombre, c.marca.nombre, c.descripcion ?? ""].some((t) => t.toLowerCase().includes(q)),
    )
  }, [catalog, pickerCategory, search])

  const selectComponent = (component: Component) => {
    if (!pickerCategory) return
    setSelected((prev) => ({ ...prev, [pickerCategory]: component }))
    setPickerCategory(null)
    setSearch("")
  }

  const removeComponent = (slug: string) => {
    setSelected((prev) => ({ ...prev, [slug]: null }))
  }

  const resetBuild = () => {
    setSelected(EMPTY_SELECTION())
    setCompat(null)
    setBottleneck(null)
    setValidationError(null)
    setValidatedKey("")
    setResolvedBottleneckKey("")
    setFromBuildName(null)
    setSaveSuccess(null)
  }

  const totalCount = Object.keys(catalog).reduce((acc, k) => acc + catalog[k].length, 0)

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Wrench className="h-7 w-7 text-primary glow-text" />
            Simulador de Ensamble
          </h1>
          <p className="text-muted-foreground">
            Catálogo en vivo: {loading ? "cargando…" : `${totalCount} componentes`}. Selecciona piezas y la
            compatibilidad se valida en tiempo real.
          </p>
          {fromBuildName && (
            <Badge variant="info" className="mt-1">
              Cargado desde build: {fromBuildName}
            </Badge>
          )}
        </div>
        {totalCount > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={resetBuild}>
              <RotateCcw className="h-4 w-4" />
              Limpiar selección
            </Button>
            <Button size="sm" onClick={openSave} disabled={selectedIds.length === 0}>
              <Save className="h-4 w-4" />
              Guardar este Ensamble
            </Button>
          </div>
        )}
      </div>

      <EstimatedPriceNotice />

      {saveSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-400">
          <Check className="h-4 w-4" />
          {saveSuccess}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando catálogo desde el motor local de Corelyze…
        </div>
      )}

      {loadError && (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">
            No se pudo conectar con el motor local ({loadError}). Verifica los registros en %APPDATA%\Corelyze\logs\backend.log.
          </p>
          <Button size="sm" variant="outline" onClick={retry}>
            <RotateCcw className="h-4 w-4" />
            Reintentar
          </Button>
        </div>
      )}

      {!loading && !loadError && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            {SLOTS.map((slot) => {
              const sel = selected[slot.slug] ?? null
              const open = pickerCategory === slot.slug
              const Icon = slot.icon
              const available = (catalog[slot.slug] || []).length
              return (
                <Card
                  key={slot.slug}
                  className={cn(
                    "relative",
                    open && "border-primary/60 ring-1 ring-primary/30",
                  )}
                >
                  <CardHeader className="pb-3 pr-10">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Icon className="h-4 w-4 text-primary" />
                      {slot.label}
                    </CardTitle>
                    {sel && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-2 top-2 h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeComponent(slot.slug)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3 pb-4">
                    {sel ? (
                      <div className="space-y-1">
                        <Badge variant="success" className="text-[10px]">
                          {sel.marca.nombre}
                        </Badge>
                        <div className="text-sm font-medium leading-tight">{sel.nombre}</div>
                        <div className="text-xs text-muted-foreground">{formatPrice(sel.precio)}</div>
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        Sin seleccionar
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant={sel ? "outline" : "default"}
                      className="w-full"
                      onClick={() => {
                        setPickerCategory(open ? null : slot.slug)
                        setSearch("")
                      }}
                    >
                      {open ? "Cerrar" : sel ? "Cambiar" : "Elegir"}
                      {!open && <ArrowRight className="h-4 w-4" />}
                    </Button>
                    {!sel && available > 0 && (
                      <p className="text-center text-[10px] text-muted-foreground">
                        {available} en catálogo
                      </p>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {pickerCategory && (
            <Card className="border-primary/40">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2">
                    <Wrench className="h-5 w-5 text-primary" />
                    Elegir {SLOTS.find((s) => s.slug === pickerCategory)?.label ?? pickerCategory}
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">
                    {(catalog[pickerCategory] || []).length} disponibles
                  </span>
                </div>
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={`Buscar ${SLOTS.find((s) => s.slug === pickerCategory)?.label.toLowerCase() ?? "componente"}…`}
                    className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/40"
                  />
                </div>
              </CardHeader>
              <CardContent>
                {pickerList.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No se encontraron componentes para “{search}”.
                  </p>
                ) : (
                  <div className="flex max-h-[420px] flex-col gap-2 overflow-auto pr-1">
                    {pickerList.map((c) => {
                      const Icon = SLOT_ICONS[pickerCategory] ?? Cpu
                      const isSelected = selected[pickerCategory]?.id === c.id
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectComponent(c)}
                          className={cn(
                            "rounded-lg border p-3 text-left transition-colors hover:bg-accent",
                            isSelected ? "border-primary bg-primary/5" : "border-border/60",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-2.5">
                              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-sm font-medium">{c.nombre}</span>
                                  {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {c.marca.nombre} · {c.categoria.nombre}
                                </div>
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-sm font-semibold">{formatPrice(c.precio)}</div>
                              <div className="text-[10px] text-muted-foreground">{c.stock} en stock</div>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {formatSpecs(c)
                              .filter(Boolean)
                              .map((s, i) => (
                                <Badge key={i} variant="secondary" className="text-[10px]">
                                  {s}
                                </Badge>
                              ))}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  Estado de Compatibilidad
                </CardTitle>
                <CardDescription>
                  {selectedIds.length} componentes seleccionados · validación automática al cambiar
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedIds.length < 2 ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Zap className="h-4 w-4 text-yellow-400" />
                    Selecciona al menos dos componentes para validar compatibilidad (socket, tipo RAM,
                    energía, gabinete y cooler).
                  </div>
                ) : validating ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Validando compatibilidad…
                  </div>
                ) : effectiveValidationError ? (
                  <p className="text-sm text-destructive">{effectiveValidationError}</p>
                ) : effectiveCompat ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Badge
                        variant={effectiveCompat.compatible ? "success" : "destructive"}
                        className="px-3 py-1 text-sm"
                      >
                        {effectiveCompat.compatible ? "Configuración compatible" : "Configuración incompatible"}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        Score: <span className="font-semibold">{effectiveCompat.score}/100</span>
                      </span>
                    </div>
                    <div className="space-y-3">
                      <Progress value={effectiveCompat.score} />
                      {effectiveCompat.issues.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium">Problemas ({effectiveCompat.issues.length})</h4>
                          {effectiveCompat.issues.map((issue, i) => (
                            <IssueBlock key={i} issue={issue} kind="issue" />
                          ))}
                        </div>
                      )}
                      {effectiveCompat.warnings.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium">Advertencias ({effectiveCompat.warnings.length})</h4>
                          {effectiveCompat.warnings.map((issue, i) => (
                            <IssueBlock key={i} issue={issue} kind="warning" />
                          ))}
                        </div>
                      )}
                      {effectiveCompat.issues.length === 0 && effectiveCompat.warnings.length === 0 && (
                        <p className="text-sm text-emerald-400">Sin problemas detectados en esta configuración.</p>
                      )}
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Análisis de Cuellos de Botella
                </CardTitle>
                <CardDescription>
                  {cpu && gpu
                    ? `CPU: ${cpu.nombre} vs GPU: ${gpu.nombre}`
                    : "Selecciona CPU y GPU para activar el análisis"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!cpu || !gpu ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Layers className="h-4 w-4 text-cyan-400" />
                    Falta seleccionar {!cpu && gpu ? "un procesador" : !gpu && cpu ? "una tarjeta gráfica" : "procesador y tarjeta gráfica"}.
                  </div>
                ) : !effectiveBottleneck ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Calculando…
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium">
                          Cuello de botella general:
                          <Badge variant={effectiveBottleneck.overallBottleneck === "BALANCED" || effectiveBottleneck.overallBottleneck === "NONE" ? "success" : "warning"}>
                            {bottleneckLabel(effectiveBottleneck.overallBottleneck)}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Desbalance: {effectiveBottleneck.bottleneckPercentage}% · Balance CPU/GPU:{" "}
                          {effectiveBottleneck.cpuGpuBalance.ratio} ({effectiveBottleneck.cpuGpuBalance.classification})
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      {(Object.keys(effectiveBottleneck.resolutionAnalysis) as Array<"1080p" | "1440p" | "4K">).map(
                        (res) => {
                          const bs = effectiveBottleneck.resolutionAnalysis[res]
                          return (
                            <div key={res} className="rounded-lg border bg-muted/30 p-3">
                              <div className="flex items-center justify-between gap-2 text-sm">
                                <span className="font-medium">{res}</span>
                                <Badge variant={impactVariant(bs.impact)} className="text-[10px]">
                                  {bs.impact}
                                </Badge>
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {bs.bottleneckType} · {bs.percentage}%
                              </div>
                            </div>
                          )
                        },
                      )}
                    </div>
                    {effectiveBottleneck.recommendations.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium">Recomendaciones</h4>
                        <ul className="mt-2 space-y-1">
                          {effectiveBottleneck.recommendations.map((r, i) => (
                            <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                              <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                Resumen de tu configuración
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedIds.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aún no hay piezas seleccionadas. Usa los botones “Elegir” para armar tu PC.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {SLOTS.filter((s) => selected[s.slug]).map((slot) => {
                    const c = selected[slot.slug] as Component
                    return (
                      <div key={slot.slug} className="flex items-center justify-between gap-3 text-sm">
                        <div className="flex min-w-0 items-center gap-2">
                          <slot.icon className="h-4 w-4 shrink-0 text-primary" />
                          <span className="truncate font-medium">{c.nombre}</span>
                          <Badge variant="secondary" className="text-[10px]">
                            {c.marca.nombre}
                          </Badge>
                        </div>
                        <span className="shrink-0 text-muted-foreground">{formatPrice(c.precio)}</span>
                      </div>
                    )
                  })}
                  <div className="mt-2 flex items-center justify-between border-t pt-3">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Power className="h-4 w-4 text-blue-400" /> Total estimado de mercado
                    </span>
                    <span className="text-lg font-bold">{formatPrice(totalPrice.toFixed(2))}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 border-t pt-3">
                    <Button size="sm" variant="outline" onClick={exportPdf}>
                      <FileDown className="h-4 w-4" />
                      Exportar PDF
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowPower((p) => !p)}>
                      <Plug className="h-4 w-4" />
                      {showPower ? "Ocultar PSU" : "Recomendación PSU"}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {showPower && selectedList.length > 0 && <PowerPanel components={selectedList} />}

          {fpsProfile && (
            <FpsWidget profile={fpsProfile} title="Estimación de FPS de tu ensamble" />
          )}
        </>
      )}

      {saveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-md border-border/60 bg-card shadow-xl">
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2">
                  <Save className="h-5 w-5 text-primary" />
                  Guardar este Ensamble
                </CardTitle>
                <CardDescription>
                  Se registrarán {selectedIds.length} componentes como un ensamble personalizado.
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => setSaveOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Nombre</span>
                <input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Ej: Mi PC Gaming 1440p"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-primary"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Descripción (opcional)</span>
                <textarea
                  value={saveDesc}
                  onChange={(e) => setSaveDesc(e.target.value)}
                  rows={3}
                  placeholder="Notas sobre este ensamble…"
                  className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
                />
              </label>
              {saveError && <p className="text-sm text-destructive">{saveError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setSaveOpen(false)} disabled={saving}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={saveBuild} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Guardar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}