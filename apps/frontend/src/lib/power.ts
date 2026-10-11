import type { Component } from "@/services/types"

const PSU_TIERS = [350, 450, 550, 650, 750, 850, 1000, 1200, 1600]

const BASE_LOAD_WATTS = {
  motherboard: 40,
  ramPerModule: 3,
  storageSsd: 6,
  storageHdd: 9,
  case: 10,
  coolerAir: 4,
  coolerAio: 12,
} as const

export interface PowerLine {
  slot: string
  name: string
  watts: number
}

export interface PowerBudget {
  estimatedWatts: number
  recommendedWatts: number
  headroomWatts: number
  loadPercent: number
  tier: string
  lines: PowerLine[]
  notes: string[]
}

function spec(component: Component | undefined, key: string): unknown {
  return (component?.especificaciones as Record<string, unknown> | null)?.[key]
}

function num(component: Component | undefined, key: string, fallback = 0): number {
  const value = Number(spec(component, key))
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function str(component: Component | undefined, key: string): string {
  const value = spec(component, key)
  return typeof value === "string" ? value.toLowerCase() : ""
}

function nextTier(watts: number): number {
  for (const tier of PSU_TIERS) {
    if (tier >= watts) return tier
  }
  return PSU_TIERS[PSU_TIERS.length - 1]
}

export function estimatePowerBudget(
  components: Component[],
  extraLines: PowerLine[] = [],
): PowerBudget {
  const bySlot = new Map<string, Component>()
  for (const component of components) {
    bySlot.set(component.categoria.slug, component)
  }

  const lines: PowerLine[] = []
  const notes: string[] = []
  let estimated = 0

  const cpu = bySlot.get("cpu")
  if (cpu) {
    const watts = num(cpu, "tdp") || 65
    lines.push({ slot: "Procesador", name: cpu.nombre, watts })
    estimated += watts
  }

  const gpu = bySlot.get("gpu")
  if (gpu) {
    const watts = num(gpu, "tdp") || 150
    lines.push({ slot: "Tarjeta gráfica", name: gpu.nombre, watts })
    estimated += watts
  }

  const motherboard = bySlot.get("motherboard")
  if (motherboard) {
    lines.push({ slot: "Placa madre", name: motherboard.nombre, watts: BASE_LOAD_WATTS.motherboard })
    estimated += BASE_LOAD_WATTS.motherboard
  }

  const ram = bySlot.get("ram")
  if (ram) {
    const modules = num(ram, "modulos", 2)
    const watts = Math.round(modules * BASE_LOAD_WATTS.ramPerModule)
    lines.push({ slot: "Memoria RAM", name: `${ram.nombre} (${modules} módulos)`, watts })
    estimated += watts
  }

  const storage = bySlot.get("storage")
  if (storage) {
    const isHdd = str(storage, "tipo").includes("hdd") || str(storage, "tipo").includes("mec")
    const watts = isHdd ? BASE_LOAD_WATTS.storageHdd : BASE_LOAD_WATTS.storageSsd
    lines.push({ slot: "Almacenamiento", name: storage.nombre, watts })
    estimated += watts
  }

  const caseComp = bySlot.get("case")
  if (caseComp) {
    lines.push({ slot: "Gabinete y ventiladores", name: caseComp.nombre, watts: BASE_LOAD_WATTS.case })
    estimated += BASE_LOAD_WATTS.case
  }

  const cooler = bySlot.get("cooler")
  if (cooler) {
    const isAio = /agua|liquid|aio/.test(str(cooler, "tipo"))
    const watts = isAio ? BASE_LOAD_WATTS.coolerAio : BASE_LOAD_WATTS.coolerAir
    lines.push({ slot: "Refrigeración", name: cooler.nombre, watts })
    estimated += watts
  }

  for (const extra of extraLines) {
    if (extra.watts <= 0) continue
    lines.push(extra)
    estimated += extra.watts
  }

  if (bySlot.has("psu")) {
    const psu = bySlot.get("psu")!
    notes.push(`Fuente seleccionada: ${num(psu, "watts", 0)}W ${str(psu, "certificacion").toUpperCase()}.`)
  }

  const loadPercent = 70
  const desired = Math.ceil((estimated / loadPercent) * 100)
  const recommended = nextTier(desired)
  const headroom = recommended - estimated

  if (estimated > 0 && recommended >= PSU_TIERS[PSU_TIERS.length - 1] && desired > recommended) {
    notes.push("El consumo supera las fuentes habituales; considera una fuente de 1600W o superior.")
  }

  const gpuTdp = gpu ? num(gpu, "tdp") : 0
  if (gpuTdp >= 250) {
    notes.push("GPU de alto consumo: revisa que la fuente tenga los conectores PCIe (12VHPWR/8-pin) necesarios.")
  }

  return {
    estimatedWatts: estimated,
    recommendedWatts: recommended,
    headroomWatts: headroom,
    loadPercent,
    tier: `${recommended} W 80+ Gold`,
    lines,
    notes,
  }
}

export function psuSupportsComponents(psuTemplate: Component, components: Component[]): boolean {
  const psuWatts = num(psuTemplate, "watts", 0)
  if (psuWatts <= 0) return true
  const { recommendedWatts } = estimatePowerBudget(components)
  return psuWatts >= recommendedWatts
}
