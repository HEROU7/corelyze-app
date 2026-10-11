/**
 * Base de conocimientos del Estimador de FPS.
 *
 * Cada título define un "punto de referencia": los FPS promedio que se
 * alcanzarían en 1080p / preset Medio sobre un sistema de referencia
 * (GPU score ≈ 20000 ≈ RTX 3060 Ti / RTX 4060, CPU score ≈ 20000 ≈ i5-13400F).
 *
 * El motor (`fps-estimator.ts`) escala estos valores según la GPU, la CPU,
 * la RAM, el almacenamiento, la resolución y el preset visual elegidos.
 */

export type FpsResolution = "1080p" | "1440p" | "4K"
export type FpsPreset = "Bajo" | "Medio" | "Alto" | "Ultra"

export type GameCategory =
  | "Competitivos"
  | "eSports"
  | "AAA Exigentes"
  | "Simulación"
  | "Sandbox"

export const FPS_RESOLUTIONS: FpsResolution[] = ["1080p", "1440p", "4K"]
export const FPS_PRESETS: FpsPreset[] = ["Bajo", "Medio", "Alto", "Ultra"]

export const GAME_CATEGORIES: GameCategory[] = [
  "Competitivos",
  "eSports",
  "AAA Exigentes",
  "Simulación",
  "Sandbox",
]

type Scale<T extends string> = Record<T, number>

export interface GameEntry {
  id: string
  name: string
  category: GameCategory
  year: number
  /** FPS promedio en 1080p / Medio sobre el sistema de referencia. */
  refFps1080Medium: number
  /** Techo de FPS alcanzable con una CPU tope (límite por CPU / motor). */
  cpuCeilingBase: number
  /** Dependencia de la CPU (0 = cien por cien GPU, 1 = cien por cien CPU). */
  cpuBound: number
  resScale: Scale<FpsResolution>
  presetScale: Scale<FpsPreset>
  /** VRAM necesaria (GB) por preset para texturas calibradas. */
  vram: Scale<FpsPreset>
  ramRecommendedGB: number
  rayTracing: boolean
  upscaler: boolean
  notes?: string
}

const DEFAULT_RES: Scale<FpsResolution> = { "1080p": 1, "1440p": 0.68, "4K": 0.42 }
const DEFAULT_PRESET: Scale<FpsPreset> = { Bajo: 1.32, Medio: 1, Alto: 0.78, Ultra: 0.5 }
const DEFAULT_VRAM: Scale<FpsPreset> = { Bajo: 3, Medio: 4, Alto: 6, Ultra: 8 }

interface GameOverrides {
  resScale?: Partial<Scale<FpsResolution>>
  presetScale?: Partial<Scale<FpsPreset>>
  vram?: Partial<Scale<FpsPreset>>
  ramRecommendedGB?: number
  rayTracing?: boolean
  upscaler?: boolean
  notes?: string
}

function makeGame(
  id: string,
  name: string,
  category: GameCategory,
  year: number,
  refFps1080Medium: number,
  cpuCeilingBase: number,
  cpuBound: number,
  overrides: GameOverrides = {},
): GameEntry {
  return {
    id,
    name,
    category,
    year,
    refFps1080Medium,
    cpuCeilingBase,
    cpuBound,
    resScale: { ...DEFAULT_RES, ...overrides.resScale },
    presetScale: { ...DEFAULT_PRESET, ...overrides.presetScale },
    vram: { ...DEFAULT_VRAM, ...overrides.vram },
    ramRecommendedGB: overrides.ramRecommendedGB ?? 16,
    rayTracing: overrides.rayTracing ?? false,
    upscaler: overrides.upscaler ?? false,
    notes: overrides.notes,
  }
}

