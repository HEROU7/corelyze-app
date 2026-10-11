import { useMemo } from "react"
import { Zap } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { estimatePowerBudget, type PowerLine } from "@/lib/power"
import type { Component } from "@/services/types"

function lineKey(line: PowerLine): string {
  return `${line.slot}-${line.name}-${line.watts}`
}

export function PowerPanel({ components }: { components: Component[] }) {
  const budget = useMemo(() => estimatePowerBudget(components), [components])

  return (
    <Card className="border-blue-500/30 bg-blue-500/5 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Zap className="h-4 w-4 text-blue-400" />
            Consumo estimado y PSU recomendada
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              {budget.estimatedWatts} W estimados
            </Badge>
            <Badge variant="info" className="text-[10px]">
              {budget.recommendedWatts} W recomendados
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{budget.tier}</span>
            <span>~{budget.loadPercent}% de carga objetivo</span>
          </div>
          <Progress value={(budget.estimatedWatts / Math.max(1, budget.recommendedWatts)) * 100} />
        </div>
        {budget.lines.length > 0 && (
          <div className="grid gap-2 md:grid-cols-2">
            {budget.lines.map((line) => (
              <div
                key={lineKey(line)}
                className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs"
              >
                <span className="truncate text-muted-foreground">{line.name}</span>
                <span className="font-semibold">{line.watts} W</span>
              </div>
            ))}
          </div>
        )}
        {budget.notes.length > 0 && (
          <ul className="space-y-1">
            {budget.notes.map((note, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                {note}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}