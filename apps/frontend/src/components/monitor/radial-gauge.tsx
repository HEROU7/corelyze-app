import { useId, useState } from "react"
import { cn } from "@/lib/utils"

function polar(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polar(cx, cy, r, startDeg)
  const end = polar(cx, cy, r, endDeg)
  const sweep = endDeg - startDeg
  const largeArc = sweep > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`
}

export function RadialGauge({
  label,
  value,
  max = 100,
  unit = "%",
  size = 172,
  color,
  sublabel,
  heat = false,
  suffix,
}: {
  label: string
  value: number | null
  max?: number
  unit?: string
  size?: number
  color?: string
  sublabel?: string
  heat?: boolean
  suffix?: string
}) {
  const gradientId = useId()
  const clamped = value === null ? 0 : Math.max(0, Math.min(max, value))
  const pct = max > 0 ? clamped / max : 0
  const cx = size / 2
  const cy = size / 2
  const strokeWidth = Math.max(8, Math.round(size * 0.09))
  const r = (size - strokeWidth - 4) / 2
  const startDeg = 135
  const endDeg = 405
  const sweepDeg = endDeg - startDeg

  const display = value === null ? "—" : Math.round(clamped)
  const glow = value !== null && pct >= 0.9
  const autoColor =
    color ?? (heat ? (pct >= 0.9 ? "#ef4444" : pct >= 0.75 ? "#f59e0b" : "var(--section-accent)") : "var(--section-accent)")

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="select-none">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={autoColor} stopOpacity={0.55} />
            <stop offset="100%" stopColor={autoColor} />
          </linearGradient>
        </defs>
        <path
          d={arcPath(cx, cy, r, startDeg, endDeg)}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <path
          d={arcPath(cx, cy, r, startDeg, startDeg + sweepDeg * pct)}
          fill="none"
          stroke={glow ? autoColor : `url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          style={glow ? { filter: `drop-shadow(0 0 8px ${autoColor})` } : undefined}
        />
        <text
          x={cx}
          y={cy - 2}
          textAnchor="middle"
          fill="currentColor"
          fontSize={Math.round(size * 0.17)}
          fontWeight={700}
          style={{ fontFamily: "var(--font-display)" }}
        >
          {display}
          {suffix ?? (value !== null && unit ? <tspan fontSize={Math.round(size * 0.075)} fill="currentColor" opacity={0.6}> {unit}</tspan> : null)}
        </text>
        <text
          x={cx}
          y={cy + Math.round(size * 0.085)}
          textAnchor="middle"
          fill="currentColor"
          opacity={0.55}
          fontSize={Math.round(size * 0.052)}
          letterSpacing="0.14em"
        >
          {label}
        </text>
      </svg>
      {sublabel && <div className="mt-1 text-xs text-muted-foreground">{sublabel}</div>}
    </div>
  )
}

export function TemperatureGauge({
  label,
  celsius,
  size = 172,
  sublabel,
}: {
  label: string
  celsius: number | null
  size?: number
  sublabel?: string
}) {
  const [unit, setUnit] = useState<"C" | "F">("C")
  const value = celsius === null ? null : unit === "C" ? celsius : celsius * 1.8 + 32
  const max = unit === "C" ? 100 : 212

  return (
    <div className="flex flex-col items-center gap-3">
      <RadialGauge
        label={label}
        value={value}
        max={max}
        unit="°"
        size={size}
        heat
        sublabel={sublabel}
      />
      <div
        role="group"
        aria-label="Unidad de temperatura"
        className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] p-1"
      >
        {(["C", "F"] as const).map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => setUnit(u)}
            aria-pressed={unit === u}
            className={cn(
              "rounded-md px-2.5 py-0.5 text-xs font-semibold transition-colors",
              unit === u
                ? "bg-section/20 text-section shadow-[0_0_16px_-6px_var(--section-accent)]"
                : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
            )}
          >
            °{u}
          </button>
        ))}
      </div>
    </div>
  )
}