export const GAMES: GameEntry[] = [
  // ───────────────────────── Competitivos ─────────────────────────
  makeGame("valorant", "Valorant", "Competitivos", 2020, 400, 720, 0.92, {
    resScale: { "1440p": 0.82, "4K": 0.6 },
    presetScale: { Bajo: 1.25, Medio: 1, Alto: 0.85, Ultra: 0.6 },
    vram: { Bajo: 2, Medio: 3, Alto: 4, Ultra: 6 },
    ramRecommendedGB: 8,
    notes: "Título competitivo ligero: casi siempre limitado por CPU.",
  }),
  makeGame("cs2", "Counter-Strike 2", "Competitivos", 2023, 320, 560, 0.85, {
    resScale: { "1440p": 0.78, "4K": 0.55 },
    ramRecommendedGB: 8,
    notes: "Muy sensible al rendimiento de la CPU.",
  }),
  makeGame("lol", "League of Legends", "Competitivos", 2009, 350, 620, 0.8, {
    resScale: { "1440p": 0.88, "4K": 0.7 },
    presetScale: { Bajo: 1.15, Medio: 1, Alto: 0.9, Ultra: 0.82 },
    ramRecommendedGB: 8,
  }),
  makeGame("dota2", "Dota 2", "Competitivos", 2013, 260, 430, 0.78, {
    resScale: { "1440p": 0.84, "4K": 0.62 },
    ramRecommendedGB: 16,
  }),
  makeGame("apex", "Apex Legends", "Competitivos", 2019, 150, 250, 0.55, {
    ramRecommendedGB: 16,
  }),
  makeGame("overwatch2", "Overwatch 2", "Competitivos", 2022, 200, 360, 0.62, {
    ramRecommendedGB: 8,
  }),
  makeGame("r6siege", "Rainbow Six Siege", "Competitivos", 2015, 260, 400, 0.58, {
    ramRecommendedGB: 16,
  }),
  makeGame("warzone", "Call of Duty: Warzone", "Competitivos", 2020, 120, 200, 0.7, {
    ramRecommendedGB: 16,
  }),
  makeGame("pubg", "PUBG: Battlegrounds", "Competitivos", 2017, 130, 220, 0.66, {
    ramRecommendedGB: 16,
  }),
  makeGame("thefinals", "The Finals", "Competitivos", 2023, 120, 190, 0.6, {
    ramRecommendedGB: 16,
    rayTracing: true,
    upscaler: true,
  }),

  // ─────────────────────────── eSports ────────────────────────────
  makeGame("fortnite", "Fortnite", "eSports", 2017, 160, 320, 0.58, {
    ramRecommendedGB: 16,
    rayTracing: true,
    upscaler: true,
  }),
  makeGame("rocketleague", "Rocket League", "eSports", 2015, 300, 520, 0.7, {
    resScale: { "1440p": 0.85, "4K": 0.66 },
    ramRecommendedGB: 8,
  }),
  makeGame("marvelrivals", "Marvel Rivals", "eSports", 2024, 130, 205, 0.62, {
    ramRecommendedGB: 16,
    upscaler: true,
  }),
  makeGame("haloinfinite", "Halo Infinite", "eSports", 2021, 160, 265, 0.52, {
    ramRecommendedGB: 16,
  }),
  makeGame("eafc25", "EA Sports FC 25", "eSports", 2024, 220, 340, 0.56, {
    ramRecommendedGB: 16,
  }),
  makeGame("nba2k25", "NBA 2K25", "eSports", 2024, 200, 300, 0.52, {
    ramRecommendedGB: 16,
  }),
  makeGame("sf6", "Street Fighter 6", "eSports", 2023, 180, 300, 0.5, {
    ramRecommendedGB: 8,
  }),
  makeGame("tekken8", "Tekken 8", "eSports", 2024, 170, 280, 0.5, {
    ramRecommendedGB: 16,
  }),

  // ───────────────────────── AAA Exigentes ────────────────────────
  makeGame("cyberpunk", "Cyberpunk 2077: Phantom Liberty", "AAA Exigentes", 2023, 75, 155, 0.55, {
    vram: { Bajo: 4, Medio: 6, Alto: 8, Ultra: 10 },
    ramRecommendedGB: 16,
    rayTracing: true,
    upscaler: true,
    notes: "Con Ray Tracing completo incluso las GPU tope sufren en 4K.",
  }),
  makeGame("rdr2", "Red Dead Redemption 2", "AAA Exigentes", 2019, 90, 165, 0.5, {
    vram: { Bajo: 4, Medio: 6, Alto: 8, Ultra: 8 },
    ramRecommendedGB: 16,
  }),
  makeGame("alanwake2", "Alan Wake 2", "AAA Exigentes", 2023, 55, 135, 0.42, {
    vram: { Bajo: 6, Medio: 8, Alto: 10, Ultra: 12 },
    ramRecommendedGB: 16,
    rayTracing: true,
    upscaler: true,
    notes: "Requiere GPU con soporte de malla (RT) para su máximo esplendor.",
  }),
  makeGame("wukong", "Black Myth: Wukong", "AAA Exigentes", 2024, 62, 145, 0.45, {
    vram: { Bajo: 6, Medio: 8, Alto: 10, Ultra: 12 },
    ramRecommendedGB: 16,
    rayTracing: true,
    upscaler: true,
  }),
  makeGame("hogwarts", "Hogwarts Legacy", "AAA Exigentes", 2023, 70, 145, 0.5, {
    vram: { Bajo: 6, Medio: 8, Alto: 10, Ultra: 12 },
    ramRecommendedGB: 16,
    rayTracing: true,
    upscaler: true,
    notes: "Muy sensible a la VRAM: 8 GB sufren con texturas altas.",
  }),
  makeGame("starfield", "Starfield", "AAA Exigentes", 2023, 68, 130, 0.62, {
    vram: { Bajo: 6, Medio: 8, Alto: 10, Ultra: 12 },
    ramRecommendedGB: 16,
    upscaler: true,
  }),
  makeGame("gtav", "Grand Theft Auto V", "AAA Exigentes", 2015, 180, 310, 0.56, {
    ramRecommendedGB: 16,
    rayTracing: true,
    upscaler: true,
  }),
  makeGame("tlou1", "The Last of Us Part I", "AAA Exigentes", 2023, 70, 135, 0.56, {
    vram: { Bajo: 6, Medio: 8, Alto: 8, Ultra: 10 },
    ramRecommendedGB: 16,
    upscaler: true,
  }),
  makeGame("gowr", "God of War Ragnarök", "AAA Exigentes", 2024, 85, 165, 0.46, {
    vram: { Bajo: 4, Medio: 6, Alto: 8, Ultra: 10 },
    ramRecommendedGB: 16,
    upscaler: true,
  }),
  makeGame("eldenring", "Elden Ring", "AAA Exigentes", 2022, 60, 95, 0.5, {
    vram: { Bajo: 4, Medio: 6, Alto: 6, Ultra: 8 },
    ramRecommendedGB: 16,
    notes: "El juego limita a 60 FPS de fábrica.",
  }),
  makeGame("acmirage", "Assassin's Creed Mirage", "AAA Exigentes", 2023, 95, 175, 0.56, {
    ramRecommendedGB: 16,
    upscaler: true,
  }),
  makeGame("farcry6", "Far Cry 6", "AAA Exigentes", 2021, 100, 185, 0.5, {
    ramRecommendedGB: 16,
    rayTracing: true,
    upscaler: true,
  }),
  makeGame("bf2042", "Battlefield 2042", "AAA Exigentes", 2021, 110, 205, 0.66, {
    ramRecommendedGB: 16,
    upscaler: true,
  }),
  makeGame("control", "Control Ultimate Edition", "AAA Exigentes", 2021, 78, 150, 0.46, {
    vram: { Bajo: 4, Medio: 6, Alto: 8, Ultra: 10 },
    ramRecommendedGB: 16,
    rayTracing: true,
    upscaler: true,
    notes: "Referente en Ray Tracing: activa DLSS/FSR para mantener fluidez.",
  }),
  makeGame("forza5", "Forza Horizon 5", "AAA Exigentes", 2021, 140, 235, 0.5, {
    ramRecommendedGB: 16,
    rayTracing: true,
    upscaler: true,
  }),
  makeGame("metroexodus", "Metro Exodus Enhanced", "AAA Exigentes", 2021, 82, 160, 0.45, {
    vram: { Bajo: 6, Medio: 8, Alto: 10, Ultra: 12 },
    ramRecommendedGB: 16,
    rayTracing: true,
    upscaler: true,
  }),

  // ───────────────────────── Simulación ───────────────────────────
  makeGame("msfs2024", "Microsoft Flight Simulator 2024", "Simulación", 2024, 55, 90, 0.85, {
    resScale: { "1440p": 0.72, "4K": 0.5 },
    vram: { Bajo: 8, Medio: 10, Alto: 12, Ultra: 16 },
    ramRecommendedGB: 32,
    rayTracing: true,
    upscaler: true,
    notes: "Extremadamente dependiente de CPU y RAM.",
  }),
  makeGame("ets2", "Euro Truck Simulator 2", "Simulación", 2012, 110, 165, 0.82, {
    ramRecommendedGB: 16,
    upscaler: true,
  }),
  makeGame("citiesskylines2", "Cities: Skylines II", "Simulación", 2023, 50, 78, 0.92, {
    vram: { Bajo: 8, Medio: 10, Alto: 12, Ultra: 16 },
    ramRecommendedGB: 32,
    upscaler: true,
    notes: "La simulación de agentes castiga sobre todo a la CPU.",
  }),
  makeGame("farming25", "Farming Simulator 25", "Simulación", 2024, 120, 205, 0.72, {
    ramRecommendedGB: 16,
    rayTracing: true,
    upscaler: true,
  }),
  makeGame("acc", "Assetto Corsa Competizione", "Simulación", 2019, 130, 225, 0.62, {
    vram: { Bajo: 4, Medio: 6, Alto: 8, Ultra: 10 },
    ramRecommendedGB: 16,
    upscaler: true,
  }),
  makeGame("iracing", "iRacing", "Simulación", 2008, 180, 310, 0.62, {
    ramRecommendedGB: 16,
  }),
  makeGame("sims4", "The Sims 4", "Simulación", 2014, 160, 245, 0.72, {
    ramRecommendedGB: 16,
  }),
  makeGame("ksp2", "Kerbal Space Program 2", "Simulación", 2023, 60, 82, 0.93, {
    ramRecommendedGB: 32,
    notes: "Limitado por CPU: física de cohetes y muchas naves.",
  }),

  // ─────────────────────────── Sandbox ────────────────────────────
  makeGame("minecraft", "Minecraft (Java)", "Sandbox", 2011, 200, 330, 0.86, {
    resScale: { "1440p": 0.82, "4K": 0.62 },
    presetScale: { Bajo: 1.2, Medio: 1, Alto: 0.82, Ultra: 0.65 },
    ramRecommendedGB: 8,
  }),
  makeGame("minecraftrtx", "Minecraft con Shaders / RTX", "Sandbox", 2011, 90, 185, 0.62, {
    vram: { Bajo: 6, Medio: 8, Alto: 10, Ultra: 12 },
    ramRecommendedGB: 16,
    rayTracing: true,
    upscaler: true,
    notes: "El trazado de rayos multiplica la carga sobre la GPU.",
  }),
  makeGame("roblox", "Roblox", "Sandbox", 2006, 200, 300, 0.78, {
    ramRecommendedGB: 8,
  }),
  makeGame("terraria", "Terraria", "Sandbox", 2011, 240, 360, 0.72, {
    ramRecommendedGB: 8,
  }),
  makeGame("valheim", "Valheim", "Sandbox", 2021, 100, 180, 0.76, {
    ramRecommendedGB: 16,
  }),
  makeGame("palworld", "Palworld", "Sandbox", 2024, 95, 160, 0.7, {
    ramRecommendedGB: 16,
    notes: "Con muchos Pals activos la CPU pasa a ser el límite.",
  }),
  makeGame("rust", "Rust", "Sandbox", 2018, 90, 150, 0.86, {
    vram: { Bajo: 4, Medio: 6, Alto: 8, Ultra: 10 },
    ramRecommendedGB: 16,
  }),
  makeGame("nomanssky", "No Man's Sky", "Sandbox", 2016, 90, 150, 0.6, {
    ramRecommendedGB: 16,
    upscaler: true,
  }),
]

export function getGameById(id: string): GameEntry | undefined {
  return GAMES.find((g) => g.id === id)
}
