#!/usr/bin/env node
/**
 * Verifica si el puerto del backend ya está ocupado antes de relanzar NestJS
 * y libera el PID que lo esté usando para evitar el error EADDRINUSE en consola.
 */
const net = require('node:net');
const { execSync } = require('node:child_process');

const PORT = Number(process.env.BACKEND_PORT || process.env.PORT || 49152);

function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const done = (inUse) => {
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(1000);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

function findPidsWindows(port) {
  try {
    const output = execSync(`netstat -ano -p tcp | findstr :${port}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const pids = new Set();
    for (const line of output.split(/\r?\n/)) {
      const match = line.trim().match(/LISTENING\s+(\d+)$/);
      if (match) pids.add(match[1]);
    }
    return [...pids];
  } catch {
    return [];
  }
}

function findPidsUnix(port) {
  try {
    const output = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .split(/\r?\n/)
      .map((v) => v.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function killPid(pid) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    } else {
      process.kill(Number(pid), 'SIGKILL');
    }
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await isPortInUse(PORT))) {
    return;
  }

  const pids = process.platform === 'win32' ? findPidsWindows(PORT) : findPidsUnix(PORT);
  if (pids.length === 0) {
    console.warn(`⚠️  El puerto ${PORT} está ocupado pero no se pudo identificar el proceso.`);
    return;
  }

  for (const pid of pids) {
    const killed = killPid(pid);
    console.log(
      `${killed ? '♻️' : '⚠️'}  Puerto ${PORT} ocupado por PID ${pid}: ${
        killed ? 'liberado' : 'no se pudo cerrar'
      }.`,
    );
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (!(await isPortInUse(PORT))) {
      console.log(`✅ Puerto ${PORT} disponible.`);
      return;
    }
  }

  console.warn(
    `⚠️  El puerto ${PORT} sigue ocupado. NestJS podría fallar con EADDRINUSE.`,
  );
}

main();
