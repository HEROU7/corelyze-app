export interface Marca {
  id: string
  nombre: string
  slug: string
  logoUrl: string | null
  colorHex: string | null
  website: string | null
  createdAt: string
  updatedAt: string
}

export interface Categoria {
  id: string
  nombre: string
  slug: string
  descripcion: string | null
  icono: string | null
  createdAt: string
  updatedAt: string
}

export interface Component {
  id: string
  nombre: string
  slug: string
  sku: string
  descripcion: string | null
  marcaId: string
  categoriaId: string
  precio: string | null
  stock: number
  activo: boolean
  imagenUrl: string[]
  especificaciones: Record<string, unknown> | null
  datosTecnicos: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  marca: Marca
  categoria: Categoria
}

export type CategorySlug =
  | 'cpu'
  | 'motherboard'
  | 'ram'
  | 'gpu'
  | 'storage'
  | 'psu'
  | 'case'
  | 'cooler'

export interface ComponentQuery extends Record<string, string | number | undefined> {
  limit?: number
  offset?: number
  categoriaId?: string
  marcaId?: string
  search?: string
}

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export interface CompatibilityIssue {
  type: string
  severity: Severity
  component1?: string
  component2?: string
  description: string
  suggestion?: string
}

export interface CompatibilityResult {
  compatible: boolean
  issues: CompatibilityIssue[]
  warnings: CompatibilityIssue[]
  score: number
}

export type BottleneckKind = 'NONE' | 'CPU' | 'GPU' | 'RAM' | 'STORAGE' | 'BALANCED'

export interface BottleneckScore {
  bottleneckType: string
  percentage: number
  impact: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
}

export interface BottleneckAnalysis {
  overallBottleneck: BottleneckKind
  bottleneckPercentage: number
  cpuGpuBalance: {
    ratio: number
    classification: 'BALANCED' | 'CPU_LIMITED' | 'GPU_LIMITED'
  }
  resolutionAnalysis: {
    '1080p': BottleneckScore
    '1440p': BottleneckScore
    '4K': BottleneckScore
  }
  recommendations: string[]
}

export type BuildCategory = 'ENTRY' | 'MID_RANGE' | 'HIGH_END' | 'ULTRA' | 'CUSTOM'

export interface EnsambleComponente {
  id: string
  ensamblajeId: string
  componenteId: string
  cantidad: number
  posicion: string | null
  obligatorio: boolean
  notas: string | null
  componente: Component
}

export interface Build {
  id: string
  nombre: string
  slug: string
  descripcion: string | null
  categoria: BuildCategory
  casoUso: string[]
  puntuacionGlobal: string | null
  precioTotal: string | null
  pros: string[]
  contras: string[]
  imagenUrl: string | null
  especificaciones: Record<string, unknown> | null
  rendimiento: Record<string, unknown> | null
  configuracion: Record<string, unknown> | null
  activo: boolean
  destacado: boolean
  createdAt: string
  updatedAt: string
  componentes: EnsambleComponente[]
}

export const CATEGORY_LABELS: Record<CategorySlug, string> = {
  cpu: 'Procesador',
  motherboard: 'Placa Madre',
  ram: 'Memoria RAM',
  gpu: 'Tarjeta Gráfica',
  storage: 'Almacenamiento',
  psu: 'Fuente de Poder',
  case: 'Gabinete',
  cooler: 'Cooler',
}

export interface CreateBuildInput {
  nombre: string
  descripcion?: string
  categoria?: BuildCategory
  casoUso?: string[]
  pros?: string[]
  contras?: string[]
  resolucion?: string
  componentIds: string[]
}

export interface GpuInfo {
  name: string
  vramGB: number | null
}

export interface MotherboardInfo {
  manufacturer: string
  model: string
}

export interface StorageInfo {
  model: string
  type: 'SSD' | 'HDD' | 'Desconocido'
  capacityGB: number
  freeGB: number
  smartStatus?: 'OK' | 'Atencion' | 'Fallo' | 'N/A'
  predictFailure?: boolean
}

export interface DriverIssue {
  device: string
  class: string
  errorCode: number
  problem: string
  recommendation: string
}

export interface HardwareInfo {
  hostname: string
  platform: string
  os: string
  osVersion: string
  arch: string
  cpuModel: string
  cpuCores: number
  cpuLogical: number
  cpuSpeedGhz: number
  totalMemoryGB: number
  freeMemoryGB: number
  usedMemoryGB: number
  ramType?: string | null
  ramSpeedMhz?: number | null
  ramModules?: number | null
  gpus: GpuInfo[]
  motherboard: MotherboardInfo | null
  storage: StorageInfo[]
  driverIssues: DriverIssue[]
  source: 'tauri' | 'node' | 'browser'
}

export interface HardwareScanResult {
  scannedAt: string
  hardware: HardwareInfo
}