import { Info } from "lucide-react"
import { PRICE_DISCLAIMER } from "@/lib/price"
import { cn } from "@/lib/utils"

/**
 * Aviso permanente que aclara que los precios mostrados son estimaciones de
 * mercado referenciales. Úsalo en catálogos, detalles de componentes y builds.
 */
export function EstimatedPriceNotice({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 text-xs text-muted-foreground", className)}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{PRICE_DISCLAIMER}</span>
    </p>
  )
}
