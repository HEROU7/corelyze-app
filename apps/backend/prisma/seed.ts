import { PrismaClient } from '@prisma/client';
import { catalog, SeedComponent } from './seed-data';

const prisma = new PrismaClient();

interface RecommendedBuild {
  nombre: string;
  slug: string;
  descripcion: string;
  categoria: string;
  casoUso: string[];
  puntuacionGlobal: number;
  resolucion: '1080p' | '1440p' | '4K';
  pros: string[];
  contras: string[];
  destacado?: boolean;
  componentes: { categoria: string; nombre: string }[];
}

const num = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const specsOf = (c: SeedComponent): Record<string, any> =>
  (c.especificaciones as Record<string, any>) ?? {};
const techOf = (c: SeedComponent): Record<string, any> =>
  (c.datosTecnicos as Record<string, any>) ?? {};

const tierOfScore = (score: number): 'ENTRY' | 'MID_RANGE' | 'HIGH_END' | 'ULTRA' => {
  if (score >= 33000) return 'ULTRA';
  if (score >= 23000) return 'HIGH_END';
  if (score >= 13000) return 'MID_RANGE';
  return 'ENTRY';
};

const TIER_CONFIG = {
  ENTRY: { ram: 16, res: '1080p' as const, score: 4.2, gpuMax: 18000 },
  MID_RANGE: { ram: 32, res: '1440p' as const, score: 4.5, gpuMax: 27000 },
  HIGH_END: { ram: 32, res: '1440p' as const, score: 4.7, gpuMax: 35000 },
  ULTRA: { ram: 64, res: '4K' as const, score: 4.9, gpuMax: 99999 },
};

/**
 * Genera programáticamente 100+ ensambles recomendados combinando
 * componentes válidos del catálogo (socket, tipo de RAM, energía,
 * espacio del gabinete y compatibilidad del cooler).
 */
