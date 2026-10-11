/**
 * Motor de estimación de FPS multivariable.
 *
 * Evalúa GPU, CPU, cantidad/velocidad de RAM y tipo de almacenamiento
 * para producir FPS promedio y 1% Lows por juego, resolución y preset.
 * Se conecta con los componentes del Simulador de Ensamble y con el
 * hardware detectado por el Escaneo Local.
 */

import type { Component, HardwareInfo } from "@/services/types"
import {
  GAMES,
  type FpsPreset,
  type FpsResolution,
  type GameEntry,
} from "./fps-data"

// ───────────────────────── Tipos externos ─────────────────────────

export type CpuScoreSource = "componente" | "heuristico" | "desconocido"
export type GpuScoreSource = "componente" | "heuristico" | "desconocido"

export type StorageKind =
  | "NVMe Gen5"
  | "NVMe Gen4"
  | "NVMe Gen3"
  | "SSD SATA"
  | "HDD"
  | "Desconocido"

export interface CpuProfile {
  name: string
  score: number
  source: CpuScoreSource
}

export interface GpuProfile {
  name: string
  score: number
  vramGB: number | null
  source: GpuScoreSource
}

export interface FpsSystemProfile {
  gpu: GpuProfile | null
  cpu: CpuProfile | null
  ramGB: number
  ramType: "DDR4" | "DDR5" | "Desconocido"
  ramSpeedMhz: number | null
  storageType: StorageKind
}

export interface FpsEstimate {
  game: GameEntry
  avgFps: number
  low1Fps: number
  bottleneck: "GPU" | "CPU" | "RAM" | "ALMACENAMIENTO" | "VRAM" | "EQUILIBRADO"
  rating: FpsRating
  warningVram: boolean
  warnings: string[]
}

export interface FpsRating {
  tier: "extrema" | "144hz" | "alta" | "fluida" | "jugable" | "insuficiente"
  label: string
  monitorHz: number
}

// ─────────────────── Heurísticas por nombre ───────────────────────

/** Puntuaciones aproximadas de GPU conocidas (tomadas de benchmarks pasport). */
const GPU_SCORES: Array<[string, number]> = [
  ["RTX 5090", 46000],
  ["RTX 5080", 42000],
  ["RTX 5070 Ti", 37000],
  ["RTX 5070", 32000],
  ["RTX 4090", 38000],
  ["RTX 4080 Super", 37000],
  ["RTX 4080", 36000],
  ["RTX 4070 Ti Super", 35000],
  ["RTX 4070 Ti", 32000],
  ["RTX 4070 Super", 30000],
  ["RTX 4070", 27000],
  ["RTX 4060 Ti", 22000],
  ["RTX 4060", 19000],
  ["RTX 3090 Ti", 34000],
  ["RTX 3090", 32000],
  ["RTX 3080 Ti", 30000],
  ["RTX 3080", 28000],
  ["RTX 3070 Ti", 25000],
  ["RTX 3070", 23000],
  ["RTX 3060 Ti", 20000],
  ["RTX 3060", 17000],
  ["RTX 3050", 14000],
  ["RTX 2080 Ti", 26000],
  ["RTX 2080 Super", 24000],
  ["RTX 2080", 23000],
  ["RTX 2070 Super", 21000],
  ["RTX 2070", 19000],
  ["RTX 2060 Super", 18000],
  ["RTX 2060", 15000],
  ["RTX 1080 Ti", 17000],
  ["GTX 1080", 15000],
  ["GTX 1070 Ti", 13500],
  ["GTX 1070", 12000],
  ["GTX 1660 Super", 12000],
  ["GTX 1660", 11000],
  ["GTX 1060", 9000],
  ["GTX 1060 3GB", 8000],
  ["GTX 1650 Super", 9000],
  ["GTX 1650", 8000],
  ["GTX 1050 Ti", 6000],
  ["GTX 1050", 5000],
  ["RX 7900 XTX", 36000],
  ["RX 7900 XT", 33000],
  ["RX 7900 GRE", 28000],
  ["RX 7800 XT", 26000],
  ["RX 7700 XT", 24000],
  ["RX 7600 XT", 19500],
  ["RX 7600", 18000],
  ["RX 6950 XT", 33000],
  ["RX 6900 XT", 31000],
  ["RX 6800 XT", 27000],
  ["RX 6800", 25000],
  ["RX 6750 XT", 23000],
  ["RX 6700 XT", 21000],
  ["RX 6650 XT", 16000],
  ["RX 6600 XT", 15500],
  ["RX 6600", 15000],
  ["RX 6500 XT", 10000],
  ["RX 6400", 8000],
  ["RX 5700 XT", 16000],
  ["RX 5700", 14000],
  ["RX 5600 XT", 13000],
  ["Vega 56", 10000],
  ["Arc B580", 17000],
  ["Arc B570", 15000],
  ["Arc A770", 17000],
  ["Arc A750", 15000],
  ["Arc A380", 8000],
]

