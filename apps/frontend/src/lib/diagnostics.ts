import type {
  BottleneckAnalysis,
  CategorySlug,
  Component,
  CompatibilityResult,
  HardwareInfo,
  Severity,
} from "@/services/types"

export interface DiagnosticPoint {
  id: string
  title: string
  detail: string
  severity: Severity
}

export interface UpgradeSuggestion {
  id: string
  title: string
  detail: string
  priority: "ALTA" | "MEDIA" | "BAJA"
}

export interface DiagnosticReport {
  score: number
  headline: string
  summary: string
  strengths: DiagnosticPoint[]
  concerns: DiagnosticPoint[]
  upgrades: UpgradeSuggestion[]
  matchedCount: number
}

const STOPWORDS = new Set([
  "amd",
  "intel",
  "nvidia",
  "core",
  "processor",
  "procesador",
  "cpu",
  "gpu",
  "tm",
  "r",
  "with",
  "con",
  "gen",
  "generation",
  "edition",
  "series",
  "graphics",
  "integrated",
])

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
}

function coverage(catalogName: string, detected: string[]): number {
  const catalogTokens = tokenize(catalogName)
  if (catalogTokens.length === 0) return 0
  const detectedSet = new Set(detected)
  const matches = catalogTokens.filter((t) => detectedSet.has(t)).length
  const hasModelNumber = catalogTokens.some((t) => /\d/.test(t))
  if (!hasModelNumber) return 0
  return matches / catalogTokens.length
}

function bestMatch(detected: string, candidates: Component[], threshold = 0.6): Component | null {
  const detectedTokens = tokenize(detected)
  if (detectedTokens.length === 0) return null
  let best: Component | null = null
  let bestScore = 0
  for (const candidate of candidates) {
    const score = coverage(candidate.nombre, detectedTokens)
    if (score >= threshold && (score > bestScore || (score === bestScore && best && candidate.nombre.length < best.nombre.length))) {
      best = candidate
      bestScore = score
    }
  }
  return best
}

function isIntegratedGpu(name: string): boolean {
  const n = name.toLowerCase()
  return (
    n.includes("intel") &&
    (n.includes("graphics") || n.includes("uhd") || n.includes("iris") || n.includes("hd graphics"))
  ) || n.includes("radeon graphics") || n.includes("vega") || n.includes("apple")
}

/**
 * Normaliza el estándar de memoria a DDR3/DDR4/DDR5. Tolerante a formatos
 * ("ddr-4", "DDR4 3200MHz", …). Devuelve null si no es determinable.
 */
function ramGeneration(value: unknown): "DDR3" | "DDR4" | "DDR5" | null {
  const token = String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
  if (token.includes("ddr5")) return "DDR5"
  if (token.includes("ddr4")) return "DDR4"
  if (token.includes("ddr3")) return "DDR3"
  return null
}

export interface MatchedHardware {
  ids: string[]
  bySlot: Partial<Record<CategorySlug, Component>>
}