export function composeRecommendedBuilds(): RecommendedBuild[] {
  const pool = (slug: string) => catalog.filter((c) => c.categoriaSlug === slug);
  const cpus = pool('cpu');
  const motherboardPool = pool('motherboard');
  const ramPool = pool('ram');
  const gpuPool = pool('gpu');
  const storagePool = pool('storage');
  const psuPool = pool('psu');
  const casePool = pool('case');
  const coolerPool = pool('cooler');

  const result: RecommendedBuild[] = [];
  const usedSlugs = new Set<string>();

  const makeSlug = (base: string): string => {
    let slug = base.replace(/^-+|-+$/g, '') || 'ensamble';
    let n = 2;
    while (usedSlugs.has(slug)) slug = `${base}-${n++}`;
    usedSlugs.add(slug);
    return slug;
  };

  const rotate = <T>(arr: T[], index: number): T | null =>
    arr.length > 0 ? arr[index % arr.length] : null;

  const hasIntegratedGraphics = (cpu: SeedComponent): boolean => {
    const name = cpu.nombre;
    if (name.includes('G')) return true;
    if (cpu.marcaSlug === 'intel' && !name.includes('F')) return true;
    return false;
  };

  cpus.forEach((cpu, index) => {
    const cpuSpec = specsOf(cpu);
    const cpuTech = techOf(cpu);
    const socket = String(cpuSpec.socket ?? '');
    const ramType = String(cpuSpec.ramType ?? '');
    const cpuTdp = num(cpuSpec.tdp, 65);
    const cpuScore = num(cpuTech.benchmarkScore, 15000);
    const tier = tierOfScore(cpuScore);
    const config = TIER_CONFIG[tier];

    const compatibleMbs = motherboardPool.filter(
      (mb) => specsOf(mb).socket === socket && specsOf(mb).tipoRam === ramType,
    );
    const motherboard = rotate(compatibleMbs, index);
    if (!motherboard) return;

    const compatibleRams = ramPool.filter((r) => specsOf(r).tipo === ramType);
    const ramByCapacity = (capacity: number): (typeof ramPool)[number] | null => {
      const exact = compatibleRams.filter((r) => num(specsOf(r).capacidad) === capacity);
      if (exact.length > 0) return rotate(exact, index);
      const sorted = [...compatibleRams].sort(
        (a, b) =>
          Math.abs(num(specsOf(a).capacidad) - capacity) -
          Math.abs(num(specsOf(b).capacidad) - capacity),
      );
      return sorted[0] ?? null;
    };

    const gpusForTier = gpuPool.filter((g) => num(techOf(g).benchmarkScore) <= config.gpuMax);
    const gpuLadder = [...(gpusForTier.length > 0 ? gpusForTier : gpuPool)].sort(
      (a, b) => num(techOf(a).benchmarkScore) - num(techOf(b).benchmarkScore),
    );

    const storageForTier = (): SeedComponent | null => {
      if (tier === 'ULTRA' || tier === 'HIGH_END') {
        const nvme = storagePool.filter((s) => String(specsOf(s).tipo).includes('Gen4') || String(specsOf(s).tipo).includes('Gen5'));
        const chosen = rotate(nvme.length > 0 ? nvme : storagePool, index);
        return chosen ?? null;
      }
      const nvme = storagePool.filter((s) => String(specsOf(s).tipo).includes('NVMe'));
      return rotate(nvme.length > 0 ? nvme : storagePool, index);
    };

    const pickPsu = (tdp: number): SeedComponent | null => {
      const required = Math.ceil((tdp + 50) * 1.25);
      const sorted = [...psuPool].sort((a, b) => num(specsOf(a).watts) - num(specsOf(b).watts));
      return sorted.find((p) => num(specsOf(p).watts) >= required) ?? sorted[sorted.length - 1] ?? null;
    };

    const pickCase = (gpu: SeedComponent | null, cooler: SeedComponent | null): SeedComponent | null => {
      const gpuLength = gpu ? num(specsOf(gpu).longitud) : 0;
      const coolerHeight = cooler ? num(specsOf(cooler).altura) : 0;
      const candidates = casePool.filter((c) => {
        const maxGpu = num(specsOf(c).maxGpuLength, 0);
        const maxCooler = num(specsOf(c).maxCoolerHeight, 0);
        return (gpuLength === 0 || maxGpu >= gpuLength) && (coolerHeight === 0 || maxCooler >= coolerHeight);
      });
      return rotate(candidates.length > 0 ? candidates : casePool, index);
    };

    const pickCooler = (): SeedComponent | null => {
      const preferred = coolerPool.filter((c) => {
        const sockets = techOf(c).sockets;
        return Array.isArray(sockets) && sockets.includes(socket) && num(specsOf(c).tdp) >= cpuTdp;
      });
      if (preferred.length > 0) return rotate(preferred, index);
      const anySocket = coolerPool.filter((c) => {
        const sockets = techOf(c).sockets;
        return Array.isArray(sockets) && sockets.includes(socket);
      });
      return rotate(anySocket.length > 0 ? anySocket : coolerPool, index);
    };

    const cooler = pickCooler();
    const ramAmount = ramByCapacity(config.ram);

    // ── Variante 1: Gaming / Streaming ──
    const gamingGpuIndex =
      tier === 'ULTRA'
        ? gpuLadder.length - 1 - (index % 3)
        : Math.max(0, gpuLadder.length - 1 - (index % Math.max(1, Math.floor(gpuLadder.length / 2))));
    const gamingGpu = gpuLadder[gamingGpuIndex < 0 ? 0 : gamingGpuIndex] ?? null;
    const gamingCase = pickCase(gamingGpu, cooler);
    const gamingPsu = pickPsu(cpuTdp + (gamingGpu ? num(specsOf(gamingGpu).tdp) : 0));
    const gamingStorage = storageForTier();
    const gamingRes = config.res;

    const gamingComponents: { categoria: string; nombre: string }[] = [
      { categoria: 'cpu', nombre: cpu.nombre },
      { categoria: 'motherboard', nombre: motherboard.nombre },
    ];
    if (ramAmount) gamingComponents.push({ categoria: 'ram', nombre: ramAmount.nombre });
    if (gamingGpu) gamingComponents.push({ categoria: 'gpu', nombre: gamingGpu.nombre });
    if (gamingStorage) gamingComponents.push({ categoria: 'storage', nombre: gamingStorage.nombre });
    if (gamingPsu) gamingComponents.push({ categoria: 'psu', nombre: gamingPsu.nombre });
    if (gamingCase) gamingComponents.push({ categoria: 'case', nombre: gamingCase.nombre });
    if (cooler) gamingComponents.push({ categoria: 'cooler', nombre: cooler.nombre });

    const gamingUse: string[] =
      tier === 'ULTRA' || tier === 'HIGH_END'
        ? ['GAMING', 'STREAMING', 'RENDERING']
        : tier === 'MID_RANGE'
          ? ['GAMING', 'STREAMING']
          : ['GAMING'];

    result.push({
      nombre: `${tier === 'ENTRY' ? 'Gaming Inicial' : 'Gaming'} ${gamingRes} · ${cpu.nombre}`,
      slug: makeSlug(`rec-${cpu.slug}-gaming`),
      descripcion: `Ensamble ${gamingRes} basado en ${cpu.nombre}${gamingGpu ? ` y ${gamingGpu.nombre}` : ''}, equilibrado para máximo rendimiento por dólar.`,
      categoria: tier,
      casoUso: gamingUse,
      puntuacionGlobal: Math.round((config.score + ((index % 5) - 2) * 0.05) * 100) / 100,
      resolucion: gamingRes,
      pros: [
        'Combinación equilibrada CPU/GPU',
        tier === 'ENTRY' ? 'Excelente relación precio/rendimiento' : 'Amplio margen de actualización',
        'Componentes compatibles verificados',
      ],
      contras: [tier === 'ENTRY' ? 'Limitado para 1440p/4K' : 'Presupuesto medio-alto'],
      destacado: index % 7 === 0,
      componentes: gamingComponents,
    });

    // ── Variante 2: Productividad / Oficina / Workstation ──
    const productivityUse =
      tier === 'ULTRA' || tier === 'HIGH_END'
        ? ['WORKSTATION', 'EDITING', 'RENDERING']
        : tier === 'MID_RANGE'
          ? ['EDITING', 'OFFICE', 'GENERAL']
          : ['OFFICE', 'GENERAL'];

    const prodGpu = hasIntegratedGraphics(cpu) && tier === 'ENTRY' ? null : gpuLadder[Math.floor(gpuLadder.length / 3)] ?? gamingGpu;
    const prodCase = pickCase(prodGpu, cooler);
    const prodPsu = pickPsu(cpuTdp + (prodGpu ? num(specsOf(prodGpu).tdp) : 0));
    const prodStorage = storageForTier();

    const prodComponents: { categoria: string; nombre: string }[] = [
      { categoria: 'cpu', nombre: cpu.nombre },
      { categoria: 'motherboard', nombre: motherboard.nombre },
    ];
    if (ramAmount) prodComponents.push({ categoria: 'ram', nombre: ramAmount.nombre });
    if (prodGpu) prodComponents.push({ categoria: 'gpu', nombre: prodGpu.nombre });
    if (prodStorage) prodComponents.push({ categoria: 'storage', nombre: prodStorage.nombre });
    if (prodPsu) prodComponents.push({ categoria: 'psu', nombre: prodPsu.nombre });
    if (prodCase) prodComponents.push({ categoria: 'case', nombre: prodCase.nombre });
    if (cooler) prodComponents.push({ categoria: 'cooler', nombre: cooler.nombre });

    result.push({
      nombre: `${tier === 'ENTRY' ? 'Oficina' : tier === 'MID_RANGE' ? 'Productividad' : 'Workstation'} · ${cpu.nombre}`,
      slug: makeSlug(`rec-${cpu.slug}-pro`),
      descripcion: `Ensemble para productividad${prodGpu ? '' : ' con gráficos integrados'} basado en ${cpu.nombre}, optimizado para trabajo y creación de contenido.`,
      categoria: tier,
      casoUso: productivityUse,
      puntuacionGlobal: Math.round((config.score - 0.1 + ((index % 4) - 2) * 0.05) * 100) / 100,
      resolucion: prodGpu ? config.res : '1080p',
      pros: [
        'Enfocado en productividad y multitarea',
        prodGpu ? 'Gráficos dedicados para aceleración' : 'Bajo consumo y silencioso',
        'Ampliable en el futuro',
      ],
      contras: [prodGpu ? 'No prioriza máximos FPS' : 'Gaming limitado a 1080p bajo'],
      componentes: prodComponents,
    });
  });

  return result;
}