/** Puntuaciones aproximadas de CPU conocidas. */
const CPU_SCORES: Array<[string, number]> = [
  ["i9-14900K", 40500],
  ["i9-14900KF", 40000],
  ["i9-13900K", 39000],
  ["i9-13900KS", 40500],
  ["i7-14700K", 36000],
  ["i7-13700K", 34000],
  ["i9-12900K", 31000],
  ["i5-14600K", 29000],
  ["i7-12700K", 28000],
  ["i5-13600K", 28000],
  ["i5-14600", 25000],
  ["i5-13500", 24000],
  ["i5-12600K", 23000],
  ["i5-13400F", 20000],
  ["i5-13400", 20500],
  ["i5-12400F", 17500],
  ["i5-12400", 17500],
  ["i3-13100F", 14000],
  ["i3-12100F", 13000],
  ["i9-11900K", 19000],
  ["i7-11700K", 17000],
  ["i9-10900K", 18000],
  ["i7-10700K", 16000],
  ["i9-9900K", 15000],
  ["i7-9700K", 13500],
  ["i5-10400F", 11000],
  ["i5-11400F", 13000],
  ["i5-8400", 7500],
  ["Ryzen 9 7950X", 42000],
  ["Ryzen 9 7950X3D", 42000],
  ["Ryzen 9 7900X", 36000],
  ["Ryzen 9 7900", 34000],
  ["Ryzen 7 7800X3D", 32000],
  ["Ryzen 7 7700X", 30000],
  ["Ryzen 7 7700", 29000],
  ["Ryzen 7 8700G", 26000],
  ["Ryzen 5 8500G", 22000],
  ["Ryzen 5 7600X", 25000],
  ["Ryzen 5 7600", 25000],
  ["Ryzen 5 7500F", 24000],
  ["Ryzen 5 8600G", 22000],
  ["Ryzen 9 5950X", 33000],
  ["Ryzen 9 5900X", 30000],
  ["Ryzen 7 5800X3D", 28000],
  ["Ryzen 9 3900X", 23000],
  ["Ryzen 5 5700X", 23000],
  ["Ryzen 7 5700X", 23000],
  ["Ryzen 7 5800X", 24500],
  ["Ryzen 7 3800X", 19000],
  ["Ryzen 7 3700X", 17500],
  ["Ryzen 5 5600X", 19000],
  ["Ryzen 5 5600", 18000],
  ["Ryzen 5 5500", 15500],
  ["Ryzen 5 3600", 12000],
  ["Ryzen 5 2600", 9000],
  ["Ryzen 3 3200G", 6000],
  ["Ryzen 3 3100", 6500],
]

function findScoreByKeyword(keywords: Array<[string, number]>, name: string): number | null {
  const haystack = name.toLowerCase()
  for (const [key, score] of keywords) {
    if (haystack.includes(key.toLowerCase())) return score
  }
  return null
}