export function matchDetectedHardware(
  hw: HardwareInfo,
  components: Component[],
): MatchedHardware {
  const byCategory = (slug: CategorySlug) =>
    components.filter((c) => c.categoria.slug === slug)
  const bySlot: Partial<Record<CategorySlug, Component>> = {}

  const cpu = bestMatch(hw.cpuModel, byCategory("cpu"))
  if (cpu) bySlot.cpu = cpu

  const dedicatedGpu =
    hw.gpus.find((g) => !isIntegratedGpu(g.name)) ?? hw.gpus[0]
  if (dedicatedGpu) {
    const gpu = bestMatch(dedicatedGpu.name, byCategory("gpu"))
    if (gpu) bySlot.gpu = gpu
  }

  if (hw.totalMemoryGB > 0) {
    const rams = byCategory("ram")
    const spec = (c: Component) => c.especificaciones as Record<string, unknown> | null

    // Si la telemetría/escanéo conoce el estándar detectado (DDR4/DDR5), solo
    // competimos contra módulos de la MISMA generación. Así evitamos emparejar
    // un equipo DDR4 con un módulo DDR5 del catálogo (falso RAM_TYPE_MISMATCH).
    const detectedGen = ramGeneration(hw.ramType)
    const sameGeneration = detectedGen
      ? rams.filter((c) => ramGeneration(spec(c)?.tipo) === detectedGen)
      : []
    const pool = sameGeneration.length > 0 ? sameGeneration : rams

    let best: Component | null = null
    let bestCapacityDelta = Number.POSITIVE_INFINITY
    let bestSpeedDelta = Number.POSITIVE_INFINITY
    for (const candidate of pool) {
      const capacity = Number(spec(candidate)?.capacidad ?? 0)
      const capacityDelta = Math.abs(capacity - hw.totalMemoryGB)
      const frequency = Number(spec(candidate)?.frecuencia ?? 0)
      const speedDelta =
        hw.ramSpeedMhz && frequency ? Math.abs(frequency - hw.ramSpeedMhz) : 0
      if (
        capacityDelta < bestCapacityDelta ||
        (capacityDelta === bestCapacityDelta && speedDelta < bestSpeedDelta)
      ) {
        best = candidate
        bestCapacityDelta = capacityDelta
        bestSpeedDelta = speedDelta
      }
    }
    if (best) bySlot.ram = best
  }

  if (hw.motherboard?.model) {
    const mb = bestMatch(
      `${hw.motherboard.manufacturer} ${hw.motherboard.model}`,
      byCategory("motherboard"),
      0.5,
    )
    if (mb) bySlot.motherboard = mb
  }

  const primaryStorage = hw.storage[0]
  if (primaryStorage?.model) {
    const storage = bestMatch(primaryStorage.model, byCategory("storage"), 0.5)
    if (storage) bySlot.storage = storage
  }

  const ids = Object.values(bySlot)
    .filter((c): c is Component => Boolean(c))
    .map((c) => c.id)

  return { ids: Array.from(new Set(ids)), bySlot }
}

interface DiagnosticInput {
  hw: HardwareInfo
  matched: MatchedHardware
  compat: CompatibilityResult | null
  bottleneck: BottleneckAnalysis | null
}

