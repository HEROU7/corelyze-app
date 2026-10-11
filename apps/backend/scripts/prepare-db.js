#!/usr/bin/env node
/**
 * Prepara la base de datos SQLite local de forma automática (equivalente a
 * `synchronize: true` de TypeORM para Prisma):
 *   1. Crea la carpeta apps/backend/data si no existe.
 *   2. Ejecuta `prisma db push` para crear/actualizar las tablas sin migraciones.
 *
 * Así Corelyze arranca 100% portátil, sin PostgreSQL, Redis ni ningún servicio
 * externo corriendo en segundo plano.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const backendDir = path.resolve(__dirname, '..');
const dataDir = path.join(backendDir, 'data');

fs.mkdirSync(dataDir, { recursive: true });

try {
  // `prisma db push` sincroniza el esquema y regenera el cliente Prisma.
  execSync('npx prisma db push --accept-data-loss', {
    cwd: backendDir,
    stdio: 'inherit',
  });
  console.log('✅ Base de datos SQLite lista en ./data/corelyze.sqlite');
} catch (error) {
  console.error('❌ No se pudo preparar la base de datos SQLite:', error.message);
  process.exit(1);
}
