const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api"

export interface TelemetryGpu {
  name: string
  usage: number | null
  tempC: number | null
  powerW: number | null
  memUsedMB: number | null
  memTotalMB: number | null
  freqMhz?: number | null
  source: string
}

export interface TelemetrySnapshot {
  time: string
  source: "powershell" | "node"
  error?: string
  cpu: {
    name: string | null
    usage: number | null
    freqMhz: number | null
    tempC: number | null
  }
  gpus: TelemetryGpu[]
  ram: {
    totalGB: number
    usedGB: number
    availableGB: number
    usage: number | null
    type?: string | null
    speedMhz?: number | null
    modules?: number | null
  }
}

export function telemetryUrl(intervalMs: number, gatewayId?: string | null): string {
  const base = gatewayId
    ? `http://${gatewayId}/api/telemetry/stream?interval=${Math.round(intervalMs)}`
    : `${API_URL}/telemetry/stream?interval=${Math.round(intervalMs)}`
  return base
}

export function parseTelemetry(event: MessageEvent<string>): TelemetrySnapshot | null {
  try {
    const parsed = JSON.parse(event.data) as Partial<TelemetrySnapshot>
    if (!parsed || typeof parsed.time !== "string") return null
    return {
      time: parsed.time,
      source: parsed.source === "powershell" ? "powershell" : "node",
      error: parsed.error,
      cpu: {
        name: parsed.cpu?.name ?? null,
        usage: parsed.cpu?.usage ?? null,
        freqMhz: parsed.cpu?.freqMhz ?? null,
        tempC: parsed.cpu?.tempC ?? null,
      },
      gpus: Array.isArray(parsed.gpus) ? parsed.gpus : [],
      ram: {
        totalGB: parsed.ram?.totalGB ?? 0,
        usedGB: parsed.ram?.usedGB ?? 0,
        availableGB: parsed.ram?.availableGB ?? 0,
        usage: parsed.ram?.usage ?? null,
        type: parsed.ram?.type ?? null,
        speedMhz: parsed.ram?.speedMhz ?? null,
        modules: parsed.ram?.modules ?? null,
      },
    }
  } catch {
    return null
  }
}