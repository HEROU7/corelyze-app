import { useState, type ReactNode } from "react"
import { Link, useLocation } from "react-router-dom"
import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import { CorelyzeLogo, CorelyzeMark } from "@/components/brand/corelyze-logo"
import {
  Activity,
  BarChart3,
  BatteryCharging,
  Gamepad2,
  Layers,
  LayoutDashboard,
  PackagePlus,
  Search,
  ShieldCheck,
  Sparkles,
  Swords,
  Wrench,
  Zap,
} from "lucide-react"

interface NavItem {
  title: string
  icon: ReactNode
  href: string
  description?: string
}

const navItems: NavItem[] = [
  {
    title: "Inicio",
    icon: <LayoutDashboard className="h-5 w-5" />,
    href: "/",
    description: "Vista general del sistema",
  },
  {
    title: "Simulador de Builds",
    icon: <Wrench className="h-5 w-5" />,
    href: "/simulator",
    description: "Construye y valida configuraciones",
  },
  {
    title: "Escaneo Local",
    icon: <Search className="h-5 w-5" />,
    href: "/scanner",
    description: "Analiza hardware del sistema",
  },
  {
    title: "Calculadora PSU",
    icon: <BatteryCharging className="h-5 w-5" />,
    href: "/psu",
    description: "Consumo energético y fuente recomendada",
  },
  {
    title: "Versus",
    icon: <Swords className="h-5 w-5" />,
    href: "/versus",
    description: "Compara componentes cara a cara",
  },
  {
    title: "Estimador de FPS",
    icon: <Gamepad2 className="h-5 w-5" />,
    href: "/fps",
    description: "Proyecta FPS en 50 juegos según tu hardware",
  },
  {
    title: "Monitor en Tiempo Real",
    icon: <Activity className="h-5 w-5" />,
    href: "/monitor",
    description: "Uso de CPU, GPU, RAM y temperatura en vivo",
  },
  {
    title: "Builds Recomendadas",
    icon: <Sparkles className="h-5 w-5" />,
    href: "/builds",
    description: "Configuraciones optimizadas",
  },
  {
    title: "Mis Builds",
    icon: <PackagePlus className="h-5 w-5" />,
    href: "/mis-builds",
    description: "Ensambles personalizados guardados",
  },
]

export function Sidebar() {
  const [expanded, setExpanded] = useState(false)
  const location = useLocation()

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className={cn(
        "relative z-30 flex h-screen flex-col overflow-hidden",
        "border-r border-white/[0.08] bg-white/[0.03] backdrop-blur-2xl glass-highlight",
        "transition-[width] duration-200 ease-out will-change-[width]",
        expanded ? "w-72" : "w-16",
      )}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(180deg, color-mix(in srgb, var(--section-accent) 14%, transparent), transparent 34%)",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-80"
        style={{
          backgroundImage: "linear-gradient(90deg, transparent, var(--section-accent), transparent)",
        }}
        aria-hidden="true"
      />

      <div className="relative flex h-16 items-center px-3">
        <div
          className={cn(
            "flex w-full items-center gap-2.5 transition-all",
            expanded ? "justify-start" : "justify-center",
          )}
        >
          {expanded ? <CorelyzeLogo /> : <CorelyzeMark size={34} />}
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden px-2 py-2">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.href}
                to={item.href}
                title={item.description}
                className={cn(
                  "group relative flex h-10 items-center rounded-xl text-sm transition-all duration-200 outline-none",
                  "focus-visible:ring-2 focus-visible:ring-section/60",
                  expanded ? "gap-3 px-3" : "justify-center px-2",
                  isActive
                    ? "bg-section/10 text-section ring-1 ring-section/35 shadow-[0_0_30px_-10px_var(--section-accent)]"
                    : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
                )}
              >
                {isActive && (
                  <span
                    className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-section glow-text"
                    aria-hidden="true"
                  />
                )}
                <span
                  className={cn(
                    "shrink-0 transition-transform duration-200 ease-out group-hover:scale-110",
                    isActive && "glow-text",
                  )}
                >
                  {item.icon}
                </span>
                <span
                  className={cn(
                    "flex-1 overflow-hidden text-left whitespace-nowrap transition-all duration-200 ease-out",
                    expanded ? "w-auto opacity-100" : "w-0 opacity-0",
                    isActive && "font-medium",
                  )}
                >
                  {item.title}
                </span>
              </Link>
            )
          })}
        </nav>

        <div
          className={cn(
            "overflow-hidden transition-all duration-200 ease-out",
            expanded ? "mt-3 max-h-96 opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <Separator className="my-3" />
          <div className="space-y-2 px-2">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Sistema
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
                <Activity className="h-4 w-4" />
                <span>Estado: En línea</span>
              </div>
              <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
                <Zap className="h-4 w-4" />
                <span>Compatibilidad: Activo</span>
              </div>
              <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
                <ShieldCheck className="h-4 w-4" />
                <span>Validación en tiempo real</span>
              </div>
              <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
                <BarChart3 className="h-4 w-4" />
                <span>Análisis de cuellos de botella</span>
              </div>
              <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
                <Layers className="h-4 w-4" />
                <span>Catálogo masivo</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative border-t border-white/[0.08] p-2">
        <div
          className={cn(
            "overflow-hidden text-center text-[10px] whitespace-nowrap text-muted-foreground transition-all duration-200 ease-out",
            expanded ? "h-4 opacity-100" : "h-0 opacity-0",
          )}
        >
          Corelyze v1.0
        </div>
      </div>
    </aside>
  )
}