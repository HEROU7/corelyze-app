import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Loader2, RotateCcw, ArrowLeftRight, Trophy, Swords } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatEstimatedPrice } from "@/lib/price"
import { EstimatedPriceNotice } from "@/components/estimated-price-notice"
import { hardwareService } from "@/services/hardware.service"
import type { CategorySlug, Component } from "@/services/types"

interface VersusCategory {
  slug: CategorySlug
  label: string
}

const VERSUS_CATEGORIES: VersusCategory[] = [
  { slug: "cpu", label: "Procesadores" },
  { slug: "gpu", label: "Tarjetas Gráficas" },
  { slug: "ram", label: "Memorias RAM" },
  { slug: "motherboard", label: "Placas Madre" },
  { slug: "storage", label: "Almacenamiento" },
]

interface RowDef {
  label: string
  key: string
  suffix?: string
  better?: "high" | "low"
}

const ROWS: Record<CategorySlug, RowDef[]> = {
  cpu: [
    { label: "Socket", key: "socket" },
    { label: "Tipo de RAM", key: "ramType" },
    { label: "Núcleos", key: "nucleos", better: "high" },
    { label: "Hilos", key: "hilos", better: "high" },
    { label: "Frec. base", key: "frecuenciaBase", suffix: " GHz", better: "high" },
    { label: "Frec. turbo", key: "frecuenciaTurbo", suffix: " GHz", better: "high" },
    { label: "TDP", key: "tdp", suffix: " W", better: "low" },
  ],
  gpu: [
    { label: "VRAM", key: "vram", suffix: " GB", better: "high" },
    { label: "TDP", key: "tdp", suffix: " W", better: "low" },
    { label: "Longitud", key: "longitud", suffix: " mm" },
    { label: "Bus", key: "bus" },
  ],
  ram: [
    { label: "Tipo", key: "tipo" },
    { label: "Capacidad", key: "capacidad", suffix: " GB", better: "high" },
    { label: "Módulos", key: "modulos" },
    { label: "Frecuencia", key: "frecuencia", suffix: " MHz", better: "high" },
    { label: "Latencia", key: "latencia" },
  ],
  motherboard: [
    { label: "Socket", key: "socket" },
    { label: "Tipo de RAM", key: "tipoRam" },
    { label: "Factor forma", key: "factorForma" },
    { label: "Chipset", key: "chipset" },
    { label: "Slots RAM", key: "slotsRam", better: "high" },
    { label: "RAM máx.", key: "maxRam", suffix: " GB", better: "high" },
  ],
  storage: [
    { label: "Tipo", key: "tipo" },
    { label: "Capacidad", key: "capacidad", suffix: " GB", better: "high" },
    { label: "Interfaz", key: "interfaz" },
  ],
  psu: [
    { label: "Vatios", key: "watts", suffix: " W", better: "high" },
    { label: "Certificación", key: "certificacion" },
    { label: "Modular", key: "modular" },
  ],
  case: [
    { label: "Factor forma", key: "factorForma" },
    { label: "GPU máx.", key: "maxGpuLength", suffix: " mm", better: "high" },
    { label: "Cooler máx.", key: "maxCoolerHeight", suffix: " mm", better: "high" },
  ],
  cooler: [
    { label: "Tipo", key: "tipo" },
    { label: "Disipación", key: "tdp", suffix: " W", better: "high" },
    { label: "Altura", key: "altura", suffix: " mm" },
    { label: "Ruido", key: "ruido", suffix: " dBA", better: "low" },
  ],
}

function specValue(component: Component, key: string): unknown {
  return (component.especificaciones as Record<string, unknown> | null)?.[key]
}

function numericSpec(component: Component, key: string): number | null {
  const value = Number(specValue(component, key))
  return Number.isFinite(value) ? value : null
}

function benchmarkScore(component: Component): number {
  const score = (component.datosTecnicos as Record<string, unknown> | null)?.benchmarkScore
  return Number.isFinite(Number(score)) ? Number(score) : 0
}

function priceOf(component: Component): number {
  return Number.parseFloat(component.precio ?? "0") || 0
}

function formatPrice(precio: string | null): string {
  return formatEstimatedPrice(precio)
}

function cellText(component: Component, row: RowDef): string {
  const value = specValue(component, row.key)
  if (value === null || value === undefined || value === "") return "—"
  return `${value}${row.suffix ?? ""}`
}

