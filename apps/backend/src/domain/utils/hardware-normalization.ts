/**
 * Utilidades de normalización de hardware.
 *
 * El objetivo es evitar falsos positivos al comparar el hardware detectado
 * contra las reglas de compatibilidad: las descripciones reales llegan con
 * formatos inconsistentes ("DDR4", "DDR-4", "DDR 4", "LGA 1700", "LGA1700",
 * "ATX Mid-Tower", …). Aquí centralizamos el "texto limpio" y los respaldos
 * inteligentes (p. ej. deducir DDR4 a partir de la frecuencia 3200/3600 MHz).
 */

export type RamGeneration = 'DDR3' | 'DDR4' | 'DDR5';

/**
 * Normaliza un texto para comparaciones tolerantes:
 *  - minúsculas
 *  - sin acentos/diacríticos
 *  - sin caracteres especiales ni espacios
 *
 * Ejemplos: "DDR-4" → "ddr4"; "DDR 4" → "ddr4"; "LGA 1700" → "lga1700".
 */
export function normalizeToken(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

/**
 * Compara dos textos de hardware de forma tolerante (igualdad o contención).
 * Ej.: "DDR4" vs "DDR4 3200MHz", "AM4" vs "AM4 (PGA)".
 */
export function tokensMatch(a: unknown, b: unknown): boolean {
  const na = normalizeToken(a);
  const nb = normalizeToken(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

/**
 * Determina si un texto de socket coincide con otro (normalizado).
 */
export function socketsMatch(a: unknown, b: unknown): boolean {
  return tokensMatch(a, b);
}

/**
 * Comprueba si `value` está dentro de una lista de valores, tolerando formato.
 */
export function valueInList(value: unknown, list: unknown[]): boolean {
  return list.some((item) => tokensMatch(item, value));
}

/**
 * Extrae la generación de memoria (DDR3/DDR4/DDR5) de un texto libre.
 * Ej.: "DDR-4", "ddr4 sdram", "LPDDR5" → "DDR4"/"DDR5".
 */
export function extractRamGeneration(value: unknown): RamGeneration | null {
  const token = normalizeToken(value);
  if (!token) return null;
  if (token.includes('ddr5')) return 'DDR5';
  if (token.includes('ddr4')) return 'DDR4';
  if (token.includes('ddr3')) return 'DDR3';
  return null;
}

/**
 * Respaldo inteligente: deduce la generación de RAM a partir de la frecuencia
 * (MHz). Frecuencias estándar de DDR4 (2133, 2400, 2666, 3000, 3200, 3600) y
 * de DDR5 (4800, 5200, 5600, 6000, 6400…) se clasifican correctamente para
 * no marcar incompatibilidades falsas con placas compatibles (p. ej. B550).
 */
export function inferRamGenerationFromSpeed(speed: unknown): RamGeneration | null {
  const mhz = typeof speed === 'number' ? speed : Number(speed);
  if (!Number.isFinite(mhz) || mhz <= 0) return null;
  if (mhz >= 4000) return 'DDR5';
  if (mhz >= 2133) return 'DDR4';
  if (mhz >= 1066) return 'DDR3';
  return null;
}

const DDR4_CHIPSETS = ['a320', 'b350', 'x370', 'b450', 'x470', 'a520', 'b550', 'x570', 'trx40'];
const DDR5_CHIPSETS = ['a620', 'b650', 'x670', 'b840', 'x870', 'trx50', 'trx90'];

/**
 * Respaldo inteligente por plataforma: algunos reportes de hardware traen el
 * chipset (p. ej. "B550") pero no el tipo de memoria de la placa. Mapeamos los
 * chipsets conocidos de AMD para no marcar errores de compatibilidad.
 */
export function inferRamGenerationFromChipset(chipset: unknown): RamGeneration | null {
  const token = normalizeToken(chipset);
  if (!token) return null;
  if (DDR5_CHIPSETS.some((c) => token.includes(c))) return 'DDR5';
  if (DDR4_CHIPSETS.some((c) => token.includes(c))) return 'DDR4';
  return null;
}

/**
 * Resuelve la generación de RAM combinando varias señales: tipo declarado,
 * frecuencia y chipset. Devuelve la mejor inferencia disponible o null.
 */
export function resolveRamGeneration(input: {
  type?: unknown;
  speed?: unknown;
  chipset?: unknown;
}): RamGeneration | null {
  return (
    extractRamGeneration(input.type) ??
    inferRamGenerationFromSpeed(input.speed) ??
    inferRamGenerationFromChipset(input.chipset)
  );
}

/**
 * Capacidades comerciales "semilla" (GB): los escalones más pequeños del mercado.
 */
const BASE_COMMERCIAL_RAM_GB = [1, 2, 3, 4];

/**
 * Genera dinámicamente la secuencia de capacidades comerciales (GB) hasta
 * superar `upTo`. La progresión real del mercado alterna multiplicadores ×1,5
 * y ×4/3 a partir de 4 GB: …, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192,
 * 256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096, 6144, 8192, …
 *
 * Al ser una secuencia abierta (crece sólo hasta el valor consultado) NO impone
 * ningún techo artificial: un módulo de 8/16 GB se reconoce igual que un kit de
 * servidor de 1, 2, 4 o 8 TB.
 */
function commercialRamCandidates(upTo: number): number[] {
  const caps = [...BASE_COMMERCIAL_RAM_GB];
  let value = 4;
  let factor = 1.5;
  while (value <= upTo) {
    value = Math.round(value * factor);
    factor = factor === 1.5 ? 4 / 3 : 1.5;
    if (value > caps[caps.length - 1]) caps.push(value);
  }
  return caps;
}

/**
 * Redondeo "inteligente" a capacidades comerciales de RAM.
 *
 * Windows reserva parte de la memoria para hardware, por lo que un kit de
 * 16 GB suele leerse como ~15.9 GB y uno de 32 GB como ~31.5 GB, y uno de
 * 256 GB como ~255 GB. Esta función ajusta el valor detectado al estándar
 * comercial más cercano cuando la diferencia es razonable, SIN límite superior:
 * los candidatos se generan hasta por encima del valor real, así que cualquier
 * capacidad (8, 16, 64, 128 GB, 1 TB, 2 TB, 4 TB…) se procesa sin recortes.
 */
export function roundRamCapacityGB(value: unknown): number {
  const gb = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(gb) || gb <= 0) return 0;

  // Candidatos hasta ~10% por encima del valor real (garantiza el vecino superior).
  const candidates = commercialRamCandidates(gb + Math.max(1, gb * 0.1));

  let best = candidates[0];
  let bestDistance = Math.abs(best - gb);
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - gb);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  // Tolerancia: ~6% del estándar o al menos 1 GB (cubre la reserva de hardware).
  const tolerance = Math.max(1, best * 0.06);
  if (bestDistance <= tolerance) return best;
  return Math.round(gb * 10) / 10;
}

/**
 * Formatea una capacidad de RAM en texto comercial ("16 GB", "31.5 GB").
 */
export function formatRamGB(value: unknown): string {
  const rounded = roundRamCapacityGB(value);
  if (rounded <= 0) return '—';
  return Number.isInteger(rounded) ? `${rounded} GB` : `${rounded.toFixed(1)} GB`;
}