export function buildDiagnosticReport({
  hw,
  matched,
  compat,
  bottleneck,
}: DiagnosticInput): DiagnosticReport {
  const strengths: DiagnosticPoint[] = []
  const concerns: DiagnosticPoint[] = []
  const upgrades: UpgradeSuggestion[] = []
  let score = 100

  const totalStorage = hw.storage.reduce((acc, d) => acc + d.capacityGB, 0)
  const freeStorage = hw.storage.reduce((acc, d) => acc + d.freeGB, 0)
  const storageUsedPercent = totalStorage > 0 ? ((totalStorage - freeStorage) / totalStorage) * 100 : 0
  const hasSsd = hw.storage.some((d) => d.type === "SSD")
  const ramUsedPercent = hw.totalMemoryGB > 0 ? ((hw.totalMemoryGB - hw.freeMemoryGB) / hw.totalMemoryGB) * 100 : 0
  const dedicatedGpu = hw.gpus.find((g) => !isIntegratedGpu(g.name)) ?? null

  if (hw.cpuCores >= 8) {
    strengths.push({
      id: "cpu-cores",
      title: `Procesador de ${hw.cpuCores} núcleos / ${hw.cpuLogical} hilos`,
      detail: `El ${hw.cpuModel} ofrece buen paralelismo para gaming, multitarea y productividad.`,
      severity: "LOW",
    })
  } else if (hw.cpuCores > 0 && hw.cpuCores < 4) {
    score -= 15
    concerns.push({
      id: "cpu-cores-low",
      title: `Procesador de solo ${hw.cpuCores} núcleos`,
      detail: `Los títulos y aplicaciones actuales aprovechan 6+ núcleos; con ${hw.cpuCores} núcleos verás stutters y baja multitarea.`,
      severity: "HIGH",
    })
    upgrades.push({
      id: "up-cpu",
      title: "Actualizar el procesador",
      detail: "Un CPU de 6+ núcleos (p. ej. Ryzen 5 / Core i5) elevará los FPS mínimos y la fluidez general.",
      priority: "ALTA",
    })
  } else if (hw.cpuCores >= 4 && hw.cpuCores < 6) {
    score -= 6
    concerns.push({
      id: "cpu-cores-mid",
      title: `${hw.cpuCores} núcleos: justo para juegos modernos`,
      detail: "Puede limitar el framerate en juegos exigentes y al usar varias apps a la vez.",
      severity: "MEDIUM",
    })
  }

  if (hw.totalMemoryGB > 0 && hw.totalMemoryGB < 8) {
    score -= 18
    concerns.push({
      id: "ram-low",
      title: `Memoria RAM insuficiente (${hw.totalMemoryGB} GB)`,
      detail: "Menos de 8 GB provoca uso intensivo del archivo de paginación, cierres de apps y tirones en juegos.",
      severity: "HIGH",
    })
    upgrades.push({
      id: "up-ram-8",
      title: "Ampliar a 16 GB de RAM",
      detail: "Instala un kit de 16 GB (2 módulos) para habilitar Dual-Channel y eliminar el cuello de botella de memoria.",
      priority: "ALTA",
    })
  } else if (hw.totalMemoryGB >= 8 && hw.totalMemoryGB < 16) {
    score -= 8
    concerns.push({
      id: "ram-mid",
      title: `Memoria RAM limitada (${hw.totalMemoryGB} GB)`,
      detail: "8 GB es el mínimo para gaming ligero; los juegos actuales recomiendan 16 GB.",
      severity: "MEDIUM",
    })
    upgrades.push({
      id: "up-ram-16",
      title: "Añadir un módulo para llegar a 16 GB",
      detail: "Amplía en Dual-Channel (mismo módulo) para mejorar el ancho de banda y los FPS.",
      priority: "MEDIA",
    })
  } else if (hw.totalMemoryGB >= 32) {
    strengths.push({
      id: "ram-high",
      title: `${hw.totalMemoryGB} GB de RAM`,
      detail: "Memoria abundante para gaming, streaming y edición simultánea.",
      severity: "LOW",
    })
  }

  if (hw.totalMemoryGB > 0 && ramUsedPercent >= 85) {
    score -= 12
    concerns.push({
      id: "ram-usage",
      title: `Memoria al ${ramUsedPercent.toFixed(0)}% de uso`,
      detail: `Solo quedan ${hw.freeMemoryGB} GB libres de ${hw.totalMemoryGB} GB. Con la RAM casi saturada, el sistema recurre al disco y se ralentiza.`,
      severity: "HIGH",
    })
    upgrades.push({
      id: "up-ram-usage",
      title: "Cerrar apps en segundo plano o ampliar RAM",
      detail: "Libera memoria con el Administrador de tareas o añade más módulos para evitar el paginado en disco.",
      priority: "ALTA",
    })
  }

  if (hw.storage.length === 0) {
    concerns.push({
      id: "storage-unknown",
      title: "No se pudo leer el almacenamiento",
      detail: "No fue posible detectar los discos instalados en este equipo.",
      severity: "LOW",
    })
  } else if (!hasSsd) {
    score -= 12
    concerns.push({
      id: "storage-hdd",
      title: "Arranque y carga desde disco mecánico (HDD)",
      detail: "Un HDD es 5-10× más lento que un SSD: el sistema tarda más en arrancar y los juegos cargan muy lento.",
      severity: "HIGH",
    })
    upgrades.push({
      id: "up-ssd",
      title: "Migrar el sistema a un SSD NVMe",
      detail: "Un SSD NVMe reduce drásticamente los tiempos de arranque y carga. Clona el sistema al SSD nuevo.",
      priority: "ALTA",
    })
  } else {
    strengths.push({
      id: "storage-ssd",
      title: "Almacenamiento SSD detectado",
      detail: `${hw.storage.filter((d) => d.type === "SSD").length} unidad(es) SSD para arranque y carga rápida.`,
      severity: "LOW",
    })
  }

  if (totalStorage > 0 && storageUsedPercent >= 90) {
    score -= 10
    concerns.push({
      id: "storage-full",
      title: `Almacenamiento al ${storageUsedPercent.toFixed(0)}% de capacidad`,
      detail: `Solo quedan ${freeStorage.toFixed(0)} GB libres de ${totalStorage.toFixed(0)} GB. Un disco casi lleno degrada el rendimiento y arriesga tu información.`,
      severity: "HIGH",
    })
    upgrades.push({
      id: "up-storage",
      title: "Ampliar o limpiar el almacenamiento",
      detail: "Libera espacio o añade otra unidad para mantener al menos un 15% libre.",
      priority: "MEDIA",
    })
  }

  const driverIssues = hw.driverIssues ?? []
  if (driverIssues.length > 0) {
    for (const issue of driverIssues.slice(0, 6)) {
      const critical = [28, 43, 10, 31].includes(issue.errorCode)
      score -= critical ? 8 : 3
      concerns.push({
        id: `driver-${issue.errorCode}-${issue.device}`,
        title: `Controlador con problema: ${issue.device}`,
        detail: `Código ${issue.errorCode} (${issue.class}). ${issue.problem ? `${issue.problem} ` : ""}${issue.recommendation}`,
        severity: critical ? "HIGH" : "MEDIUM",
      })
      if ([28, 43].includes(issue.errorCode)) {
        upgrades.push({
          id: `up-driver-${issue.errorCode}-${issue.device}`,
          title: `Reinstalar driver de ${issue.device}`,
          detail: issue.recommendation,
          priority: "ALTA",
        })
      }
    }
    if (driverIssues.length > 6) {
      concerns.push({
        id: "driver-more",
        title: `${driverIssues.length - 6} dispositivos más con problemas de controlador`,
        detail: "Abre el Administrador de dispositivos y revisa los dispositivos marcados con signo de advertencia.",
        severity: "MEDIUM",
      })
    }
  }

  const failingDisks = hw.storage.filter((d) => d.predictFailure || d.smartStatus === "Fallo")
  const warningDisks = hw.storage.filter(
    (d) => !failingDisks.includes(d) && d.smartStatus === "Atencion",
  )
  const healthyDisks = hw.storage.filter((d) => d.smartStatus === "OK")
  if (failingDisks.length > 0) {
    score -= 25
    concerns.push({
      id: "smart-fail",
      title: `Riesgo de fallo de disco detectado (${failingDisks.length})`,
      detail: `${failingDisks.map((d) => d.model).join(", ")} reporta(n) salud S.M.A.R.T. crítica. Respalda tus datos ahora: el disco podría fallar pronto.`,
      severity: "CRITICAL",
    })
    upgrades.push({
      id: "up-smart-backup",
      title: "Respalda tus datos y reemplaza el disco",
      detail: "Un disco con fallo S.M.A.R.T. predicho puede dejar de funcionar sin aviso. Clona o copia la información urgente.",
      priority: "ALTA",
    })
  } else if (warningDisks.length > 0) {
    score -= 10
    concerns.push({
      id: "smart-warning",
      title: `Salud de disco degradada (${warningDisks.length})`,
      detail: `${warningDisks.map((d) => d.model).join(", ")} muestra(n) estado de precaución S.M.A.R.T. Verifica sectores y respalda por seguridad.`,
      severity: "HIGH",
    })
    upgrades.push({
      id: "up-smart-check",
      title: "Revisa la salud de tus discos",
      detail: "Ejecuta un chequeo S.M.A.R.T. completo (p. ej. CrystalDiskInfo) y respalda los datos importantes.",
      priority: "MEDIA",
    })
  } else if (healthyDisks.length > 0) {
    strengths.push({
      id: "smart-ok",
      title: `Salud S.M.A.R.T. correcta (${healthyDisks.length} disco(s))`,
      detail: "Los discos reportan un estado saludable sin fallos predichos.",
      severity: "LOW",
    })
  }

  if (hw.gpus.length === 0) {
    concerns.push({
      id: "gpu-none",
      title: "No se detectó tarjeta gráfica",
      detail: "Sin datos de GPU no es posible evaluar el rendimiento gráfico.",
      severity: "LOW",
    })
  } else if (!dedicatedGpu) {
    score -= 11
    concerns.push({
      id: "gpu-integrated",
      title: "Gráficos integrados (sin GPU dedicada)",
      detail: `${hw.gpus[0]?.name ?? "La GPU detectada"} es integrada: suficiente para ofimática, pero limita mucho el gaming y la edición.`,
      severity: "MEDIUM",
    })
    upgrades.push({
      id: "up-gpu",
      title: "Añadir una tarjeta gráfica dedicada",
      detail: "Una GPU dedicada (p. ej. RTX 4060 / RX 7600) multiplica el rendimiento en juegos y creación de contenido.",
      priority: "MEDIA",
    })
  } else {
    const vram = dedicatedGpu.vramGB
    if (vram !== null && vram >= 8) {
      strengths.push({
        id: "gpu-vram",
        title: `${dedicatedGpu.name} con ${vram} GB de VRAM`,
        detail: "VRAM suficiente para jugar en 1080p/1440p con texturas altas.",
        severity: "LOW",
      })
    } else {
      strengths.push({
        id: "gpu-present",
        title: `GPU dedicada detectada: ${dedicatedGpu.name}`,
        detail: vram !== null ? `${vram} GB de VRAM dedicada.` : "Tarjeta gráfica dedicada presente.",
        severity: "LOW",
      })
    }
  }

  if (compat && !compat.compatible) {
    score -= compat.issues.length * 6
    for (const issue of compat.issues) {
      concerns.push({
        id: `compat-${issue.type}`,
        title: `Incompatibilidad: ${issue.type}`,
        detail: issue.suggestion ? `${issue.description} ${issue.suggestion}` : issue.description,
        severity: issue.severity,
      })
    }
  } else if (compat && compat.compatible && compat.warnings.length === 0) {
    strengths.push({
      id: "compat-ok",
      title: "Componentes emparejados correctamente",
      detail: "No se detectaron incompatibilidades entre los componentes identificados.",
      severity: "LOW",
    })
  }

  if (bottleneck) {
    const pct = bottleneck.bottleneckPercentage
    if (pct >= 15) {
      score -= Math.min(20, Math.round(pct))
      concerns.push({
        id: "bottleneck",
        title: `Cuello de botella del ${pct}% (${bottleneck.overallBottleneck})`,
        detail: `Existe un desequilibrio entre CPU y GPU. ${bottleneck.recommendations[0] ?? ""}`.trim(),
        severity: pct >= 20 ? "HIGH" : "MEDIUM",
      })
    } else {
      strengths.push({
        id: "bottleneck-ok",
        title: "Sistema equilibrado CPU/GPU",
        detail: `Desbalance bajo (${pct}%). La combinación de procesador y gráfica está bien balanceada.`,
        severity: "LOW",
      })
    }
    for (const rec of bottleneck.recommendations) {
      if (rec.toLowerCase().includes("ram")) {
        upgrades.push({
          id: "up-ram-bottleneck",
          title: "Ampliar memoria RAM",
          detail: rec,
          priority: "MEDIA",
        })
      }
    }
  }

  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  const headline =
    clamped >= 85
      ? "Equipo en excelente estado"
      : clamped >= 70
        ? "Equipo sólido con mejoras recomendadas"
        : clamped >= 50
          ? "Equipo funcional con puntos de atención"
          : "Equipo con limitaciones importantes"

  const summary =
    `${hw.hostname}: ${hw.cpuCores} núcleos / ${hw.cpuLogical} hilos, ${hw.totalMemoryGB} GB de RAM` +
    (dedicatedGpu ? `, ${dedicatedGpu.name}` : "") +
    (hasSsd ? ", almacenamiento SSD." : hw.storage.length > 0 ? ", almacenamiento mecánico." : ".")

  return {
    score: clamped,
    headline,
    summary,
    strengths,
    concerns,
    upgrades,
    matchedCount: matched.ids.length,
  }
}
