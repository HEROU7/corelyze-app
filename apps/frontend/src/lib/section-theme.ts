import type { CSSProperties } from "react"

export type SectionKey =
  | "home"
  | "scanner"
  | "builder"
  | "psu"
  | "comparator"
  | "builds"
  | "saved"
  | "fps"
  | "monitor"

export interface SectionTheme {
  key: SectionKey
  label: string
  /** Color de acento principal (también alimenta `--primary`). */
  accent: string
  /** Segundo color para degradados y luces secundarias. */
  accent2: string
  orb1: string
  orb2: string
  orb3: string
  circuit: string
}

export const SECTION_THEMES: Record<SectionKey, SectionTheme> = {
  home: {
    key: "home",
    label: "Inicio",
    accent: "hsl(262 70% 62%)",
    accent2: "hsl(199 78% 58%)",
    orb1: "hsl(262 70% 60% / 0.26)",
    orb2: "hsl(199 78% 58% / 0.18)",
    orb3: "hsl(220 78% 58% / 0.14)",
    circuit: "hsl(222 78% 68% / 0.45)",
  },
  scanner: {
    key: "scanner",
    label: "Escaneo y Salud",
    accent: "hsl(92 62% 55%)",
    accent2: "hsl(186 68% 52%)",
    orb1: "hsl(92 62% 52% / 0.24)",
    orb2: "hsl(186 68% 52% / 0.18)",
    orb3: "hsl(150 60% 48% / 0.13)",
    circuit: "hsl(150 70% 60% / 0.40)",
  },
  builder: {
    key: "builder",
    label: "Simulador de Builds",
    accent: "hsl(217 78% 60%)",
    accent2: "hsl(186 74% 54%)",
    orb1: "hsl(217 78% 56% / 0.26)",
    orb2: "hsl(186 74% 54% / 0.18)",
    orb3: "hsl(235 74% 60% / 0.14)",
    circuit: "hsl(206 80% 68% / 0.45)",
  },
  psu: {
    key: "psu",
    label: "Calculadora PSU",
    accent: "hsl(46 82% 55%)",
    accent2: "hsl(38 82% 52%)",
    orb1: "hsl(46 82% 53% / 0.22)",
    orb2: "hsl(38 82% 52% / 0.17)",
    orb3: "hsl(30 74% 52% / 0.13)",
    circuit: "hsl(45 82% 64% / 0.38)",
  },
  comparator: {
    key: "comparator",
    label: "Versus",
    accent: "hsl(282 70% 64%)",
    accent2: "hsl(316 70% 60%)",
    orb1: "hsl(282 70% 60% / 0.26)",
    orb2: "hsl(316 70% 58% / 0.18)",
    orb3: "hsl(255 70% 60% / 0.14)",
    circuit: "hsl(290 74% 70% / 0.42)",
  },
  builds: {
    key: "builds",
    label: "Builds Recomendadas",
    accent: "hsl(168 54% 55%)",
    accent2: "hsl(156 54% 55%)",
    orb1: "hsl(168 54% 52% / 0.24)",
    orb2: "hsl(156 54% 52% / 0.18)",
    orb3: "hsl(185 60% 54% / 0.13)",
    circuit: "hsl(165 64% 62% / 0.40)",
  },
  saved: {
    key: "saved",
    label: "Mis Builds",
    accent: "hsl(168 54% 55%)",
    accent2: "hsl(156 54% 55%)",
    orb1: "hsl(168 54% 52% / 0.24)",
    orb2: "hsl(156 54% 52% / 0.18)",
    orb3: "hsl(185 60% 54% / 0.13)",
    circuit: "hsl(165 64% 62% / 0.40)",
  },
  fps: {
    key: "fps",
    label: "Estimador de FPS",
    accent: "hsl(25 95% 53%)",
    accent2: "hsl(27 96% 61%)",
    orb1: "hsl(25 95% 53% / 0.26)",
    orb2: "hsl(20 90% 55% / 0.18)",
    orb3: "hsl(38 92% 52% / 0.13)",
    circuit: "hsl(28 96% 62% / 0.42)",
  },
  monitor: {
    key: "monitor",
    label: "Monitor en Tiempo Real",
    accent: "hsl(160 84% 39%)",
    accent2: "hsl(158 64% 52%)",
    orb1: "hsl(160 84% 39% / 0.26)",
    orb2: "hsl(158 64% 48% / 0.18)",
    orb3: "hsl(172 66% 45% / 0.13)",
    circuit: "hsl(162 72% 55% / 0.42)",
  },
}

export function sectionForPath(pathname: string): SectionKey {
  if (pathname.startsWith("/scanner")) return "scanner"
  if (pathname.startsWith("/simulator")) return "builder"
  if (pathname.startsWith("/psu")) return "psu"
  if (pathname.startsWith("/versus")) return "comparator"
  if (pathname.startsWith("/mis-builds")) return "saved"
  if (pathname.startsWith("/builds")) return "builds"
  if (pathname.startsWith("/fps")) return "fps"
  if (pathname.startsWith("/monitor")) return "monitor"
  return "home"
}

export function sectionVars(theme: SectionTheme): CSSProperties {
  return {
    "--primary": theme.accent,
    "--ring": theme.accent,
    "--section-accent": theme.accent,
    "--section-accent-2": theme.accent2,
    "--section-orb-1": theme.orb1,
    "--section-orb-2": theme.orb2,
    "--section-orb-3": theme.orb3,
    "--section-circuit": theme.circuit,
    // Versión profunda/oscurecida del acento: relleno sólido que respeta WCAG
    // con texto blanco (mantiene la matiz de la sección pero con luminancia baja).
    "--primary-deep": `color-mix(in srgb, ${theme.accent} 46%, #0a0e18)`,
    "--primary-deep-hover": `color-mix(in srgb, ${theme.accent} 58%, #0a0e18)`,
  } as CSSProperties
}
