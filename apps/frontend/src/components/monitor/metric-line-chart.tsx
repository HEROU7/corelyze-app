import { useId } from "react"

export function MetricLineChart({
  values,
  max = 100,
  unit = "%",
  color = "var(--section-accent)",
  height = 180,
  showAxis = true,
}: {
  values: number[]
  max?: number
  unit?: string
  color?: string
  height?: number
  showAxis?: boolean
}) {
  const gradientId = useId()
  const width = 600
  const padX = 8
  const padTop = 14
  const padBottom = showAxis ? 22 : 8
  const innerW = width - padX * 2
  const innerH = height - padTop - padBottom

  const n = values.length
  const stepX = n > 1 ? innerW / (n - 1) : 0

  const points: Array<{ x: number; y: number }> = values.map((v, i) => {
    const safe = Math.max(0, Math.min(max, Number.isFinite(v) ? v : 0))
    return { x: padX + i * stepX, y: padTop + (1 - safe / max) * innerH }
  })

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padTop + innerH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padTop + innerH).toFixed(1)} Z`
      : ""
  const last = points[points.length - 1]
  const current = values[values.length - 1]

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="select-none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      {showAxis &&
        [0, 0.5, 1].map((f) => {
          const y = padTop + f * innerH
          return (
            <g key={f}>
              <line x1={padX} y1={y} x2={width - padX} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
              <text x={2} y={y + 3} fill="currentColor" opacity={0.4} fontSize={9}>
                {Math.round(max * (1 - f))}
              </text>
            </g>
          )
        })}

      {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}
      {linePath && (
        <path d={linePath} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      )}

      {last && (
        <g>
          <circle cx={last.x} cy={last.y} r={4} fill={color} />
          <circle cx={last.x} cy={last.y} r={8} fill={color} opacity={0.2} />
        </g>
      )}

      {n > 0 && (
        <text
          x={width - padX}
          y={padTop - 4}
          textAnchor="end"
          fill="currentColor"
          opacity={0.85}
          fontSize={11}
          fontWeight={700}
          style={{ fontFamily: "var(--font-display)" }}
        >
          {Number.isFinite(current) ? `${Math.round(current!)}${unit}` : "—"}
        </text>
      )}
    </svg>
  )
}