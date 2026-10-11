import { useLocation } from "react-router-dom"
import { SECTION_THEMES, sectionForPath } from "@/lib/section-theme"
import { cn } from "@/lib/utils"

export function Header() {
  const location = useLocation()
  const theme = SECTION_THEMES[sectionForPath(location.pathname)]

  return (
    <header className="glass-highlight relative z-20 flex h-16 shrink-0 items-center gap-4 border-b border-white/[0.08] bg-white/[0.03] px-5 backdrop-blur-2xl">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          backgroundImage: "linear-gradient(90deg, transparent, var(--section-accent), transparent)",
        }}
        aria-hidden="true"
      />

      <div className="flex min-w-0 flex-col">
        <span className="text-[9px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
          Módulo activo
        </span>
        <span
          className="truncate text-sm font-semibold text-section glow-text"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {theme.label}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-4">
        <div
          className={cn(
            "flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5",
            "text-xs text-muted-foreground",
          )}
        >
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="font-medium text-emerald-300">Sistema en línea</span>
        </div>
      </div>
    </header>
  )
}