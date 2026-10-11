# Corelyze v1.0

<p align="center">
  <img src="Emblema C Neón Futurista.png" alt="Corelyze Logo" width="160" />
</p>

<p align="center">
  <strong>Plataforma Comercial Multiplataforma de Diagnóstico, Simulación, Gestión de Compatibilidad y Telemetría de Hardware de PC</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version 1.0.0" />
  <img src="https://img.shields.io/badge/architecture-Offline--First-emerald.svg" alt="Offline-First" />
  <img src="https://img.shields.io/badge/frontend-React%2019%20%2B%20Vite%208-cyan.svg" alt="React 19" />
  <img src="https://img.shields.io/badge/backend-NestJS%2011%20%2B%20SQLite-red.svg" alt="NestJS 11" />
  <img src="https://img.shields.io/badge/desktop-Tauri%20v2%20(Rust)-orange.svg" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/styling-Tailwind%20CSS%20v4-38bdf8.svg" alt="Tailwind CSS v4" />
</p>

---

## 🚀 Visión General

**Corelyze** es una suite de escritorio diseñada con arquitectura *offline-first* para entusiastas, técnicos y ensambladores de PC. Permite auditar el hardware instalado en tiempo real, validar compatibilidad técnica de componentes, estimar consumo energético (PSU), proyectar tasas de cuadros por segundo (FPS) en más de 50 títulos de juegos y comparar componentes mano a mano sin depender de servicios en la nube.

---

## 🏗️ Arquitectura del Sistema

El proyecto está organizado como un **monorepo modular** gestionado con `npm workspaces`:

```
analizador-hardware/
├── apps/
│   ├── backend/              # API REST NestJS 11 (Clean Architecture + DDD)
│   │   ├── prisma/           # Esquema Prisma ORM + Migraciones + Seed local
│   │   ├── src/
│   │   │   ├── domain/       # Entidades, agregados y contratos de repositorios
│   │   │   ├── application/  # Casos de uso, DTOs y lógica de negocio
│   │   │   ├── infrastructure/# PrismaService, drivers de telemetría y SQLite
│   │   │   └── presentation/ # Controladores REST y documentación Swagger
│   │   └── scripts/          # Automatización de puertos y preparación de SQLite
│   ├── frontend/             # SPA React 19 + TypeScript + Vite 8
│   │   ├── src/
│   │   │   ├── components/   # UI (Radix, Shadcn), Header, Sidebar, Brand
│   │   │   ├── pages/        # Dashboard, Simulator, Scanner, PSU, Versus, FPS, Monitor
│   │   │   ├── services/     # Clientes de API con fallback offline
│   │   │   └── contexts/     # Gestión de estado global
│   │   └── public/           # Logo oficial, favicon.ico multi-resolución y recursos
│   └── agent/                # Aplicación de Escritorio Nativa (Tauri v2 + Rust)
│       ├── package.json      # Scripts de integración con workspaces
│       └── src-tauri/        # Código Rust, capacidades del sistema, iconos e instalador
├── packages/
│   ├── types/                # Contratos de tipos TypeScript compartidos
│   ├── schemas/              # Esquemas de validación Zod
│   └── shared/               # Constantes y utilidades comunes
├── assets/                   # Recursos binarios (icon.ico multi-resolución)
└── Emblema C Neón Futurista.png # Logotipo oficial en alta resolución
```

### Principios Clave:
1. **Offline-First:** Base de datos relacional SQLite local embebida (`corelyze.sqlite`). La aplicación no requiere conexión a internet para funcionar al 100%.
2. **Sincronización Silenciosa:** Si se define `CATALOG_SYNC_URL`, `CatalogSyncService` actualiza el catálogo en segundo plano sin interrumpir la experiencia de usuario.
3. **Alto Rendimiento Nativo:** Telemetría de hardware en tiempo real impulsada por `systeminformation` en Node.js y llamadas nativas de bajo nivel en Rust (Tauri).

---

## 🛠️ Pila Tecnológica

