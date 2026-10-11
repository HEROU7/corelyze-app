import { useEffect, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import {
  Activity,
  Play,
  Pause,
  Thermometer,
  Cpu,
  MemoryStick,
  Gauge,
  MonitorPlay,
  WifiOff,
  Power,
} from "lucide-react"
import { RadialGauge, TemperatureGauge } from "@/components/monitor/radial-gauge"
import { MetricLineChart } from "@/components/monitor/metric-line-chart"
import {
  parseTelemetry,
  telemetryUrl,
  type TelemetrySnapshot,
} from "@/services/telemetry.service"
import { hardwareService } from "@/services/hardware.service"
import type { HardwareScanResult } from "@/services/types"

const INTERVAL_MS = 1000
const HISTORY_LIMIT = 120

interface DisplayGpu {
  key: string
  name: string
  usage: number | null
  tempC: number | null
  powerW: number | null
  memUsedMB: number | null
  memTotalMB: number | null
  source: string
}

function isGenericName(name: string | null | undefined): boolean {
  if (!name) return true
  const s = name.trim().toLowerCase()
  if (s === "" || s === "null" || s === "—" || s === "gpu" || s === "cpu") return true
  if (s.startsWith("pid")) return true
  if (/^gpu \d+$/.test(s)) return true
  return false
}

export default function MonitorPage() {
  const [streaming, setStreaming] = useState(true)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<TelemetrySnapshot | null>(null)
  const [history, setHistory] = useState<TelemetrySnapshot[]>([])
  const [systemInfo, setSystemInfo] = useState<HardwareScanResult | null>(null)
  const sourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    return () => {
      sourceRef.current?.close()
      sourceRef.current = null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    hardwareService
      .scanHardware()
      .then((res) => {
        if (!cancelled) setSystemInfo(res)
      })
      .catch(() => {
        /* El escaneo es opcional: sólo enriquece los nombres de CPU/GPU. */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    sourceRef.current?.close()
    sourceRef.current = null

    if (!streaming) return

    const source = new EventSource(telemetryUrl(INTERVAL_MS))
    sourceRef.current = source

    source.onopen = () => {
      setConnected(true)
      setError(null)
    }

    const handleMessage = (event: Event) => {
      const snap = parseTelemetry(event as MessageEvent<string>)
      if (!snap) return
      setLast(snap)
      if (snap.error) {
        setError(String(snap.error))
        return
      }
      setError(null)
      setHistory((prev) => {
        const next = [...prev, snap]
        return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next
      })
    }

    source.addEventListener("message", handleMessage)
    source.onerror = () => {
      setConnected(false)
      setError("Conexión perdida con el backend de telemetría. Verifica que la API esté en línea.")
    }

    return () => {
      source.removeEventListener("message", handleMessage)
      source.close()
      sourceRef.current = null
    }
  }, [streaming])

  const scanGpus = systemInfo?.hardware.gpus

  const displayGpus = useMemo<DisplayGpu[]>(() => {
    const tg = last?.gpus ?? []
    const scan = scanGpus ?? []
    if (tg.length === 0) {
      return scan.map((g, i) => ({
        key: `scan-${i}-${g.name}`,
        name: g.name,
        usage: null,
        tempC: null,
        powerW: null,
        memUsedMB: null,
        memTotalMB: g.vramGB != null ? g.vramGB * 1024 : null,
        source: "scan",
      }))
    }
    return tg.map((g, i) => {
      const scanGpu = scan[i]
      return {
        key: `${g.name}-${i}`,
        name: isGenericName(g.name) ? scanGpu?.name ?? scan[0]?.name ?? g.name : g.name,
        usage: g.usage,
        tempC: g.tempC,
        powerW: g.powerW,
        memUsedMB: g.memUsedMB,
        memTotalMB:
          g.memTotalMB ?? (scanGpu?.vramGB != null ? scanGpu.vramGB * 1024 : null),
        source: g.source,
      }
    })
  }, [last, scanGpus])

  const cpuSeries = useMemo(() => history.map((s) => s.cpu.usage ?? 0), [history])
  const ramSeries = useMemo(() => history.map((s) => s.ram.usage ?? 0), [history])
  const gpuSeries = useMemo(() => history.map((s) => s.gpus[0]?.usage ?? 0), [history])

  const primaryGpu = displayGpus[0]
  const rawCpuName = last?.cpu.name
  const cpuName = !isGenericName(rawCpuName)
    ? rawCpuName
    : systemInfo?.hardware.cpuModel ?? rawCpuName ?? null
  const ram = last?.ram

  const toggleStreaming = () => {
    if (streaming) setError(null)
    setStreaming(!streaming)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Activity className="h-7 w-7 text-primary glow-text" />
            Monitor en tiempo real
          </h1>
          <p className="text-muted-foreground">
            Telemetría en vivo del sistema: CPU, GPU, memoria y temperatura, al estilo panel de rendimiento.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {connected && streaming ? (
            <Badge variant="section" className="gap-1.5 px-3 py-1">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-section opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-section" />
              </span>
              En vivo
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1.5 px-3 py-1">
              <WifiOff className="h-3.5 w-3.5" />
              {streaming ? "Conectando…" : "En pausa"}
            </Badge>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={toggleStreaming}
            className={cn(streaming && "border-section/50 text-section")}
          >
            {streaming ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {streaming ? "Pausar" : "Reanudar"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <WifiOff className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.05] sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center gap-3 bg-white/[0.02] p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-section/20 bg-section/10 text-section">
            <Cpu className="h-5 w-5" />
          </span>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Frecuencia CPU
            </div>
            <div className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
              {last?.cpu.freqMhz ? `${(last.cpu.freqMhz / 1000).toFixed(2)} GHz` : "—"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white/[0.02] p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
            <MemoryStick className="h-5 w-5" />
          </span>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Memoria usada
            </div>
            <div className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
              {ram ? `${ram.usedGB.toFixed(1)} / ${ram.totalGB.toFixed(1)} GB` : "—"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white/[0.02] p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
            <Gauge className="h-5 w-5" />
          </span>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Potencia GPU
            </div>
            <div className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
              {primaryGpu?.powerW != null ? `${Math.round(primaryGpu.powerW)} W` : "—"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white/[0.02] p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10 text-orange-400">
            <Thermometer className="h-5 w-5" />
          </span>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Temp CPU
            </div>
            <div className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
              {last?.cpu.tempC != null ? `${Math.round(last.cpu.tempC)} °C` : "—"}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Card className="lift">
          <CardContent className="flex flex-col items-center gap-3 pt-6">
            <RadialGauge label="CPU" value={last?.cpu.usage ?? null} color="var(--section-accent)" />
            <Badge variant="secondary" className="max-w-full truncate text-[10px]">
              {cpuName ?? "CPU no detectada"}
            </Badge>
          </CardContent>
        </Card>
        <Card className="lift">
          <CardContent className="flex flex-col items-center gap-3 pt-6">
            <TemperatureGauge label="Temp CPU" celsius={last?.cpu.tempC ?? null} />
          </CardContent>
        </Card>
        <Card className="lift">
          <CardContent className="flex flex-col items-center gap-3 pt-6">
            <RadialGauge label="RAM" value={last?.ram.usage ?? null} color="#10b981" />
          </CardContent>
        </Card>
        <Card className="lift">
          <CardContent className="flex flex-col items-center gap-3 pt-6">
            <RadialGauge
              label="GPU"
              value={primaryGpu?.usage ?? null}
              color="#06b6d4"
              sublabel={primaryGpu?.name ? primaryGpu.name.slice(0, 24) : undefined}
            />
          </CardContent>
        </Card>
        <Card className="lift">
          <CardContent className="flex flex-col items-center gap-3 pt-6">
            <TemperatureGauge
              label="Temp GPU"
              celsius={primaryGpu?.tempC ?? null}
              sublabel={primaryGpu?.name ? primaryGpu.name.slice(0, 24) : undefined}
            />
          </CardContent>
        </Card>
        <Card className="lift">
          <CardContent className="flex flex-col items-center gap-3 pt-6">
            <RadialGauge
              label="VRAM"
              value={
                primaryGpu?.memTotalMB && primaryGpu.memTotalMB > 0
                  ? (primaryGpu.memUsedMB ?? 0) / (primaryGpu.memTotalMB / 100)
                  : null
              }
              color="#8b5cf6"
              sublabel={
                primaryGpu?.memTotalMB
                  ? `${Math.round((primaryGpu.memUsedMB ?? 0) / 1024)} / ${Math.round(primaryGpu.memTotalMB / 1024)} GB`
                  : undefined
              }
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lift">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Cpu className="h-4 w-4 text-section" /> Rendimiento CPU
            </CardTitle>
            <CardDescription>Uso global</CardDescription>
          </CardHeader>
          <CardContent>
            <MetricLineChart values={cpuSeries} color="var(--section-accent)" />
          </CardContent>
        </Card>
        <Card className="lift">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <MemoryStick className="h-4 w-4 text-emerald-400" /> Memoria
            </CardTitle>
            <CardDescription>Uso de RAM</CardDescription>
          </CardHeader>
          <CardContent>
            <MetricLineChart values={ramSeries} color="#10b981" />
          </CardContent>
        </Card>
        <Card className="lift">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <MonitorPlay className="h-4 w-4 text-cyan-300" /> Rendimiento GPU
            </CardTitle>
            <CardDescription>{primaryGpu?.name ?? "GPU no detectada"}</CardDescription>
          </CardHeader>
          <CardContent>
            <MetricLineChart values={gpuSeries} color="#06b6d4" />
          </CardContent>
        </Card>
      </div>

      {displayGpus.length > 0 && (
        <Card className="lift">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Power className="h-4 w-4 text-section" /> Detalle gráficas ({displayGpus.length})
            </CardTitle>
            <CardDescription>
              Cada GPU detectada por{" "}
              {displayGpus.some((g) => g.source === "nvidia-smi")
                ? "nvidia-smi"
                : displayGpus.some((g) => g.source === "perf-counters")
                  ? "contadores de rendimiento de Windows"
                  : displayGpus.some((g) => g.source === "wmi")
                    ? "WMI"
                    : "el escaneo local"}
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {displayGpus.map((gpu) => (
              <div key={gpu.key} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{gpu.name}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {gpu.tempC != null && (
                      <Badge variant={gpu.tempC >= 85 ? "destructive" : "secondary"} className="text-[10px]">
                        <Thermometer className="mr-1 h-3 w-3" />
                        {Math.round(gpu.tempC)} °C / {Math.round(gpu.tempC * (9 / 5) + 32)} °F
                      </Badge>
                    )}
                    {gpu.powerW != null && (
                      <Badge variant="secondary" className="text-[10px]">
                        <Power className="mr-1 h-3 w-3" />
                        {Math.round(gpu.powerW)} W
                      </Badge>
                    )}
                    {gpu.memUsedMB != null && gpu.memTotalMB && (
                      <Badge variant="secondary" className="text-[10px]">
                        <MemoryStick className="mr-1 h-3 w-3" />
                        {(gpu.memUsedMB / 1024).toFixed(1)} / {(gpu.memTotalMB / 1024).toFixed(0)} GB
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <Progress value={gpu.usage ?? 0} className="flex-1" />
                  <span className="w-16 text-right text-sm font-bold" style={{ fontFamily: "var(--font-display)" }}>
                    {gpu.usage != null ? `${gpu.usage}%` : "—"}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!last && !streaming && (
        <div className="glass-panel top-hairline rounded-2xl p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-section/20 bg-section/10 text-section">
            <Activity className="h-8 w-8" />
          </div>
          <h3 className="mt-4 text-lg font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Monitor en pausa
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Pulsa «Reanudar» para volver a recibir muestras en tiempo real.
          </p>
        </div>
      )}
    </div>
  )
}