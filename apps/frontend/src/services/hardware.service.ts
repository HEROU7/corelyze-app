import { apiClient } from '@/lib/api/client';
import type {
  BottleneckAnalysis,
  Build,
  Categoria,
  Component,
  ComponentQuery,
  CompatibilityResult,
  CreateBuildInput,
  HardwareInfo,
  HardwareScanResult,
  Marca,
} from '@/services/types';

function toQuery(params?: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        search.append(key, String(value))
      }
    }
  }
  return search.toString()
}

/**
 * El backend (`GET /api/hardware/scan`) devuelve un `HardwareReport` plano
 * (hostname, cpuModel, gpus, …) sin envolver. El frontend espera
 * `HardwareScanResult = { scannedAt, hardware }`. Aquí normalizamos/rellenamos
 * para que jamás falte la propiedad `hardware` ni sus campos anidados.
 */
function toHardwareInfo(raw: Record<string, unknown> | null | undefined): HardwareInfo {
  const r = raw ?? {}
  const total = Number(r.totalMemoryGB) || 0
  const free = Number(r.freeMemoryGB) || 0
  const used = Number(r.usedMemoryGB) || Math.max(0, total - free)

  return {
    hostname: typeof r.hostname === 'string' && r.hostname ? r.hostname : 'Desconocido',
    platform: typeof r.platform === 'string' && r.platform ? r.platform : 'Desconocido',
    os: typeof r.os === 'string' && r.os ? r.os : 'Desconocido',
    osVersion: typeof r.osVersion === 'string' ? r.osVersion : '',
    arch: typeof r.arch === 'string' && r.arch ? r.arch : '—',
    cpuModel: typeof r.cpuModel === 'string' && r.cpuModel ? r.cpuModel : 'Desconocido',
    cpuCores: Number(r.cpuCores) || 0,
    cpuLogical: Number(r.cpuLogical) || 0,
    cpuSpeedGhz: Number(r.cpuSpeedGhz) || 0,
    totalMemoryGB: total,
    freeMemoryGB: free,
    usedMemoryGB: used,
    ramType: typeof r.ramType === 'string' ? r.ramType : null,
    ramSpeedMhz: Number.isFinite(Number(r.ramSpeedMhz)) && Number(r.ramSpeedMhz) > 0 ? Number(r.ramSpeedMhz) : null,
    ramModules: Number.isFinite(Number(r.ramModules)) && Number(r.ramModules) > 0 ? Number(r.ramModules) : null,
    gpus: Array.isArray(r.gpus) ? (r.gpus as HardwareInfo['gpus']) : [],
    motherboard: (r.motherboard as HardwareInfo['motherboard']) ?? null,
    storage: Array.isArray(r.storage) ? (r.storage as HardwareInfo['storage']) : [],
    driverIssues: Array.isArray(r.driverIssues)
      ? (r.driverIssues as HardwareInfo['driverIssues'])
      : [],
    source: r.source === 'tauri' || r.source === 'browser' ? r.source : 'node',
  }
}

async function fetchScanResult(): Promise<HardwareScanResult> {
  const raw = await apiClient<unknown>('/hardware/scan');
  const obj = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null;
  const scannedAt =
    typeof obj?.scannedAt === 'string' && obj.scannedAt ? obj.scannedAt : new Date().toISOString();

  // Algunos entornos pueden devolver ya el objeto anidado; igual lo normalizamos.
  const nested = obj?.hardware;
  const hardware = toHardwareInfo(
    (nested && typeof nested === 'object' ? nested : obj) as Record<string, unknown>,
  );

  return { scannedAt, hardware };
}

export const hardwareService = {
  getComponents: (params?: ComponentQuery) =>
    apiClient<Component[]>('/components?' + toQuery(params)),
  getComponentById: (id: string) => apiClient<Component>(`/components/${id}`),
  searchComponents: (q: string) =>
    apiClient<Component[]>(`/components/search?q=${encodeURIComponent(q)}`),
  getCategories: () => apiClient<Categoria[]>('/categories'),
  getMarcas: () => apiClient<Marca[]>('/marcas'),
  getBuilds: (params?: Record<string, string | number | undefined>) =>
    apiClient<Build[]>('/builds?' + toQuery(params)),
  getFeaturedBuilds: () => apiClient<Build[]>('/builds/featured'),
  getBuildBySlug: (slug: string) => apiClient<Build>(`/builds/slug/${slug}`),
  createBuild: (data: CreateBuildInput) =>
    apiClient<Build>('/builds', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateBuild: (id: string, data: Partial<CreateBuildInput>) =>
    apiClient<Build>(`/builds/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteBuild: (id: string) =>
    apiClient<void>(`/builds/${id}`, {
      method: 'DELETE',
    }),
  scanHardware: () => fetchScanResult(),
  validateCompatibility: (componentIds: string[]) =>
    apiClient<CompatibilityResult>('/validation/compatibility', {
      method: 'POST',
      body: JSON.stringify({ componentIds }),
    }),
  analyzeBottlenecks: (data: {
    cpuId: string;
    gpuId: string;
    ramIds: string[];
    resolution?: '1080p' | '1440p' | '4K';
  }) =>
    apiClient<BottleneckAnalysis>('/validation/bottlenecks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};