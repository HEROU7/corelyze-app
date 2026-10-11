import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface SplashScreenProps {
  onComplete: () => void
}

const HOLD_MS = 1900
const FADE_MS = 500

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const holdTimer = setTimeout(() => setFading(true), HOLD_MS)
    const doneTimer = setTimeout(onComplete, HOLD_MS + FADE_MS)
    return () => {
      clearTimeout(holdTimer)
      clearTimeout(doneTimer)
    }
  }, [onComplete])

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-[#060D1A]",
        "transition-opacity ease-out",
        fading ? "opacity-0" : "opacity-100",
      )}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      <div className="flex flex-col items-center px-6 text-center animate-in fade-in zoom-in duration-700">
        <div className="relative mb-8">
          <div className="absolute inset-0 scale-150 rounded-full bg-[#35D6E8]/20 blur-3xl" />
          <img
            src="/logo.png"
            alt="Corelyze"
            width={112}
            height={112}
            className="relative drop-shadow-[0_0_28px_color-mix(in_srgb,#35D6E8_45%,transparent)]"
            draggable={false}
          />
        </div>

        <h1
          className="bg-clip-text text-6xl font-bold tracking-tight text-transparent sm:text-7xl"
          style={{
            fontFamily: "var(--font-display)",
            backgroundImage: "linear-gradient(90deg, #5EB3FF, #35D6E8, #A78BFA)",
          }}
        >
          Corelyze
        </h1>

        <p className="mt-5 max-w-xl text-base text-[#8FB0DD] sm:text-lg">
          Rendimiento, Compatibilidad y Precisión en Cada Ensamble
        </p>
      </div>
    </div>
  )
}