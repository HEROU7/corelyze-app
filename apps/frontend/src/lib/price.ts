/**
 * Utilidades de precios de Corelyze.
 *
 * Los precios del catálogo son ESTIMACIONES DE MERCADO (referenciales), no
 * valores reales de venta. Se formatean siempre con el prefijo "~" para dejar
 * claro que son aproximados, y se acompañan de un aviso permanente.
 */

export const PRICE_DISCLAIMER =
  "Precios estimados de mercado. Son valores referenciales y pueden variar según la región, el proveedor y la disponibilidad."

/**
 * Formatea un precio como estimación de mercado: "~$1,234".
 * Devuelve "—" cuando no hay valor.
 */
export function formatEstimatedPrice(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—"
  const n = typeof value === "number" ? value : Number.parseFloat(value)
  if (Number.isNaN(n)) return String(value)
  const amount = n.toLocaleString("es-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  })
  return `~${amount}`
}
