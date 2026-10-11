# Estructura del Proyecto - Analizador de Hardware

## FASE 1 - Completada

### Arquitectura General
```
analizador-hardware/
├── apps/
│   ├── backend/              # NestJS API (Clean Architecture + DDD)
│   │   ├── prisma/           # Esquema Prisma, migraciones y seeds
│   │   │   ├── schema.prisma # Esquema relacional + JSONB
│   │   │   └── seed.ts        # Datos iniciales
│   │   ├── src/
│   │   │   ├── domain/       # Capa de Dominio (Entidades, Repositorios, Servicios)
│   │   │   ├── application/  # Capa de Aplicación (Casos de Uso, DTOs, Mappers)
│   │   │   ├── infrastructure/ # Capa de Infraestructura (DB, Redis, HTTP)
│   │   │   ├── presentation/ # Capa de Presentación (Controllers, GraphQL)
│   │   │   └── app.module.ts
│   │   └── package.json
│   ├── frontend/             # React + TypeScript + Tailwind + Shadcn UI
│   │   ├── src/
│   │   │   ├── components/ui # Componentes Shadcn UI
│   │   │   ├── lib/           # Utilidades
│   │   │   └── App.tsx
│   │   └── package.json
│   └── agent/                # Tauri (Rust) - Agente de Escritorio
│       └── src-tauri/        # Configuración Tauri/Rust
├── packages/
│   ├── types/                 # Tipos TypeScript compartidos
│   ├── schemas/               # Esquemas Zod para validación
│   └── shared/                # Utilidades compartidas
├── docker-compose.yml         # PostgreSQL + Redis (para desarrollo local)
├── .env.example               # Variables de entorno
└── package.json               # Workspaces root
```

### Base de Datos (PostgreSQL + JSONB)

#### Entidades principales:
- **Marca**: Marcas de componentes (Intel, AMD, NVIDIA, etc.)
- **Categoria**: Categorías (CPU, GPU, RAM, etc.)
- **Componente**: Catálogo exhaustivo con especificaciones JSONB
- **EnsamblePreconfigurado**: Builds recomendados con rendimiento, pros/contras
- **EnsambleComponente**: Relación entre builds y componentes
- **Incompatibilidad**: Reglas de incompatibilidad entre componentes
- **ReglaValidacion**: Motor de reglas de validación configurable
- **ConfiguracionSistema**: Configuración del sistema

#### Características:
- Esquema híbrido Relacional + JSONB para especificaciones dinámicas
- Soporte para catálogos masivos sin limitaciones
- Motor de validaciones configurable
- Preparado para migraciones automáticas con Prisma

### Stack Tecnológico Configurado

| Módulo | Tecnología | Estado |
|---|---|---|
| Monorepo | npm workspaces | ✓ Configurado |
| Backend | NestJS + Clean Architecture | ✓ Estructura creada |
| ORM | Prisma 5.22.0 | ✓ Esquema definido |
| DB | PostgreSQL 16 (JSONB) | ✓ Esquema listo |
| Caché | Redis 7 | ✓ Configurado en docker-compose |
| Frontend | React 19 + TS + Vite | ✓ Configurado |
| Styling | Tailwind CSS v4 + Shadcn UI | ✓ Configurado |
| Agente Desktop | Tauri (Rust) | ✓ Estructura creada |
| Validación | Zod + class-validator | ✓ Instalado |
| Tipos compartidos | TypeScript packages | ✓ Creados |

### Scripts Disponibles

```bash
# Desarrollo
npm run dev              # Ejecuta backend + frontend concurrently
npm run dev:backend      # Solo backend (NestJS watch)
npm run dev:frontend     # Solo frontend (Vite)
npm run dev:agent        # Solo agente Tauri

# Base de datos
npm run db:generate      # Genera cliente Prisma
npm run db:migrate       # Ejecuta migraciones (dev)
npm run db:deploy        # Ejecuta migraciones (prod)
npm run db:seed          # Carga datos iniciales
npm run db:studio        # Abre Prisma Studio

# Build
npm run build            # Build de todos los workspaces
```

### Notas para FASE 2

Para continuar con FASE 2 (Motor de cálculo de compatibilidad, cuellos de botella y API), se necesita:
1. PostgreSQL corriendo localmente (docker-compose up -d postgres redis)
2. Ejecutar `npm run db:generate`, `npm run db:deploy`, `npm run db:seed`
3. Implementar casos de uso, servicios de validación y controladores REST
4. Implementar algoritmo de cuello de botella (CPU/GPU balance por resolución)

FASE 1 ejecutada y completada conforme a las especificaciones del SYSTEM_PROMPT.md.
