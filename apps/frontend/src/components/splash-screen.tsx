import { useEffect, useState, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"
import { Loader2, CheckCircle2, AlertTriangle, RotateCcw, ArrowRight, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { resolveApiUrl, getApiUrlSync } from "@/lib/api/client"

interface SplashScreenProps {
  onComplete: () => void
}

const MIN_SPLASH_MS = 1400
const MAX_ATTEMPTS = 45 // ~27 segundos max
const POLL_INTERVAL_MS = 600
const FADE_MS = 500

const STATUS_MESSAGES = [
  "Iniciando motor de Corelyze...",
  "Conectando con los servicios locales...",
  "Verificando base de datos SQLite...",
  "Sincronizando catálogo y componentes...",
  "Finalizando inicialización...",
]

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [fading, setFading] = useState(false)
  const [status, setStatus] = useState<"connecting" | "ready" | "error">("connecting")
  const [attempts, setAttempts] = useState(0)
  const [statusMessageIndex, setStatusMessageIndex] = useState(0)
  const [activeApiUrl, setActiveApiUrl] = useState<string>(getApiUrlSync())
  const startTimeRef = useRef(Date.now())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const checkApiHealth = async (url: string): Promise<boolean> => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 1500)
      const res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      return res.ok || res.status < 500
    } catch {
      return false
    }
  }

  const finishSplash = useCallback(() => {
    setStatus("ready")
    const elapsed = Date.now() - startTimeRef.current
    const remainingHold = Math.max(0, MIN_SPLASH_MS - elapsed)

    setTimeout(() => {
      setFading(true)
      setTimeout(onComplete, FADE_MS)
    }, remainingHold + 300)
  }, [onComplete])

  const startPolling = useCallback(() => {
    setStatus("connecting")
    setAttempts(0)
    let currentAttempt = 0

    const poll = async () => {
      const resolvedUrl = await resolveApiUrl()
      setActiveApiUrl(resolvedUrl)

      currentAttempt++
      setAttempts(currentAttempt)
      setStatusMessageIndex((prev) => (prev + 1) % STATUS_MESSAGES.length)

      const isReady = await checkApiHealth(resolvedUrl)
      if (isReady) {
        finishSplash()
        return
      }

      if (currentAttempt >= MAX_ATTEMPTS) {
        setStatus("error")
        return
      }

      timerRef.current = setTimeout(poll, POLL_INTERVAL_MS)
    }

    poll()
  }, [finishSplash])

  useEffect(() => {
    startPolling()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [startPolling])

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-[#060D1A]",
        "transition-opacity ease-out",
        fading ? "opacity-0 pointer-events-none" : "opacity-100",
      )}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      <div className="flex flex-col items-center px-6 text-center animate-in fade-in zoom-in duration-700 max-w-lg">
        {/* Logo con Resplandor Neón */}
        <div className="relative mb-8">
          <div className="absolute inset-0 scale-150 rounded-full bg-[#35D6E8]/20 blur-3xl animate-pulse" />
          <img
            src="/logo.png"
            alt="Corelyze"
            width={112}
            height={112}
            className="relative drop-shadow-[0_0_28px_color-mix(in_srgb,#35D6E8_45%,transparent)] select-none"
            draggable={false}
          />
        </div>

        {/* Título de la Aplicación */}
        <h1
          className="bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-6xl"
          style={{
            fontFamily: "var(--font-display)",
            backgroundImage: "linear-gradient(90deg, #5EB3FF, #35D6E8, #A78BFA)",
          }}
        >
          Corelyze
        </h1>

        <p className="mt-3 text-sm text-[#8FB0DD] sm:text-base font-normal">
          Rendimiento, Compatibilidad y Precisión en Cada Ensamble
        </p>

        {/* Estado de Conexión y Barra de Carga */}
        <div className="mt-8 w-full max-w-sm rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 backdrop-blur-xl shadow-2xl">
          {status === "connecting" && (
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2.5 text-sm font-medium text-[#35D6E8]">
                <Loader2 className="h-4 w-4 animate-spin text-[#35D6E8]" />
                <span>{STATUS_MESSAGES[statusMessageIndex]}</span>
              </div>

              {/* Barra de progreso indeterminada con animación pulsante */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                <div
                  className="h-full w-2/5 rounded-full bg-gradient-to-r from-[#5EB3FF] to-[#35D6E8]"
                  style={{
                    animation: "pulse 1.4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                    width: `${Math.min(100, Math.max(15, (attempts / MAX_ATTEMPTS) * 100))}%`,
                    transition: "width 0.4s ease-out",
                  }}
                />
              </div>

              <div className="text-[11px] text-[#8FB0DD]/70">
                Sincronizando motor local (intento {attempts} de {MAX_ATTEMPTS})
              </div>
            </div>
          )}

          {status === "ready" && (
            <div className="flex items-center justify-center gap-2 text-sm font-medium text-emerald-400">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>Motor listo. Iniciando espacio de trabajo...</span>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center gap-3 text-left">
              <div className="flex items-start gap-2.5 text-amber-300">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-semibold text-foreground">El motor local está tardando en responder</p>
                  <p className="mt-1 text-muted-foreground text-[11px]">
                    No se recibió respuesta en {activeApiUrl} tras varios intentos.
                  </p>
                </div>
              </div>

              <div className="w-full rounded-md border border-white/[0.08] bg-black/40 p-2.5 text-[11px] text-[#8FB0DD]/80">
                <div className="flex items-center gap-1.5 font-medium text-[#5EB3FF] mb-1">
                  <FileText className="h-3.5 w-3.5" />
                  <span>Diagnóstico y registro del sidecar:</span>
                </div>
                <code className="block break-all font-mono text-[10px] text-white/90 select-all bg-white/[0.04] p-1 rounded">
                  %APPDATA%\Corelyze\logs\backend.log
                </code>
              </div>

              <div className="mt-1 flex w-full items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={startPolling}
                  className="flex-1 gap-1.5 border-white/10 hover:bg-white/10 text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reintentar
                </Button>
                <Button
                  size="sm"
                  onClick={onComplete}
                  className="flex-1 gap-1.5 bg-gradient-to-r from-[#5EB3FF] to-[#35D6E8] text-black font-semibold hover:opacity-90 text-xs"
                >
                  Continuar
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}