export default function VersusPage() {
  const [category, setCategory] = useState<CategorySlug>("cpu")
  const [catalog, setCatalog] = useState<Record<string, Component[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [leftId, setLeftId] = useState("")
  const [rightId, setRightId] = useState("")

  useEffect(() => {
    let cancelled = false
    hardwareService
      .getComponents()
      .then((components) => {
        if (cancelled) return
        const grouped: Record<string, Component[]> = {}
        for (const c of components) {
          ;(grouped[c.categoria.slug] ??= []).push(c)
        }
        setCatalog(grouped)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "No se pudo cargar el catálogo")
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const options = catalog[category] ?? []

  useEffect(() => {
    setLeftId(options[0]?.id ?? "")
    setRightId(options[1]?.id ?? "")
  }, [category, options])

  const left = options.find((c) => c.id === leftId) ?? null
  const right = options.find((c) => c.id === rightId) ?? null
  const rows = ROWS[category]

  const winner = (() => {
    if (!left || !right) return null
    const lScore = benchmarkScore(left)
    const rScore = benchmarkScore(right)
    if (lScore > 0 || rScore > 0) {
      if (lScore === rScore) return "tie"
      return lScore > rScore ? "left" : "right"
    }
    return null
  })()

  const priceWinner = (() => {
    if (!left || !right) return null
    const l = priceOf(left)
    const r = priceOf(right)
    if (l === 0 || r === 0 || l === r) return null
    return l < r ? "left" : "right"
  })()

  const swap = () => {
    setLeftId(rightId)
    setRightId(leftId)
  }

  const reset = () => {
    setLeftId(options[0]?.id ?? "")
    setRightId(options[1]?.id ?? "")
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Swords className="h-7 w-7 text-primary" />
          Versus
        </h1>
        <p className="text-muted-foreground">
          Compara dos componentes cara a cara y descubre cuál conviene según especificaciones y precio.
        </p>
        <EstimatedPriceNotice className="pt-1" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {VERSUS_CATEGORIES.map((cat) => (
          <Button
            key={cat.slug}
            size="sm"
            variant={category === cat.slug ? "default" : "outline"}
            onClick={() => setCategory(cat.slug)}
          >
            {cat.label}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={reset}>
          <RotateCcw className="h-4 w-4" />
          Reiniciar
        </Button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando catálogo…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
            <SelectBox
              value={leftId}
              options={options}
              side="A"
              isWinner={winner === "left"}
              onChange={setLeftId}
            />
            <Button
              variant="outline"
              size="sm"
              className="mx-auto h-9 w-9 rounded-full p-0"
              onClick={swap}
              title="Intercambiar"
            >
              <ArrowLeftRight className="h-4 w-4" />
            </Button>
            <SelectBox
              value={rightId}
              options={options}
              side="B"
              isWinner={winner === "right"}
              onChange={setRightId}
            />
          </div>

          {!left || !right ? (
            <p className="text-sm text-muted-foreground">
              Selecciona dos componentes del mismo tipo para comparar.
            </p>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Trophy className="h-4 w-4 text-primary" />
                  Comparativa detallada
                  {winner === "tie" && (
                    <Badge variant="secondary" className="text-[10px]">
                      Rendimiento parecido
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-left">
                      <th className="w-1/3 p-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Especificación
                      </th>
                      <th className={cn("p-2", winner === "left" && "text-primary")}>
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold" title={left.nombre}>
                            {left.nombre}
                          </span>
                          {winner === "left" && (
                            <Badge variant="section" className="text-[10px]">
                              Mejor
                            </Badge>
                          )}
                        </div>
                      </th>
                      <th className={cn("p-2", winner === "right" && "text-primary")}>
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold" title={right.nombre}>
                            {right.nombre}
                          </span>
                          {winner === "right" && (
                            <Badge variant="section" className="text-[10px]">
                              Mejor
                            </Badge>
                          )}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const lNum = numericSpec(left, row.key)
                      const rNum = numericSpec(right, row.key)
                      let side: "left" | "right" | null = null
                      if (row.better && lNum !== null && rNum !== null && lNum !== rNum) {
                        const leftBetter = row.better === "high" ? lNum > rNum : lNum < rNum
                        side = leftBetter ? "left" : "right"
                      }
                      return (
                        <tr key={row.key} className="border-b border-border/40 last:border-0">
                          <td className="p-2 text-muted-foreground">{row.label}</td>
                          <td className={cn("p-2", side === "left" && "font-semibold text-primary")}>
                            {cellText(left, row)}
                          </td>
                          <td className={cn("p-2", side === "right" && "font-semibold text-primary")}>
                            {cellText(right, row)}
                          </td>
                        </tr>
                      )
                    })}
                    <tr className="border-t border-border/60">
                      <td className="p-2 text-muted-foreground">Precio estimado de mercado</td>
                      <td className={cn("p-2", priceWinner === "left" && "font-semibold text-primary")}>
                        {formatPrice(left.precio)}
                      </td>
                      <td className={cn("p-2", priceWinner === "right" && "font-semibold text-primary")}>
                        {formatPrice(right.precio)}
                      </td>
                    </tr>
                    {(benchmarkScore(left) > 0 || benchmarkScore(right) > 0) && (
                      <tr className="border-t border-border/60">
                        <td className="p-2 text-muted-foreground">Puntaje (benchmark)</td>
                        <td className={cn("p-2", winner === "left" && "font-semibold text-primary")}>
                          {benchmarkScore(left) || "—"}
                        </td>
                        <td className={cn("p-2", winner === "right" && "font-semibold text-primary")}>
                          {benchmarkScore(right) || "—"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function SelectBox({
  value,
  options,
  side,
  isWinner,
  onChange,
}: {
  value: string
  options: Component[]
  side: "A" | "B"
  isWinner: boolean
  onChange: (id: string) => void
}) {
  return (
    <Card
      className={cn(isWinner && "border-primary/60 ring-1 ring-primary/40")}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Componente {side}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-primary"
        >
          <option value="">— Selecciona —</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.marca.nombre} · {c.nombre}
            </option>
          ))}
        </select>
      </CardContent>
    </Card>
  )
}
