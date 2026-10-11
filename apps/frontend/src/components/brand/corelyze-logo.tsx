import { cn } from "@/lib/utils"

interface CorelyzeLogoProps {
  className?: string
  /** Tamaño del contenedor cuadrado del ícono (px). */
  size?: number
  /** Sin placa de fondo: solo el glifo del "C". */
  bare?: boolean
}

export function CorelyzeMark({ className, size = 36 }: CorelyzeLogoProps) {
  return (
    <img
      src="/logo.png"
      alt="Corelyze"
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", className)}
      draggable={false}
    />
  )
}

interface CorelyzeWordmarkProps {
  className?: string
  subtitle?: string
}

export function CorelyzeWordmark({ className, subtitle }: CorelyzeWordmarkProps) {
  return (
    <div className={cn("flex flex-col leading-none", className)}>
      <span
        className="bg-clip-text bg-gradient-to-r from-[#5EB3FF] via-[#35D6E8] to-[#A78BFA] text-[15px] font-semibold tracking-tight text-transparent"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Corelyze
      </span>
      {subtitle && <span className="mt-1 text-[10px] text-muted-foreground">{subtitle}</span>}
    </div>
  )
}

export function CorelyzeLogo() {
  return (
    <div className="flex items-center gap-2.5">
      <CorelyzeMark size={34} />
      <CorelyzeWordmark subtitle="HARDWARE INTELLIGENCE" />
    </div>
  )
}