async function main() {
  console.log('🌱 Iniciando seed...');

  // Marcas
  const marcas = [
    { nombre: 'Intel', slug: 'intel', colorHex: '#0068B5' },
    { nombre: 'AMD', slug: 'amd', colorHex: '#ED1C24' },
    { nombre: 'NVIDIA', slug: 'nvidia', colorHex: '#76B900' },
    { nombre: 'Corsair', slug: 'corsair', colorHex: '#000000' },
    { nombre: 'ASUS', slug: 'asus', colorHex: '#00539B' },
    { nombre: 'MSI', slug: 'msi', colorHex: '#C8102E' },
    { nombre: 'Gigabyte', slug: 'gigabyte', colorHex: '#F47920' },
    { nombre: 'ASRock', slug: 'asrock', colorHex: '#1E9BD7' },
    { nombre: 'Samsung', slug: 'samsung', colorHex: '#1428A0' },
    { nombre: 'Kingston', slug: 'kingston', colorHex: '#000000' },
    { nombre: 'Crucial', slug: 'crucial', colorHex: '#2E3192' },
    { nombre: 'G.Skill', slug: 'gskill', colorHex: '#C8102E' },
    { nombre: 'TeamGroup', slug: 'teamgroup', colorHex: '#E4002B' },
    { nombre: 'Patriot', slug: 'patriot', colorHex: '#0A0A0A' },
    { nombre: 'Seagate', slug: 'seagate', colorHex: '#6C6F7F' },
    { nombre: 'Western Digital', slug: 'wd', colorHex: '#0B0B0B' },
    { nombre: 'Toshiba', slug: 'toshiba', colorHex: '#E60012' },
    { nombre: 'be quiet!', slug: 'be-quiet', colorHex: '#000000' },
    { nombre: 'Noctua', slug: 'noctua', colorHex: '#3D2B1F' },
    { nombre: 'Cooler Master', slug: 'cooler-master', colorHex: '#1A1A1A' },
    { nombre: 'NZXT', slug: 'nzxt', colorHex: '#4B0082' },
    { nombre: 'Thermaltake', slug: 'thermaltake', colorHex: '#C8102E' },
    { nombre: 'Lian Li', slug: 'lian-li', colorHex: '#000000' },
    { nombre: 'Fractal Design', slug: 'fractal-design', colorHex: '#333333' },
    { nombre: 'Phanteks', slug: 'phanteks', colorHex: '#000000' },
    { nombre: 'Antec', slug: 'antec', colorHex: '#F5A623' },
    { nombre: 'DeepCool', slug: 'deepcool', colorHex: '#00A0E9' },
    { nombre: 'Arctic', slug: 'arctic', colorHex: '#00A3E0' },
    { nombre: 'Scythe', slug: 'scythe', colorHex: '#000000' },
    { nombre: 'EVGA', slug: 'evga', colorHex: '#000000' },
    { nombre: 'Seasonic', slug: 'seasonic', colorHex: '#00417D' },
    { nombre: 'FSP', slug: 'fsp', colorHex: '#00539B' },
    { nombre: 'Super Flower', slug: 'super-flower', colorHex: '#C8102E' },
    { nombre: 'Montech', slug: 'montech', colorHex: '#00A0E9' },
    { nombre: 'Sapphire', slug: 'sapphire', colorHex: '#002D62' },
    { nombre: 'PowerColor', slug: 'powercolor', colorHex: '#E4002B' },
    { nombre: 'XFX', slug: 'xfx', colorHex: '#C8102E' },
    { nombre: 'Zotac', slug: 'zotac', colorHex: '#FFD100' },
    { nombre: 'PNY', slug: 'pny', colorHex: '#0033A0' },
    { nombre: 'ADATA', slug: 'adata', colorHex: '#E4002B' },
    { nombre: 'Thermalright', slug: 'thermalright', colorHex: '#000000' },
  ];

  for (const marca of marcas) {
    await prisma.marca.upsert({
      where: { slug: marca.slug },
      update: {},
      create: marca,
    });
  }
  console.log(`✓ Marcas creadas (${marcas.length})`);

  // Categorías
  const categorias = [
    { nombre: 'Procesadores', slug: 'cpu', icono: 'cpu' },
    { nombre: 'Tarjetas Madre', slug: 'motherboard', icono: 'motherboard' },
    { nombre: 'Memoria RAM', slug: 'ram', icono: 'ram' },
    { nombre: 'Tarjetas Gráficas', slug: 'gpu', icono: 'gpu' },
    { nombre: 'Almacenamiento', slug: 'storage', icono: 'storage' },
    { nombre: 'Fuentes de Poder', slug: 'psu', icono: 'psu' },
    { nombre: 'Gabinetes', slug: 'case', icono: 'case' },
    { nombre: 'Refrigeración', slug: 'cooler', icono: 'cooler' },
  ];

  for (const categoria of categorias) {
    await prisma.categoria.upsert({
      where: { slug: categoria.slug },
      update: {},
      create: categoria,
    });
  }
  console.log('✓ Categorías creadas');

  // Componentes
  const marcasMap = new Map((await prisma.marca.findMany()).map((m) => [m.slug, m.id]));
  const categoriasMap = new Map((await prisma.categoria.findMany()).map((c) => [c.slug, c.id]));

  const catalogSlugs = catalog.map((c) => c.slug);
  const eliminados = await prisma.componente.deleteMany({
    where: { slug: { notIn: catalogSlugs } },
  });
  if (eliminados.count > 0) {
    console.log(`✓ Componentes fuera de catálogo eliminados (${eliminados.count})`);
  }

  let creados = 0;
  const faltantes = new Set<string>();
  for (const comp of catalog) {
    const { marcaSlug, categoriaSlug, ...data } = comp;
    const marcaId = marcasMap.get(marcaSlug);
    const categoriaId = categoriasMap.get(categoriaSlug);
    if (!marcaId || !categoriaId) {
      faltantes.add(!marcaId ? `marca:${marcaSlug}` : `categoria:${categoriaSlug}`);
      continue;
    }
    await prisma.componente.upsert({
      where: { slug: data.slug },
      update: {},
      create: {
        nombre: data.nombre,
        slug: data.slug,
        sku: data.sku,
        descripcion: data.descripcion,
        precio: data.precio,
        stock: data.stock,
        marcaId,
        categoriaId,
        imagenUrl: '[]',
        especificaciones: JSON.stringify(data.especificaciones ?? {}),
        datosTecnicos: JSON.stringify(data.datosTecnicos ?? {}),
        metadata: JSON.stringify(data.metadata ?? {}),
      },
    });
    creados += 1;
  }
  if (faltantes.size > 0) {
    console.warn(`⚠ Referencias no encontradas: ${[...faltantes].join(', ')}`);
  }
  console.log(`✓ Componentes creados (${creados}/${catalog.length})`);

  // ─────────────────────── Builds recomendadas ───────────────────────
  const compByKey = new Map<string, string>();
  for (const c of catalog) {
    compByKey.set(`${c.categoriaSlug}|${c.nombre}`, c.slug);
  }

  type BuildSeed = {
    nombre: string;
    slug: string;
    descripcion: string;
    categoria: string;
    casoUso: string[];
    puntuacionGlobal: number;
    resolucion: '1080p' | '1440p' | '4K';
    pros: string[];
    contras: string[];
    destacado?: boolean;
    componentes: { categoria: string; nombre: string }[];
  };

  const builds: BuildSeed[] = [
    {
      nombre: 'Oficina Esencial AMD',
      slug: 'oficina-esencial-amd',
      descripcion: 'Equipo económico y silencioso con APU Ryzen 5 5600G, ideal para ofimática y multimedia.',
      categoria: 'ENTRY',
      casoUso: ['OFFICE', 'GENERAL'],
      puntuacionGlobal: 4.2,
      resolucion: '1080p',
      pros: ['Gráficos integrados sin GPU dedicada', 'Bajo consumo', 'Buen precio'],
      contras: ['Poco margen para gaming exigente'],
      componentes: [
        { categoria: 'cpu', nombre: 'Ryzen 5 5600G' },
        { categoria: 'motherboard', nombre: 'PRO B550-A Pro' },
        { categoria: 'ram', nombre: 'Vengeance LPX DDR4 16GB (2x8) 3200MHz' },
        { categoria: 'storage', nombre: 'A400 960GB SATA' },
        { categoria: 'psu', nombre: 'CV550 550W' },
        { categoria: 'case', nombre: 'NX210' },
      ],
    },
    {
      nombre: 'Oficina Esencial Intel',
      slug: 'oficina-esencial-intel',
      descripcion: 'Plataforma Intel LGA1700 con DDR5 de entrada para tareas de productividad diaria.',
      categoria: 'ENTRY',
      casoUso: ['OFFICE', 'GENERAL'],
      puntuacionGlobal: 4.1,
      resolucion: '1080p',
      pros: ['DDR5 a bajo costo', 'Rendimiento single-core sólido'],
      contras: ['Tarjeta gráfica modesta'],
      componentes: [
        { categoria: 'cpu', nombre: 'Core i3-12100F' },
        { categoria: 'motherboard', nombre: 'Prime H610M-E' },
        { categoria: 'ram', nombre: 'Fury Beast DDR5 16GB (2x8) 5600MHz' },
        { categoria: 'gpu', nombre: 'GeForce GTX 1650 4GB' },
        { categoria: 'storage', nombre: 'Blue SN570 1TB NVMe' },
        { categoria: 'psu', nombre: 'CV550 550W' },
        { categoria: 'case', nombre: 'Matrexx 40' },
      ],
    },
    {
      nombre: 'Gaming 1080p AMD',
      slug: 'gaming-1080p-amd',
      descripcion: 'Configuración AM4 equilibrada para jugar a 1080p en alto con excelente relación precio/rendimiento.',
      categoria: 'MID_RANGE',
      casoUso: ['GAMING'],
      puntuacionGlobal: 4.4,
      resolucion: '1080p',
      pros: ['Gran valor por dinero', 'Fácil de actualizar', 'Temperaturas contenidas'],
      contras: ['Plataforma AM4 de fin de ciclo'],
      destacado: true,
      componentes: [
        { categoria: 'cpu', nombre: 'Ryzen 5 5600' },
        { categoria: 'motherboard', nombre: 'TUF Gaming B550-Plus' },
        { categoria: 'ram', nombre: 'Ripjaws V DDR4 32GB (2x16) 3600MHz' },
        { categoria: 'gpu', nombre: 'Radeon RX 6600 8GB' },
        { categoria: 'storage', nombre: '980 Pro 1TB NVMe' },
        { categoria: 'psu', nombre: 'RM650e 650W' },
        { categoria: 'case', nombre: '4000D Airflow' },
        { categoria: 'cooler', nombre: 'AK400' },
      ],
    },
    {
      nombre: 'Gaming 1080p Intel',
      slug: 'gaming-1080p-intel',
      descripcion: 'Intel LGA1700 con DDR5 y RTX 3060 para 1080p ultrarrápido con margen de futuro.',
      categoria: 'MID_RANGE',
      casoUso: ['GAMING'],
      puntuacionGlobal: 4.5,
      resolucion: '1080p',
      pros: ['DDR5 y LGA1700 actualizable', 'Gran rendimiento en 1080p'],
      contras: ['Consumo moderado-alto'],
      componentes: [
        { categoria: 'cpu', nombre: 'Core i5-12400F' },
        { categoria: 'motherboard', nombre: 'PRO B760M-A WiFi' },
        { categoria: 'ram', nombre: 'Vengeance DDR5 32GB (2x16) 6000MHz' },
        { categoria: 'gpu', nombre: 'GeForce RTX 3060 12GB' },
        { categoria: 'storage', nombre: 'Black SN850X 1TB NVMe' },
        { categoria: 'psu', nombre: 'RM650e 650W' },
        { categoria: 'case', nombre: 'H5 Flow' },
        { categoria: 'cooler', nombre: 'Hyper 212 Black' },
      ],
    },
    {
      nombre: 'Gaming 1440p AMD',
      slug: 'gaming-1440p-amd',
      descripcion: 'Plataforma AM5 DDR5 con RX 7800 XT para 1440p con texturas altas y alto framerate.',
      categoria: 'MID_RANGE',
      casoUso: ['GAMING', 'STREAMING'],
      puntuacionGlobal: 4.6,
      resolucion: '1440p',
      pros: ['AM5 con largo soporte', '16GB de VRAM', 'Excelente 1440p'],
      contras: ['Presupuesto medio-alto'],
      destacado: true,
      componentes: [
        { categoria: 'cpu', nombre: 'Ryzen 5 7600X' },
        { categoria: 'motherboard', nombre: 'MAG B650 Tomahawk WiFi' },
        { categoria: 'ram', nombre: 'Flare X5 32GB (2x16) 6000MHz' },
        { categoria: 'gpu', nombre: 'Radeon RX 7800 XT 16GB' },
        { categoria: 'storage', nombre: '990 Pro 1TB NVMe' },
        { categoria: 'psu', nombre: 'RM750e 750W' },
        { categoria: 'case', nombre: 'Lancool 216' },
        { categoria: 'cooler', nombre: 'AK620' },
      ],
    },
    {
      nombre: 'Gaming 1440p NVIDIA',
      slug: 'gaming-1440p-nvidia',
      descripcion: 'Intel + RTX 4070 Super con DLSS 3 para dominar el 1440p con ray tracing.',
      categoria: 'HIGH_END',
      casoUso: ['GAMING', 'STREAMING'],
      puntuacionGlobal: 4.7,
      resolucion: '1440p',
      pros: ['DLSS 3 y ray tracing', 'Refrigeración líquida AIO'],
      contras: ['Precio de la GPU elevado'],
      componentes: [
        { categoria: 'cpu', nombre: 'Core i5-13600K' },
        { categoria: 'motherboard', nombre: 'MAG B760 Tomahawk WiFi' },
        { categoria: 'ram', nombre: 'Vengeance DDR5 32GB (2x16) 6000MHz' },
        { categoria: 'gpu', nombre: 'GeForce RTX 4070 Super 12GB' },
        { categoria: 'storage', nombre: 'Black SN850X 2TB NVMe' },
        { categoria: 'psu', nombre: 'RM750e 750W' },
        { categoria: 'case', nombre: 'North' },
        { categoria: 'cooler', nombre: 'Liquid Freezer III 240' },
      ],
    },
    {
      nombre: 'Gaming 4K NVIDIA Enthusiast',
      slug: 'gaming-4k-nvidia-enthusiast',
      descripcion: 'Ryzen 7 7800X3D + RTX 4080 Super para 4K a alto framerate.',
      categoria: 'HIGH_END',
      casoUso: ['GAMING'],
      puntuacionGlobal: 4.8,
      resolucion: '4K',
      pros: ['7800X3D imbatible en gaming', 'Refrigeración líquida 360mm'],
      contras: ['Inversión considerable'],
      componentes: [
        { categoria: 'cpu', nombre: 'Ryzen 7 7800X3D' },
        { categoria: 'motherboard', nombre: 'ROG Strix X670E-E Gaming' },
        { categoria: 'ram', nombre: 'Trident Z5 RGB 32GB (2x16) 6400MHz' },
        { categoria: 'gpu', nombre: 'GeForce RTX 4080 Super 16GB' },
        { categoria: 'storage', nombre: '990 Pro 2TB NVMe' },
        { categoria: 'psu', nombre: 'RM850x 850W' },
        { categoria: 'case', nombre: '5000D Airflow' },
        { categoria: 'cooler', nombre: 'Liquid Freezer III 360' },
      ],
    },
    {
      nombre: 'Ultra 4K Sin Compromisos',
      slug: 'ultra-4k-sin-compromisos',
      descripcion: 'Lo máximo en gaming 4K: Ryzen 9 7950X3D y RTX 4090 con 64GB DDR5.',
      categoria: 'ULTRA',
      casoUso: ['GAMING', 'EDITING', 'RENDERING'],
      puntuacionGlobal: 4.9,
      resolucion: '4K',
      pros: ['Máximo rendimiento 4K', 'Perfecto para edición y render'],
      contras: ['Precio muy elevado', 'Consumo alto'],
      destacado: true,
      componentes: [
        { categoria: 'cpu', nombre: 'Ryzen 9 7950X3D' },
        { categoria: 'motherboard', nombre: 'ROG Crosshair X670E Hero' },
        { categoria: 'ram', nombre: 'Trident Z5 Neo 64GB (2x32) 6000MHz' },
        { categoria: 'gpu', nombre: 'GeForce RTX 4090 24GB' },
        { categoria: 'storage', nombre: '990 Pro 4TB NVMe' },
        { categoria: 'psu', nombre: 'HX1000i 1000W' },
        { categoria: 'case', nombre: 'O11 Dynamic EVO' },
        { categoria: 'cooler', nombre: 'Liquid Freezer III 360' },
      ],
    },
    {
      nombre: 'Streaming y Gaming AMD',
      slug: 'streaming-y-gaming-amd',
      descripcion: 'AM4 con Ryzen 7 5700X y RTX 4060, equilibrada para jugar y transmitir a la vez.',
      categoria: 'MID_RANGE',
      casoUso: ['STREAMING', 'GAMING'],
      puntuacionGlobal: 4.3,
      resolucion: '1080p',
      pros: ['8 núcleos para multitarea', 'NVENC para streaming'],
      contras: ['Plataforma AM4'],
      componentes: [
        { categoria: 'cpu', nombre: 'Ryzen 7 5700X' },
        { categoria: 'motherboard', nombre: 'B550 AORUS Elite V2' },
        { categoria: 'ram', nombre: 'Vengeance RGB Pro DDR4 32GB (2x16) 3600MHz' },
        { categoria: 'gpu', nombre: 'GeForce RTX 4060 8GB' },
        { categoria: 'storage', nombre: 'P3 Plus 1TB NVMe' },
        { categoria: 'psu', nombre: 'RM650e 650W' },
        { categoria: 'case', nombre: 'H510' },
        { categoria: 'cooler', nombre: 'Fuma 3' },
      ],
    },
    {
      nombre: 'Workstation AMD Rendering',
      slug: 'workstation-amd-rendering',
      descripcion: 'Ryzen 9 5950X con 128GB de RAM para renderizado, edición 4K y simulación.',
      categoria: 'HIGH_END',
      casoUso: ['WORKSTATION', 'RENDERING', 'EDITING'],
      puntuacionGlobal: 4.7,
      resolucion: '4K',
      pros: ['16 núcleos / 32 hilos', '128GB de memoria', 'Silencioso con NH-D15'],
      contras: ['DDR4 e inversión alta'],
      componentes: [
        { categoria: 'cpu', nombre: 'Ryzen 9 5950X' },
        { categoria: 'motherboard', nombre: 'ROG Crosshair VIII Hero' },
        { categoria: 'ram', nombre: 'Vengeance LPX 128GB (4x32) 3200MHz' },
        { categoria: 'gpu', nombre: 'GeForce RTX 4070 Ti 12GB' },
        { categoria: 'storage', nombre: '990 Pro 2TB NVMe' },
        { categoria: 'psu', nombre: 'RM850x 850W' },
        { categoria: 'case', nombre: 'Define 7' },
        { categoria: 'cooler', nombre: 'NH-D15' },
      ],
    },
    {
      nombre: 'Workstation Intel Professional',
      slug: 'workstation-intel-professional',
      descripcion: 'Core i9-14900K con 64GB DDR5 para desarrollo, edición y creación de contenido.',
      categoria: 'HIGH_END',
      casoUso: ['WORKSTATION', 'EDITING'],
      puntuacionGlobal: 4.6,
      resolucion: '1440p',
      pros: ['24 núcleos', 'Gran single-thread', 'Gabinete silencioso'],
      contras: ['Consumo y calor elevados'],
      componentes: [
        { categoria: 'cpu', nombre: 'Core i9-14900K' },
        { categoria: 'motherboard', nombre: 'MPG Z790 Edge WiFi' },
        { categoria: 'ram', nombre: 'Vengeance DDR5 64GB (2x32) 5600MHz' },
        { categoria: 'gpu', nombre: 'GeForce RTX 4070 12GB' },
        { categoria: 'storage', nombre: 'Black SN850X 2TB NVMe' },
        { categoria: 'psu', nombre: 'RM850x 850W' },
        { categoria: 'case', nombre: 'Silent Base 802' },
        { categoria: 'cooler', nombre: 'Dark Rock Elite' },
      ],
    },
    {
      nombre: 'Presupuesto Ajustado AMD',
      slug: 'presupuesto-ajustado-amd',
      descripcion: 'El mejor gaming 1080p por el menor desembolso posible con AM4.',
      categoria: 'ENTRY',
      casoUso: ['GAMING', 'GENERAL'],
      puntuacionGlobal: 4.2,
      resolucion: '1080p',
      pros: ['Precio muy contenido', 'Listo para 1080p'],
      contras: ['Poca capacidad de almacenamiento'],
      componentes: [
        { categoria: 'cpu', nombre: 'Ryzen 5 5500' },
        { categoria: 'motherboard', nombre: 'Prime B450M-A II' },
        { categoria: 'ram', nombre: 'T-Force Vulcan Z DDR4 16GB (2x8) 3200MHz' },
        { categoria: 'gpu', nombre: 'Radeon RX 6600 8GB' },
        { categoria: 'storage', nombre: 'NV2 500GB NVMe' },
        { categoria: 'psu', nombre: 'CV550 550W' },
        { categoria: 'case', nombre: 'MasterBox Q300L' },
        { categoria: 'cooler', nombre: 'AG400' },
      ],
    },
    {
      nombre: 'E-Sports 1080p NVIDIA',
      slug: 'e-sports-1080p-nvidia',
      descripcion: 'Enfocada en eSports: altos FPS sostenidos en 1080p con RTX 4060 y DLSS 3.',
      categoria: 'ENTRY',
      casoUso: ['GAMING'],
      puntuacionGlobal: 4.4,
      resolucion: '1080p',
      pros: ['Altos FPS en competitivos', 'DLSS 3', 'Eficiente'],
      contras: ['VRAM de 8GB'],
      componentes: [
        { categoria: 'cpu', nombre: 'Core i5-12400F' },
        { categoria: 'motherboard', nombre: 'B760M DS3H' },
        { categoria: 'ram', nombre: 'Fury Beast DDR5 16GB (2x8) 5600MHz' },
        { categoria: 'gpu', nombre: 'GeForce RTX 4060 8GB' },
        { categoria: 'storage', nombre: 'P3 Plus 1TB NVMe' },
        { categoria: 'psu', nombre: 'CV650 650W' },
        { categoria: 'case', nombre: 'CC560' },
        { categoria: 'cooler', nombre: 'AK400' },
      ],
    },
    {
      nombre: 'HTPC Compacto AMD',
      slug: 'htpc-compacto-amd',
      descripcion: 'Ryzen 5 8600G con gráficos integrados en formato compacto para el salón.',
      categoria: 'MID_RANGE',
      casoUso: ['GENERAL', 'OFFICE'],
      puntuacionGlobal: 4.3,
      resolucion: '1080p',
      pros: ['Sin GPU dedicada', 'Formato reducido', 'Eficiente'],
      contras: ['Gaming limitado'],
      componentes: [
        { categoria: 'cpu', nombre: 'Ryzen 5 8600G' },
        { categoria: 'motherboard', nombre: 'Prime B650M-A WiFi' },
        { categoria: 'ram', nombre: 'Fury Beast DDR5 16GB (2x8) 5600MHz' },
        { categoria: 'storage', nombre: '990 EVO 1TB NVMe' },
        { categoria: 'psu', nombre: 'Pure Power 12 M 650W' },
        { categoria: 'case', nombre: 'Pop Mini Air' },
        { categoria: 'cooler', nombre: 'AG400' },
      ],
    },
    {
      nombre: 'Enthusiast Intel DDR5',
      slug: 'enthusiast-intel-ddr5',
      descripcion: 'Core i9-13900K + RTX 4090 con DDR5 a 8000MHz y SSD Gen5: el tope Intel.',
      categoria: 'ULTRA',
      casoUso: ['GAMING', 'STREAMING', 'RENDERING'],
      puntuacionGlobal: 4.9,
      resolucion: '4K',
      pros: ['Rendimiento extremo', 'SSD PCIe 5.0', 'Listo para todo'],
      contras: ['Precio y consumo máximos'],
      destacado: true,
      componentes: [
        { categoria: 'cpu', nombre: 'Core i9-13900K' },
        { categoria: 'motherboard', nombre: 'ROG Strix Z790-A Gaming WiFi' },
        { categoria: 'ram', nombre: 'Trident Z5 32GB (2x16) 8000MHz' },
        { categoria: 'gpu', nombre: 'GeForce RTX 4090 24GB' },
        { categoria: 'storage', nombre: '9100 Pro 2TB NVMe Gen5' },
        { categoria: 'psu', nombre: 'RM1000x 1000W' },
        { categoria: 'case', nombre: '6500X' },
        { categoria: 'cooler', nombre: 'Kraken Elite 360' },
      ],
    },
  ];

  const generatedBuilds = composeRecommendedBuilds();
  const allBuilds = [...builds, ...generatedBuilds];
  console.log(
    `✓ Ensambles a procesar: ${allBuilds.length} (${builds.length} curados + ${generatedBuilds.length} generados)`,
  );

  let buildsCreados = 0;
  for (const b of allBuilds) {
    const slugs = b.componentes
      .map((x) => compByKey.get(`${x.categoria}|${x.nombre}`))
      .filter((s): s is string => Boolean(s));
    const comps = await prisma.componente.findMany({ where: { slug: { in: slugs } } });
    const precioTotal = comps.reduce(
      (acc, c) => acc + (c.precio ? Number(c.precio) : 0),
      0,
    );

    const data = {
      nombre: b.nombre,
      descripcion: b.descripcion,
      categoria: b.categoria,
      casoUso: JSON.stringify(b.casoUso),
      puntuacionGlobal: b.puntuacionGlobal,
      precioTotal,
      pros: JSON.stringify(b.pros),
      contras: JSON.stringify(b.contras),
      destacado: b.destacado ?? false,
      activo: true,
      especificaciones: JSON.stringify({ resolucion: b.resolucion }),
    };

    const ensamble = await prisma.ensamblePreconfigurado.upsert({
      where: { slug: b.slug },
      update: data,
      create: { ...data, slug: b.slug },
    });

    await prisma.ensambleComponente.deleteMany({ where: { ensamblajeId: ensamble.id } });
    if (comps.length > 0) {
      await prisma.ensambleComponente.createMany({
        data: comps.map((c) => ({ ensamblajeId: ensamble.id, componenteId: c.id })),
      });
    }

    const missing = b.componentes.length - comps.length;
    if (missing > 0) {
      console.warn(`⚠ Build "${b.nombre}": ${missing} componente(s) no encontrados`);
    }
    buildsCreados += 1;
  }
  console.log(`✓ Builds creadas (${buildsCreados})`);

  // Reglas de validación básicas
  const reglas = [
    {
      nombre: 'Socket CPU-Motherboard',
      tipo: 'SOCKET_COMPATIBILITY',
      descripcion: 'Verifica compatibilidad entre socket de CPU y socket de motherboard',
      condicion: { tipo: 'socket_match' },
      accion: { tipo: 'bloquear_si_no_coincide' },
      prioridad: 10,
    },
    {
      nombre: 'Memoria RAM',
      tipo: 'RAM_COMPATIBILITY',
      descripcion: 'Verifica tipo DDR4/DDR5 entre RAM y motherboard',
      condicion: { tipo: 'ram_type_match' },
      accion: { tipo: 'bloquear_si_no_coincide' },
      prioridad: 9,
    },
    {
      nombre: 'Balance Energético',
      tipo: 'POWER_BALANCE',
      descripcion: 'Verifica que PSU tenga suficiente potencia (TDP + margen 20%)',
      condicion: { tipo: 'power_calculation', margen: 1.2 },
      accion: { tipo: 'alerta_si_insuficiente' },
      prioridad: 8,
    },
  ];

  for (const regla of reglas) {
    await prisma.reglaValidacion.upsert({
      where: { id: (await prisma.reglaValidacion.findFirst({ where: { nombre: regla.nombre } }))?.id || '00000000-0000-0000-0000-000000000000' } as any,
      update: {},
      create: {
        ...regla,
        condicion: JSON.stringify(regla.condicion),
        accion: JSON.stringify(regla.accion),
      },
    });
  }
  console.log('✓ Reglas de validación creadas');

  // Configuración del sistema
  await prisma.configuracionSistema.upsert({
    where: { clave: 'system.version' },
    update: {},
    create: {
      clave: 'system.version',
      valor: JSON.stringify({ version: '1.0.0', fecha: new Date().toISOString() }),
      descripcion: 'Versión actual del sistema',
    },
  });
  console.log('✓ Configuración creada');

  console.log('✅ Seed completado exitosamente!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
