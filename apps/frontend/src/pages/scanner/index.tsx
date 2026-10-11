import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Search,
  Activity,
  Cpu,
  Loader2,
  RefreshCw,
  HardDrive,
  MemoryStick,
  Monitor,
  ScanLine,
  AlertTriangle,
  CircuitBoard,
  Gauge,
  ShieldCheck,
  ShieldAlert,
  Lightbulb,
  CheckCircle2,
  Wrench,
  FileDown,
  Plug,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { hardwareService } from "@/services/hardware.service"
import type {
  BottleneckAnalysis,
  CompatibilityResult,
  Component,
  HardwareScanResult,
  Severity,
} from "@/services/types"
import {
  buildDiagnosticReport,
  matchDetectedHardware,
  type DiagnosticPoint,
  type DiagnosticReport,
  type MatchedHardware,
  type UpgradeSuggestion,
} from "@/lib/diagnostics"
import { estimatePowerBudget } from "@/lib/power"
import { printReport, type ReportData } from "@/lib/report"
import { PowerPanel } from "@/components/power-panel"
import { FpsWidget } from "@/components/fps/fps-widget"
import { profileFromHardware } from "@/lib/fps-estimator"

interface TauriInternals {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
}

async function scanNative(): Promise<HardwareScanResult | null> {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__
  if (!internals?.invoke) return null
  try {
    const payload = (await internals.invoke("scan_hardware")) as Record<string, unknown> | null | undefined
    if (!payload || typeof payload !== "object") return null
    const raw = payload
    return {
      scannedAt: new Date().toISOString(),
      hardware: {
        hostname: String(raw.hostname ?? "—"),
        platform: String(raw.platform ?? "—"),
        os: String(raw.platform ?? "—"),
        osVersion: "",
        arch: String(raw.arch ?? "—"),
        cpuModel: String(raw.cpuModel ?? "—"),
        cpuCores: Number(raw.cpuCores ?? 0),
        cpuLogical: Number(raw.cpuLogical ?? 0),
        cpuSpeedGhz: Number(raw.cpuSpeedGhz ?? 0),
        totalMemoryGB: Number(raw.totalMemoryGB ?? 0),
        freeMemoryGB: Number(raw.freeMemoryGB ?? 0),
        usedMemoryGB: Math.max(
          0,
          Number(raw.totalMemoryGB ?? 0) - Number(raw.freeMemoryGB ?? 0),
        ),
        ramType: typeof raw.ramType === "string" ? raw.ramType : null,
        ramSpeedMhz:
          Number.isFinite(Number(raw.ramSpeedMhz)) && Number(raw.ramSpeedMhz) > 0
            ? Number(raw.ramSpeedMhz)
            : null,
        ramModules:
          Number.isFinite(Number(raw.ramModules)) && Number(raw.ramModules) > 0
            ? Number(raw.ramModules)
            : null,
        gpus: Array.isArray(raw.gpus)
          ? (raw.gpus as Array<Record<string, unknown>>).map((g) => ({
              name: String(g.name ?? "—"),
              vramGB: g.vramGB === null || g.vramGB === undefined ? null : Number(g.vramGB),
            }))
          : [],
        motherboard: raw.motherboard
          ? {
              manufacturer: String((raw.motherboard as Record<string, unknown>).manufacturer ?? ""),
              model: String((raw.motherboard as Record<string, unknown>).model ?? ""),
            }
          : null,
        storage: Array.isArray(raw.storage)
          ? (raw.storage as Array<Record<string, unknown>>).map((d) => ({
              model: String(d.model ?? "—"),
              type: (d.kind === "SSD" || d.kind === "HDD" ? d.kind : "Desconocido") as
                | "SSD"
                | "HDD"
                | "Desconocido",
              capacityGB: Number(d.capacityGB ?? 0),
              freeGB: Number(d.freeGB ?? 0),
              smartStatus: (d.smartStatus === "OK" ||
              d.smartStatus === "Atencion" ||
              d.smartStatus === "Fallo"
                ? d.smartStatus
                : "N/A") as "OK" | "Atencion" | "Fallo" | "N/A",
              predictFailure: Boolean(d.predictFailure),
            }))
          : [],
        driverIssues: Array.isArray(raw.driverIssues)
          ? (raw.driverIssues as Array<Record<string, unknown>>).map((d) => ({
              device: String(d.device ?? "—"),
              class: String(d.class ?? "Dispositivo"),
              errorCode: Number(d.errorCode ?? 0),
              problem: String(d.problem ?? ""),
              recommendation: String(d.recommendation ?? ""),
            }))
          : [],
        source: "tauri",
      },
    }
  } catch {
    return null
  }
}

