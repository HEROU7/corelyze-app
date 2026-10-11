#!/usr/bin/env node
/**
 * Automatiza el empaquetado del Backend de NestJS y su Sidecar para Tauri:
 * 1. Compila apps/backend (nest build)
 * 2. Empaqueta el backend en un bundle autocontenido con ncc en src-tauri/resources/backend
 * 3. Copia las dependencias nativas requeridas (@prisma/client, .prisma con query engine)
 * 4. Copia el esquema de prisma y la base de datos de seed SQLite
 * 5. Copia el ejecutable standalone de Node.js a src-tauri/resources/node.exe
 * 6. Compila el launcher nativo de Rust (corelyze-backend.exe)
 * 7. Copia el binario a src-tauri/binaries/corelyze-backend-x86_64-pc-windows-msvc.exe
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '../../..');
const agentDir = path.resolve(__dirname, '..');
const tauriDir = path.join(agentDir, 'src-tauri');
const backendDir = path.join(rootDir, 'apps/backend');
const resourcesDir = path.join(tauriDir, 'resources');
const backendResourceDir = path.join(resourcesDir, 'backend');
const binariesDir = path.join(tauriDir, 'binaries');

console.log('🚀 [Corelyze Sidecar] Iniciando preparación del backend para Tauri...');

// 1. Compilar backend
console.log('📦 1/6 Compilando NestJS backend...');
execSync('npm run build --workspace=apps/backend', {
  cwd: rootDir,
  stdio: 'inherit',
});

// 2. Preparar carpetas
if (fs.existsSync(backendResourceDir)) {
  fs.rmSync(backendResourceDir, { recursive: true, force: true });
}
fs.mkdirSync(backendResourceDir, { recursive: true });
fs.mkdirSync(binariesDir, { recursive: true });

// 3. Empaquetar con ncc
console.log('⚡ 2/6 Empaquetando backend con ncc...');
const mainJs = path.join(backendDir, 'dist/main.js');
execSync(`npx -y @vercel/ncc build "${mainJs}" -o "${backendResourceDir}" --external @prisma/client --external prisma`, {
  cwd: rootDir,
  stdio: 'inherit',
});

// 4. Copiar módulos de Prisma, datos y esquema
console.log('🗄️ 3/6 Copiando dependencias nativas de Prisma y base de datos inicial...');
const resNodeModules = path.join(backendResourceDir, 'node_modules');
fs.mkdirSync(resNodeModules, { recursive: true });

const rootNodeModules = path.join(rootDir, 'node_modules');
if (fs.existsSync(path.join(rootNodeModules, '@prisma'))) {
  fs.cpSync(path.join(rootNodeModules, '@prisma'), path.join(resNodeModules, '@prisma'), { recursive: true });
}
if (fs.existsSync(path.join(rootNodeModules, '.prisma'))) {
  fs.cpSync(path.join(rootNodeModules, '.prisma'), path.join(resNodeModules, '.prisma'), { recursive: true });
}

// Copiar prisma schema y SQLite data
fs.cpSync(path.join(backendDir, 'prisma'), path.join(backendResourceDir, 'prisma'), { recursive: true });
const dataDir = path.join(backendResourceDir, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const sourceDb = path.join(backendDir, 'data/corelyze.sqlite');
if (fs.existsSync(sourceDb)) {
  fs.copyFileSync(sourceDb, path.join(dataDir, 'corelyze.sqlite'));
}

// Copiar package.json
fs.copyFileSync(path.join(backendDir, 'package.json'), path.join(backendResourceDir, 'package.json'));

// 5. Copiar node.exe portable a resources
console.log('🟢 4/6 Copiando runtime de Node.js a los recursos de Tauri...');
const nodeSource = process.execPath; // Path al actual node.exe en ejecución
const nodeDest = path.join(resourcesDir, 'node.exe');
fs.copyFileSync(nodeSource, nodeDest);
console.log(`   Node runtime copiado: ${nodeSource} -> ${nodeDest}`);

// 6. Compilar el launcher binario en Rust directamente con rustc
console.log('🦀 5/6 Compilando launcher sidecar en Rust (corelyze-backend)...');
const launcherSource = path.join(tauriDir, 'src/backend_launcher.rs');
const targetTripleBin = path.join(binariesDir, 'corelyze-backend-x86_64-pc-windows-msvc.exe');
execSync(`rustc -O "${launcherSource}" -o "${targetTripleBin}"`, {
  cwd: tauriDir,
  stdio: 'inherit',
});

console.log('✅ [Corelyze Sidecar] ¡Backend empaquetado e integrado exitosamente como sidecar!');