/** Los scores del agente/catálogo son nuestra fuente preferida. */
export function gpuScoreFromName(name: string): number {
  return findScoreByKeyword(GPU_SCORES, name) ?? 20000
}

export function cpuScoreFromName(name: string): number {
  return findScoreByKeyword(CPU_SCORES, name) ?? 16000
}

export function gpuVramFromName(name: string): number | null {
  const match = name.match(/(\d+)\s*GB/i)
  return match ? Number(match[1]) : null
}

// ─────────────────── Clasificación de almacenamiento ──────────────

export function storageKindFromString(value: string): StorageKind {
  const haystack = value.toLowerCase()
  if (haystack.includes("gen5") || haystack.includes("5.0")) return "NVMe Gen5"
  if (haystack.includes("gen4") || haystack.includes("4.0")) return "NVMe Gen4"
  if (haystack.includes("gen3") || haystack.includes("3.0")) return "NVMe Gen3"
  if (haystack.includes("nvme")) return "NVMe Gen3"
  if (haystack.includes("ssd") || haystack.includes("sata") || haystack.includes("sol")) {
    return "SSD SATA"
  }
  if (haystack.includes("hdd") || haystack.includes("mec") || haystack.includes("hard")) {
    return "HDD"
  }
  return "Desconocido"
}

// ─────────────────────── Perfiles de sistema ──────────────────────

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function str(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value)
}

export function estimateGpuScore(gpu: Component | undefined): {
  score: number
  vramGB: number | null
  source: GpuScoreSource
} {
  if (!gpu) return { score: 0, vramGB: null, source: "desconocido" }
  const benchmark = num((gpu.datosTecnicos as Record<string, unknown> | null)?.benchmarkScore)
  const specScore = num((gpu.especificaciones as Record<string, unknown> | null)?.benchmarkScore)
  const vram = num((gpu.especificaciones as Record<string, unknown> | null)?.vram) || null
  if (benchmark > 0) return { score: benchmark, vramGB: vram, source: "componente" }
  if (specScore > 0) return { score: specScore, vramGB: vram, source: "componente" }
  return {
    score: gpuScoreFromName(gpu.nombre),
    vramGB: vram ?? gpuVramFromName(gpu.nombre),
    source: "heuristico",
  }
}

export function estimateCpuScore(cpu: Component | undefined): {
  score: number
  source: CpuScoreSource
} {
  if (!cpu) return { score: 0, source: "desconocido" }
  const benchmark = num((cpu.datosTecnicos as Record<string, unknown> | null)?.benchmarkScore)
  const specScore = num((cpu.especificaciones as Record<string, unknown> | null)?.benchmarkScore)
  if (benchmark > 0) return { score: benchmark, source: "componente" }
  if (specScore > 0) return { score: specScore, source: "componente" }
  return { score: cpuScoreFromName(cpu.nombre), source: "heuristico" }
}