| Capa | Tecnologías |
|---|---|
| **Escritorio Nativo** | Tauri v2.12 (Rust 1.99, MSVC), NSIS Installer, WiX MSI Toolset |
| **Frontend** | React 19, Vite 8, TypeScript 6, Tailwind CSS v4, Lucide Icons, Radix UI |
| **Backend** | NestJS 11, Express, Prisma ORM 5.22, Swagger/OpenAPI |
| **Almacenamiento** | SQLite 3 (local embebido), Caché en memoria |
| **Branding** | Icono ICO nativo para Windows (16x16, 32x32, 48x48, 64x64, 128x128, 256x256) |

---

## 🧩 Módulos del Sistema

1. **Dashboard Principal (`/`):** Vista panorámica del estado del sistema, resumen de hardware detectado y accesos directos a herramientas.
2. **Simulador de Ensambles (`/simulator`):** Diseña configuraciones personalizadas de PC verificando compatibilidad de sockets (ej. AM4, AM5, LGA1700), slots PCIe, formato de placa base y factor de forma de gabinete.
3. **Escaneo Local de Hardware (`/scanner`):** Diagnóstico profundo de CPU, GPU, memoria RAM, almacenamiento NVMe/SATA y placa base con lectura de especificaciones de hardware.
4. **Calculadora de PSU (`/psu`):** Cálculo preciso del consumo TDP por componente, factor de sobretensión (*transient spikes*) y recomendación de potencia y certificación 80 Plus.
5. **Comparador Versus (`/versus`):** Comparación cara a cara de procesadores y tarjetas de video con especificaciones normalizadas.
6. **Estimador de Rendimiento en FPS (`/fps`):** Proyección de tasas de cuadros por segundo en más de 50 juegos modernos a 1080p, 1440p y 4K.
7. **Monitor en Tiempo Real (`/monitor`):** Telemetría continua de carga y uso de recursos del sistema.

---

## ⚡ Guía de Inicio Rápido (Desarrollo)

### Requisitos Previos:
- **Node.js** v20+ o v22+
- **Rust & Cargo** (1.85+) con soporte para Windows MSVC (`rustup target add x86_64-pc-windows-msvc`)
- **Git**

### Pasos de Instalación:

1. **Clonar e instalar dependencias:**
   ```bash
   git clone <repo-url>
   cd "Analizador de Hardware"
   npm install
   ```

2. **Preparar la Base de Datos Local:**
   ```bash
   npm run db:generate   # Genera el cliente Prisma
   npm run db:deploy     # Aplica las migraciones SQLite
   npm run db:seed       # Puebla la base de datos con el catálogo inicial
   ```

3. **Iniciar en Modo Desarrollo Concurrente:**
   ```bash
   npm run dev
   ```
   - **Frontend:** `http://localhost:5173`
   - **API Backend:** `http://localhost:3000/api`
   - **Documentación Swagger:** `http://localhost:3000/api/docs`

---

## 📦 Compilación y Generación del Ejecutable (.exe)

Para compilar el frontend y generar el instalador independiente de Windows de Corelyze:

```bash
npm run tauri:build
```
O directamente desde la carpeta del agente:
```bash
npx --prefix apps/agent tauri build
```

### Salida del Empaquetado:
Los binarios de distribución se generan en:
- **Instalador NSIS (.exe):** `apps/agent/src-tauri/target/release/bundle/nsis/Corelyze_1.0.0_x64-setup.exe`
- **Instalador MSI (.msi):** `apps/agent/src-tauri/target/release/bundle/msi/Corelyze_1.0.0_x64_en-US.msi`
- **Ejecutable Standalone (.exe):** `apps/agent/src-tauri/target/release/app.exe`

---

## 🎨 Identidad Visual y Recursos

- **Logotipo Oficial:** `Emblema C Neón Futurista.png` (raíz) y `apps/frontend/public/logo.png`.
- **Icono de Aplicación:** `assets/icon.ico` y `apps/agent/src-tauri/icons/icon.ico` integrado con resoluciones múltiples (16x16 hasta 256x256).
- **Estilo:** Interfaz en modo oscuro cyberpunk con gradientes neón (`#5EB3FF` / `#35D6E8` / `#A78BFA`) y efectos de desenfoque *glassmorphism*.

---

## 📄 Licencia

Uso comercial y privado registrado para **Corelyze**. Todos los derechos reservados.