function severityClasses(severity: Severity): string {
  switch (severity) {
    case "CRITICAL":
      return "border-destructive/60 bg-destructive/15 text-destructive"
    case "HIGH":
      return "border-red-500/50 bg-red-500/10 text-red-400"
    case "MEDIUM":
      return "border-yellow-500/50 bg-yellow-500/10 text-yellow-400"
    case "LOW":
    default:
      return "border-blue-500/50 bg-blue-500/10 text-blue-300"
  }
}

function healthVariant(score: number): "success" | "warning" | "destructive" {
  if (score >= 70) return "success"
  if (score >= 50) return "warning"
  return "destructive"
}

function smartVariant(status: string): "success" | "warning" | "destructive" | "secondary" {
  switch (status) {
    case "Fallo":
      return "destructive"
    case "Atencion":
      return "warning"
    case "OK":
      return "success"
    default:
      return "secondary"
  }
}

function PointRow({ point, icon }: { point: DiagnosticPoint; icon: LucideIcon }) {
  const Icon = icon
  return (
    <div className={cn("rounded-lg border p-3 text-sm", severityClasses(point.severity))}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="font-medium">{point.title}</span>
      </div>
      <p className="mt-1 text-xs opacity-90">{point.detail}</p>
    </div>
  )
}

function UpgradeRow({ upgrade }: { upgrade: UpgradeSuggestion }) {
  const variant = upgrade.priority === "ALTA" ? "destructive" : upgrade.priority === "MEDIA" ? "warning" : "info"
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{upgrade.title}</span>
        <Badge variant={variant} className="text-[10px]">
          {upgrade.priority}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{upgrade.detail}</p>
    </div>
  )
}