export function profileFromComponents(components: Component[]): FpsSystemProfile {
  const bySlot = new Map<string, Component>()
  for (const component of components) {
    if (!bySlot.has(component.categoria.slug)) bySlot.set(component.categoria.slug, component)
  }

  const gpuC = bySlot.get("gpu")
  const cpuC = bySlot.get("cpu")
  const ramC = bySlot.get("ram")
  const storageC = bySlot.get("storage")

  const gpu = gpuC ? estimateGpuScore(gpuC) : { score: 0, vramGB: null, source: "desconocido" as const }
  const cpu = cpuC ? estimateCpuScore(cpuC) : { score: 0, source: "desconocido" as const }

  const ramTipo = str(ramC ? (ramC.especificaciones as Record<string, unknown> | null)?.tipo : "")
  const ramSpeed = ramC ? num((ramC.especificaciones as Record<string, unknown> | null)?.frecuencia) : 0
  const storageTipo = storageC ? (storageC.especificaciones as Record<string, unknown> | null)?.tipo : ""
  const storageInterfaz = storageC
    ? (storageC.especificaciones as Record<string, unknown> | null)?.interfaz
    : ""

  return {
    gpu: gpu.score > 0 ? { name: gpuC?.nombre ?? "GPU", ...gpu } : null,
    cpu: cpu.score > 0 ? { name: cpuC?.nombre ?? "CPU", ...cpu } : null,
    ramGB: ramC ? num((ramC.especificaciones as Record<string, unknown> | null)?.capacidad) : 0,
    ramType:
      ramTipo.toUpperCase().includes("DDR5") ? "DDR5" : ramTipo.toUpperCase().includes("DDR4") ? "DDR4" : "Desconocido",
    ramSpeedMhz: ramSpeed || null,
    storageType: storageKindFromString(`${storageTipo} ${storageInterfaz}`),
  }
}

function isIntegratedGpuName(name: string): boolean {
  const n = name.toLowerCase()
  return (
    (n.includes("intel") && (n.includes("graphics") || n.includes("uhd") || n.includes("iris"))) ||
    n.includes("radeon graphics") ||
    n.includes("vega") ||
    n.includes(" apple")
  )
}

export function profileFromHardware(hw: HardwareInfo, matchedComponents: Component[] = []): FpsSystemProfile {
  const bySlot = new Map<string, Component>()
  for (const component of matchedComponents) {
    if (!bySlot.has(component.categoria.slug)) bySlot.set(component.categoria.slug, component)
  }

  const gpuC = bySlot.get("gpu")
  const cpuC = bySlot.get("cpu")
  const ramC = bySlot.get("ram")
  const storageC = bySlot.get("storage")

  const dedicatedGpu = hw.gpus.find((g) => !isIntegratedGpuName(g.name)) ?? hw.gpus[0]

  let gpuScore = 0
  let gpuSource: GpuScoreSource = "desconocido"
  let gpuVram: number | null = dedicatedGpu?.vramGB ?? null
  if (gpuC) {
    const est = estimateGpuScore(gpuC)
    gpuScore = est.score
    gpuSource = est.source
    gpuVram = est.vramGB ?? gpuVram
  } else if (dedicatedGpu) {
    gpuScore = gpuScoreFromName(dedicatedGpu.name)
    gpuSource = "heuristico"
    gpuVram = gpuVram ?? gpuVramFromName(dedicatedGpu.name)
  }

  let cpuScore = 0
  let cpuSource: CpuScoreSource = "desconocido"
  if (cpuC) {
    const est = estimateCpuScore(cpuC)
    cpuScore = est.score
    cpuSource = est.source
  } else if (hw.cpuModel && hw.cpuModel !== "Desconocido") {
    cpuScore = cpuScoreFromName(hw.cpuModel)
    cpuSource = "heuristico"
  }

  const ramTipo =
    (ramC && str((ramC.especificaciones as Record<string, unknown> | null)?.tipo)) || ""
  const ramSpeed = ramC ? num((ramC.especificaciones as Record<string, unknown> | null)?.frecuencia) : 0

  const primaryStorageStr = hw.storage[0]
  let storageKind: StorageKind = storageC
    ? storageKindFromString(
        `${str((storageC.especificaciones as Record<string, unknown> | null)?.tipo)} ${str((storageC.especificaciones as Record<string, unknown> | null)?.interfaz)}`,
      )
    : "Desconocido"
  if (primaryStorageStr) {
    const detectedKind = storageKindFromString(`${primaryStorageStr.type} ${primaryStorageStr.model}`)
    if (storageKind === "Desconocido" || storageC) storageKind = detectedKind
    if (!storageC) storageKind = detectedKind
  }

  return {
    gpu:
      gpuScore > 0
        ? { name: dedicatedGpu?.name ?? gpuC?.nombre ?? "GPU", score: gpuScore, vramGB: gpuVram, source: gpuSource }
        : null,
    cpu: cpuScore > 0 ? { name: hw.cpuModel || "CPU", score: cpuScore, source: cpuSource } : null,
    ramGB: ramC ? num((ramC.especificaciones as Record<string, unknown> | null)?.capacidad) : hw.totalMemoryGB,
    ramType:
      ramTipo.toUpperCase().includes("DDR5") ? "DDR5" : ramTipo.toUpperCase().includes("DDR4") ? "DDR4" : "Desconocido",
    ramSpeedMhz: ramSpeed || null,
    storageType: storageKind,
  }
}

