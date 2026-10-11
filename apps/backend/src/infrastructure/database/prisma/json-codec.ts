// SQLite no soporta el tipo Json ni listas escalares en Prisma, así que estos
// campos se guardan como texto serializado. Este módulo centraliza la
// (de)serialización para que la API mantenga exactamente la misma forma
// (arrays y objetos) que antes con PostgreSQL.

export function parseJson(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function parseJsonArray(value: unknown): unknown[] {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed : [];
}

export function encodeJsonArray(value: unknown): string {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

export function encodeJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

export function decodeComponent(row: any): any {
  if (!row) return row;
  return {
    ...row,
    imagenUrl: parseJsonArray(row.imagenUrl),
    especificaciones: parseJson(row.especificaciones),
    datosTecnicos: parseJson(row.datosTecnicos),
    metadata: parseJson(row.metadata),
  };
}

export function decodeBuild(row: any): any {
  if (!row) return row;
  return {
    ...row,
    casoUso: parseJsonArray(row.casoUso),
    pros: parseJsonArray(row.pros),
    contras: parseJsonArray(row.contras),
    especificaciones: parseJson(row.especificaciones),
    rendimiento: parseJson(row.rendimiento),
    configuracion: parseJson(row.configuracion),
    componentes: Array.isArray(row.componentes)
      ? row.componentes.map((ec: any) => ({ ...ec, componente: decodeComponent(ec.componente) }))
      : row.componentes,
  };
}