export default function ScannerPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<HardwareScanResult | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [report, setReport] = useState<DiagnosticReport | null>(null)
  const [matched, setMatched] = useState<MatchedHardware | null>(null)
  const [showPower, setShowPower] = useState(false)

  useEffect(() => {
    const hwData = result?.hardware
    if (!hwData) return
    let cancelled = false
    const analyze = async () => {
      setAnalyzing(true)
      try {
        const components: Component[] = await hardwareService.getComponents()
        const match = matchDetectedHardware(hwData, components)

        let compat: CompatibilityResult | null = null
        let bottleneck: BottleneckAnalysis | null = null

        if (match.ids.length >= 2) {
          compat = await hardwareService.validateCompatibility(match.ids).catch(() => null)
        }
        if (match.bySlot.cpu && match.bySlot.gpu) {
          bottleneck = await hardwareService
            .analyzeBottlenecks({
              cpuId: match.bySlot.cpu.id,
              gpuId: match.bySlot.gpu.id,
              ramIds: match.bySlot.ram ? [match.bySlot.ram.id] : [],
              resolution: "1080p",
            })
            .catch(() => null)
        }

        if (cancelled) return
        setMatched(match)
        setReport(
          buildDiagnosticReport({
            hw: hwData,
            matched: match,
            compat,
            bottleneck,
          }),
        )
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo analizar el hardware")
      } finally {
        if (!cancelled) setAnalyzing(false)
      }
    }
    analyze()
    return () => {
      cancelled = true
    }
  }, [result])

  const runScan = useCallback(async () => {
    setLoading(true)
    setError(null)
    setReport(null)
    setMatched(null)
    try {
      const native = await scanNative()
      const res = native ?? (await hardwareService.scanHardware())
      if (!res?.hardware) {
        throw new Error("El escaneo no devolvió información de hardware")
      }
      setResult(res)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo completar el escaneo")
    } finally {
      setLoading(false)
    }
  }, [])

  const loadInSimulator = () => {
    if (!matched || matched.ids.length < 2) return
    navigate("/simulator", {
      state: {
        buildName: `Mi PC (${result?.hardware.hostname ?? "escaneo"})`,
        componentIds: matched.ids,
      },
    })
  }

  const reportComponents = matched
    ? Object.values(matched.bySlot).filter((c): c is Component => Boolean(c))
    : []

  const fpsProfile = useMemo(
    () => (result?.hardware ? profileFromHardware(result.hardware, reportComponents) : null),
    [result, matched],
  )

  const exportReport = () => {
    if (!report || !hw) return
    const data: ReportData = {
      title: "Reporte de Diagnóstico de Hardware",
      subtitle: `${hw.hostname} · ${hw.os} ${hw.osVersion} · ${hw.arch}`,
      meta: [
        {
          label: "Fecha de emisión",
          value:
            result?.scannedAt && !Number.isNaN(new Date(result.scannedAt).getTime())
              ? new Date(result.scannedAt).toLocaleString("es-US")
              : "—",
        },
        { label: "Equipo", value: hw.hostname },
        { label: "Plataforma", value: `${hw.platform} ${hw.osVersion} (${hw.arch})` },
        { label: "Score general", value: `${report.score}/100` },
        { label: "Procesador", value: hw.cpuModel },
        { label: "Memoria RAM", value: `${hw.totalMemoryGB} GB (${hw.freeMemoryGB} GB libres)` },
        {
          label: "Discos",
          value: hw.storage.length > 0 ? hw.storage.map((d) => `${d.model} (${d.capacityGB} GB ${d.type})`).join(", ") : "—",
        },
      ],
      sections: [
        { heading: "Resumen del diagnóstico", items: [report.headline, report.summary] },
      ],
    }
    if (report.strengths.length > 0) {
      data.sections.push({
        heading: "Puntos fuertes",
        items: report.strengths.map((s) => `${s.title} — ${s.detail}`),
      })
    }
    if (report.concerns.length > 0) {
      data.sections.push({
        heading: "Puntos de atención",
        items: report.concerns.map((c) => `${c.title} — ${c.detail}`),
      })
    }
    if (report.upgrades.length > 0) {
      data.sections.push({
        heading: "Mejoras sugeridas",
        items: report.upgrades.map((u) => `${u.title} [${u.priority}] — ${u.detail}`),
      })
    }
    if (reportComponents.length > 0) {
      const budget = estimatePowerBudget(reportComponents)
      data.sections.push({
        heading: "Consumo estimado y PSU recomendada",
        rows: [
          { label: "Consumo total estimado", value: `${budget.estimatedWatts} W` },
          { label: "Fuente recomendada", value: budget.tier },
          { label: "Margen disponible", value: `${budget.headroomWatts} W` },
          ...budget.lines.map((l) => ({ label: l.name, value: `${l.watts} W` })),
        ],
      })
      data.footer = budget.tier
    }
    if (hw.driverIssues.length > 0) {
      data.sections.push({
        heading: "Problemas de controladores",
        items: hw.driverIssues.map(
          (d) => `${d.device} (Código ${d.errorCode}, ${d.class}) — ${d.recommendation}`,
        ),
      })
    }
    printReport(data)
  }

  const hw = result?.hardware
  const usedMemory = hw ? Math.max(0, hw.totalMemoryGB - hw.freeMemoryGB) : 0
  const memoryPercent = hw && hw.totalMemoryGB > 0 ? (usedMemory / hw.totalMemoryGB) * 100 : 0

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <ScanLine className="h-7 w-7 text-primary glow-text" />
          Análisis Profundo de Hardware
        </h1>
        <p className="text-muted-foreground">
          Escaneo nativo + diagnóstico inteligente: puntos fuertes, cuellos de botella y sugerencias de mejora.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Escaneo del Sistema
          </CardTitle>
          <CardDescription>
            El agente Tauri lee CPU, RAM, GPU, placa madre y discos; la API expone el mismo informe como respaldo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={runScan} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : result ? (
                <RefreshCw className="mr-2 h-4 w-4" />
              ) : (
                <ScanLine className="mr-2 h-4 w-4" />
              )}
              {loading ? "Escaneando…" : result ? "Volver a escanear" : "Escanear hardware"}
            </Button>
            {hw && <Badge variant={hw.source === "tauri" ? "success" : "info"}>Fuente: {hw.source}</Badge>}
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}
          {!result && !error && (
            <p className="text-xs text-muted-foreground">
              Se consultará el agente Tauri si está disponible; de lo contrario se usará
              la API local de Corelyze (/api/hardware/scan).
            </p>
          )}
        </CardContent>
      </Card>

      {loading && (
        <div className="glass-panel top-hairline overflow-hidden rounded-2xl p-5" role="status" aria-live="polite">
          <div className="flex items-center gap-2.5 text-sm font-medium text-section">
            <Loader2 className="h-4 w-4 animate-spin" />
            Leyendo el hardware de tu PC… (agente Tauri o API local)
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-white/[0.06] bg-white/[0.03] p-4">
                <div className="h-2.5 w-24 animate-pulse rounded-full bg-white/10" />
                <div className="h-4 w-32 animate-pulse rounded-full bg-white/[0.14]" />
                <div className="h-2.5 w-40 animate-pulse rounded-full bg-white/[0.07]" />
              </div>
            ))}
          </div>
        </div>
      )}

      {hw && analyzing && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analizando el sistema y comparando con el catálogo Corelyze…
        </div>
      )}

      {report && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-primary" />
                Reporte General de Salud y Desempeño
              </CardTitle>
              <Badge variant={healthVariant(report.score)} className="px-3 py-1 text-sm">
                {report.score}/100 · {report.headline}
              </Badge>
            </div>
            <CardDescription>{report.summary}</CardDescription>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={exportReport}>
                <FileDown className="h-4 w-4" />
                Exportar PDF
              </Button>
              {reportComponents.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => setShowPower((p) => !p)}>
                  <Plug className="h-4 w-4" />
                  {showPower ? "Ocultar PSU" : "Recomendación PSU"}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <Progress value={report.score} />

            {showPower && reportComponents.length > 0 && <PowerPanel components={reportComponents} />}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="text-xs text-muted-foreground">
                {report.matchedCount >= 2
                  ? `${report.matchedCount} componentes identificados en el catálogo. Puedes probar mejoras hipotéticas.`
                  : "No se identificaron suficientes componentes en el catálogo para simular esta PC."}
              </p>
              <Button
                size="sm"
                onClick={loadInSimulator}
                disabled={report.matchedCount < 2}
                title={report.matchedCount < 2 ? "Se necesitan al menos 2 componentes reconocidos" : undefined}
              >
                <Wrench className="h-4 w-4" />
                Cargar mi PC actual en el Simulador
              </Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
                  <ShieldCheck className="h-4 w-4" />
                  Lo que está bien ({report.strengths.length})
                </h3>
                {report.strengths.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin puntos fuertes destacados.</p>
                ) : (
                  report.strengths.map((p) => <PointRow key={p.id} point={p} icon={CheckCircle2} />)
                )}
              </div>

              <div className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-yellow-400">
                  <ShieldAlert className="h-4 w-4" />
                  Puntos de atención ({report.concerns.length})
                </h3>
                {report.concerns.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No se detectaron problemas relevantes.</p>
                ) : (
                  report.concerns.map((p) => <PointRow key={p.id} point={p} icon={AlertTriangle} />)
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Lightbulb className="h-4 w-4" />
                Soluciones y mejoras sugeridas ({report.upgrades.length})
              </h3>
              {report.upgrades.length === 0 ? (
                <p className="text-xs text-muted-foreground">Tu equipo no requiere mejoras urgentes.</p>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {report.upgrades.map((u) => (
                    <UpgradeRow key={u.id} upgrade={u} />
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {hw && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Monitor className="h-4 w-4 text-primary" />
                Sistema
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Equipo</span>
                <span className="font-medium">{hw.hostname}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Plataforma</span>
                <span className="font-medium">
                  {hw.platform} {hw.osVersion} ({hw.arch})
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Escaneado</span>
                <span className="font-medium">
                  {result?.scannedAt && !Number.isNaN(new Date(result.scannedAt).getTime())
                    ? new Date(result.scannedAt).toLocaleString("es-US")
                    : "—"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" />
                Procesador
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="font-medium">{hw.cpuModel}</div>
              <div className="text-muted-foreground">
                {hw.cpuCores > 0 ? `${hw.cpuCores} núcleos · ` : ""}
                {hw.cpuLogical} hilos
                {hw.cpuSpeedGhz > 0 ? ` · ${hw.cpuSpeedGhz} GHz` : ""}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MemoryStick className="h-4 w-4 text-primary" />
                Memoria RAM
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Total</span>
                <span className="font-medium">{hw.totalMemoryGB} GB</span>
              </div>
              <Progress value={memoryPercent} />
              <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                <span>{usedMemory.toFixed(2)} GB en uso ({memoryPercent.toFixed(0)}%)</span>
                <span>{hw.freeMemoryGB} GB libres</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-primary" />
                Gráficos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {hw.gpus.length === 0 ? (
                <p className="text-muted-foreground">No se detectaron GPUs.</p>
              ) : (
                hw.gpus.map((gpu, i) => (
                  <div key={`${gpu.name}-${i}`} className="flex items-center justify-between gap-2">
                    <span className="font-medium">{gpu.name}</span>
                    {gpu.vramGB !== null && (
                      <Badge variant="secondary" className="text-[10px]">
                        {gpu.vramGB} GB VRAM
                      </Badge>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CircuitBoard className="h-4 w-4 text-primary" />
                Placa Madre
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {hw.motherboard && (hw.motherboard.model || hw.motherboard.manufacturer) ? (
                <>
                  <div className="font-medium">{hw.motherboard.model || "—"}</div>
                  <div className="text-muted-foreground">{hw.motherboard.manufacturer || "—"}</div>
                </>
              ) : (
                <p className="text-muted-foreground">No se pudo detectar la placa madre.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Almacenamiento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {hw.storage.length === 0 ? (
                <p className="text-muted-foreground">No se detectaron discos.</p>
              ) : (
                hw.storage.map((disk, i) => {
                  const usedPercent =
                    disk.capacityGB > 0 ? ((disk.capacityGB - disk.freeGB) / disk.capacityGB) * 100 : 0
                  return (
                    <div key={`${disk.model}-${i}`} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{disk.model}</span>
                        <Badge variant={disk.type === "SSD" ? "success" : "secondary"} className="text-[10px]">
                          {disk.type} · {disk.capacityGB} GB
                        </Badge>
                      </div>
                      <Progress value={usedPercent} />
                      <div className="text-[11px] text-muted-foreground">
                        {disk.freeGB} GB libres de {disk.capacityGB} GB
                      </div>
                      {(disk.smartStatus || disk.predictFailure) && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <Badge variant={smartVariant(disk.smartStatus ?? "N/A")} className="text-[10px]">
                            S.M.A.R.T.: {disk.smartStatus ?? "N/A"}
                          </Badge>
                          {disk.predictFailure && (
                            <Badge variant="destructive" className="text-[10px]">
                              <AlertTriangle className="h-3 w-3" /> Fallo predicho
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="h-4 w-4 text-primary" />
                Controladores
              </CardTitle>
              <CardDescription>
                Dispositivos con problemas de driver reportados por Windows
                {hw.driverIssues.length > 0 ? ` (${hw.driverIssues.length})` : ""}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {hw.driverIssues.length === 0 ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-emerald-400">Sin problemas de controladores detectados.</span>
                </div>
              ) : (
                hw.driverIssues.map((issue, i) => (
                  <div
                    key={`${issue.device}-${i}`}
                    className="flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/30 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-400" />
                        <span className="truncate font-medium">{issue.device}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="destructive" className="text-[10px]">
                          Código {issue.errorCode}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {issue.class}
                        </Badge>
                      </div>
                    </div>
                    {issue.problem && <p className="text-xs text-muted-foreground">{issue.problem}</p>}
                    {issue.recommendation && (
                      <p className="text-xs text-foreground/80">{issue.recommendation}</p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {fpsProfile && (
        <FpsWidget profile={fpsProfile} title="FPS estimados en tu PC detectada" />
      )}
    </div>
  )
}