// ───────────────────────── Rating de FPS ──────────────────────────

export function ratingForFps(avgFps: number): FpsRating {
  if (avgFps >= 240) return { tier: "extrema", label: "Potencia para 240Hz+", monitorHz: 240 }
  if (avgFps >= 144) return { tier: "144hz", label: "Ideal para monitores de 144Hz", monitorHz: 144 }
  if (avgFps >= 120) return { tier: "alta", label: "Listo para 120Hz", monitorHz: 120 }
  if (avgFps >= 60) return { tier: "fluida", label: "Fluido a 60 FPS", monitorHz: 60 }
  if (avgFps >= 30) return { tier: "jugable", label: "Jugable con concesiones", monitorHz: 30 }
  return { tier: "insuficiente", label: "No recomendado (<30 FPS)", monitorHz: 30 }
}

export function fluencyScore(avg: number, low1: number): number {
  const avgPart = Math.min(100, (avg / 240) * 100)
  const lowPart = Math.min(100, (low1 / 60) * 100)
  return Math.round(avgPart * 0.6 + lowPart * 0.4)
}

// ─────────────────────── Estimación por juego ─────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number): number {
  return Math.max(1, Math.round(value))
}

export function estimateGame(
  game: GameEntry,
  profile: FpsSystemProfile,
  resolution: FpsResolution,
  preset: FpsPreset,
): FpsEstimate {
  const gpu = profile.gpu
  const cpu = profile.cpu
  const warnings: string[] = []

  const missingGpu = !gpu || gpu.score <= 0
  const missingCpu = !cpu || cpu.score <= 0

  // Escalado por GPU (sub-lineal para no sobre-premiar GPUs tope).
  const gpuScore = missingGpu ? 20000 : gpu.score
  const gpuFactor = clamp((gpuScore / 20000) ** 0.85, 0.02, 12)

  const cpuScore = missingCpu ? 20000 : cpu.score
  const cpuFactor = clamp((cpuScore / 20000) ** 0.72, 0.02, 8)

  const resF = game.resScale[resolution] / game.resScale["1080p"]
  const presetF = game.presetScale[preset] / game.presetScale["Medio"]

  // FPS que puede entregar la GPU…
  const gpuAvg = game.refFps1080Medium * gpuFactor * resF * presetF

  // …y el techo que impone la CPU (apenas varía con la resolución).
  const cpuCeiling =
    (game.cpuCeilingBase * cpuFactor * (game.presetScale[preset] / game.presetScale["Bajo"])) *
    (0.92 + 0.08 * game.cpuBound)

  // RAM: capacidad frente a la recomendación del título.
  const ramRatio = profile.ramGB > 0 ? clamp(profile.ramGB / game.ramRecommendedGB, 0, 1.3) : 1
  let ramFactor = 0.74 + 0.26 * clamp(ramRatio, 0, 1)
  if (ramRatio >= 1) ramFactor += Math.min(0.03, (ramRatio - 1) * 0.03)
  if (profile.ramGB > 0 && profile.ramGB < game.ramRecommendedGB) {
    warnings.push(`RAM por debajo de la recomendación: ${profile.ramGB} GB < ${game.ramRecommendedGB} GB`)
  }

  // Velocidad/tipo de RAM: impacto extra cuando el título es CPU-bound.
  const ramTypeBonus = profile.ramType === "DDR5" ? 1.02 : profile.ramType === "DDR4" ? 1 : 1
  const speedDelta = profile.ramSpeedMhz ? (profile.ramSpeedMhz - 3200) / 3200 : 0
  const ramCpuBoost = 1 + (game.cpuBound * ramTypeBonus * clamp(speedDelta, -0.15, 0.25)) * 0.06

  // Almacenamiento: afecta sobre todo a los 1% Lows (streaming de texturas).
  const storageLowFactor =
    profile.storageType === "NVMe Gen5"
      ? 1
      : profile.storageType === "NVMe Gen4"
        ? 0.99
        : profile.storageType === "NVMe Gen3"
          ? 0.96
          : profile.storageType === "SSD SATA"
            ? 0.93
            : profile.storageType === "HDD"
              ? 0.7
              : 0.97

  // VRAM.
  const vramRequired = game.vram[preset]
  let vramFactor = 1
  let warningVram = false
  if (gpu && gpu.vramGB !== null && gpu.vramGB > 0 && gpu.vramGB < vramRequired) {
    vramFactor = 0.55 + 0.45 * (gpu.vramGB / vramRequired)
    warningVram = true
    warnings.push(`VRAM insuficiente: ${gpu.vramGB} GB para el preset ${preset} (recomienda ${vramRequired} GB)`)
  }

  // FPS efectivo: el menor entre GPU y CPU, ajustado por RAM.
  const gpuEffective = gpuAvg
  const cpuEffective = cpuCeiling * ramCpuBoost
  const limitedByGpu = gpuEffective <= cpuEffective && !missingGpu
  const avgFps = round(Math.min(gpuEffective, cpuEffective) * ramFactor * vramFactor)

  const bottleneck: FpsEstimate["bottleneck"] = missingGpu
    ? "GPU"
    : missingCpu
      ? "CPU"
      : warningVram
        ? "VRAM"
        : !limitedByGpu
          ? "CPU"
          : profile.ramGB > 0 && profile.ramGB < game.ramRecommendedGB
            ? "RAM"
            : storageLowFactor < 0.92
              ? "ALMACENAMIENTO"
              : "GPU"

  // 1% Lows.
  let lowRatio = limitedByGpu ? 0.8 : 0.64
  lowRatio *= 0.92 + 0.08 * ramFactor
  lowRatio *= storageLowFactor
  lowRatio *= vramFactor
  const low1 = round(avgFps * lowRatio * (limitedByGpu ? 1 : 0.95))

  if (missingGpu) warnings.push("Sin GPU confiable: se usó un factor de referencia.")
  if (missingCpu) warnings.push("Sin CPU confiable: se usó un factor de referencia.")
  if (profile.storageType === "HDD") warnings.push("Disco mecánico (HDD): los 1% Lows caerán por el streaming de texturas.")

  return {
    game,
    avgFps,
    low1Fps: low1,
    bottleneck,
    rating: ratingForFps(avgFps),
    warningVram,
    warnings,
  }
}

export interface FpsSummary {
  average: number
  total: number
  count60: number
  count144: number
}

export function estimateAll(
  profile: FpsSystemProfile,
  resolution: FpsResolution,
  preset: FpsPreset,
): FpsEstimate[] {
  return GAMES.map((game) => estimateGame(game, profile, resolution, preset))
}

export function summarizeEstimates(estimates: FpsEstimate[]): FpsSummary {
  const sum = estimates.reduce((acc, e) => acc + e.avgFps, 0)
  return {
    average: estimates.length > 0 ? Math.round(sum / estimates.length) : 0,
    total: estimates.length,
    count60: estimates.filter((e) => e.avgFps >= 60).length,
    count144: estimates.filter((e) => e.avgFps >= 144).length,
  }
}