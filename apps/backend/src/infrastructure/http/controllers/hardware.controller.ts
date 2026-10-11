import { Controller, Get, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as si from 'systeminformation';
import {
  extractRamGeneration,
  inferRamGenerationFromSpeed,
  roundRamCapacityGB,
  type RamGeneration,
} from '../../../domain/utils/hardware-normalization';

const execAsync = promisify(exec);

interface GpuInfo {
  name: string;
  vramGB: number | null;
}

interface MotherboardInfo {
  manufacturer: string;
  model: string;
}

interface DriverIssue {
  device: string;
  class: string;
  errorCode: number;
  problem: string;
  recommendation: string;
}

interface StorageInfo {
  model: string;
  type: 'SSD' | 'HDD' | 'Desconocido';
  capacityGB: number;
  freeGB: number;
  smartStatus?: 'OK' | 'Atencion' | 'Fallo' | 'N/A';
  predictFailure?: boolean;
}

interface HardwareReport {
  hostname: string;
  platform: string;
  os: string;
  osVersion: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  cpuLogical: number;
  cpuSpeedGhz: number;
  totalMemoryGB: number;
  freeMemoryGB: number;
  usedMemoryGB: number;
  ramType: string | null;
  ramSpeedMhz: number | null;
  ramModules: number | null;
  gpus: GpuInfo[];
  motherboard: MotherboardInfo | null;
  storage: StorageInfo[];
  driverIssues: DriverIssue[];
  source: 'node';
}

const WIN_SCRIPT = `
$out = [ordered]@{}
try {
  $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
  if ($cpu) { $out.cpu = [ordered]@{ name = [string]$cpu.Name; cores = [int]$cpu.NumberOfCores; logical = [int]$cpu.NumberOfLogicalProcessors; speedMhz = [double]$cpu.MaxClockSpeed } }
} catch {}
try {
  $mb = Get-CimInstance Win32_BaseBoard | Select-Object -First 1
  if ($mb) { $out.motherboard = [ordered]@{ manufacturer = [string]$mb.Manufacturer; model = [string]$mb.Product } }
} catch {}
try {
  $regPath = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}'
  $regVram = @{}
  Get-ChildItem $regPath -ErrorAction SilentlyContinue | ForEach-Object {
    $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
    $adapter = [string]$p.'HardwareInformation.AdapterString'
    $qw = $p.'HardwareInformation.qwMemorySize'
    if ($adapter -and $qw) { $regVram[$adapter] = [double]$qw }
  }
  $gpuList = @()
  foreach ($g in (Get-CimInstance Win32_VideoController)) {
    $vram = 0.0
    if ($regVram.ContainsKey([string]$g.Name)) { $vram = $regVram[[string]$g.Name] }
    if ($vram -le 0 -and $g.AdapterRAM) { $vram = [double]$g.AdapterRAM }
    $gpuList += [ordered]@{ name = [string]$g.Name; vramBytes = $vram }
  }
  $out.gpus = $gpuList
} catch {}
try {
  $disks = @()
  foreach ($d in (Get-CimInstance Win32_DiskDrive)) {
    $disks += [ordered]@{ model = [string]$d.Model; serial = [string]$d.SerialNumber; sizeBytes = [double]$d.Size; mediaType = [string]$d.MediaType }
  }
  $out.disks = $disks
} catch {}
try {
  $vols = @()
  foreach ($v in (Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3")) {
    $vols += [ordered]@{ sizeBytes = [double]$v.Size; freeBytes = [double]$v.FreeSpace }
  }
  $out.volumes = $vols
} catch {}
try {
  $issues = @()
  Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object {
    $_.ConfigManagerErrorCode -and $_.ConfigManagerErrorCode -ne 0
  } | ForEach-Object {
    $issues += [ordered]@{ device = [string]$_.Name; class = [string]$_.PNPClass; errorCode = [int]$_.ConfigManagerErrorCode; problem = [string]$_.ConfigManagerErrorDescription }
  }
  $out.driverIssues = $issues
} catch {}
try {
  $smart = @()
  foreach ($pd in (Get-PhysicalDisk -ErrorAction SilentlyContinue)) {
    $rc = $pd | Get-StorageReliabilityCounter -ErrorAction SilentlyContinue
    $temp = 0.0; $wear = -1
    if ($rc) {
      if ($null -ne $rc.Temperature) { $temp = [double]$rc.Temperature }
      if ($null -ne $rc.Wear) { $wear = [int]$rc.Wear }
    }
    $health = [string]$pd.HealthStatus
    $smart += [ordered]@{
      friendlyName = [string]$pd.FriendlyName
      serial = [string]$pd.SerialNumber
      mediaType = [string]$pd.MediaType
      healthStatus = $health
      predictFailure = ($health -eq 'Unhealthy' -or $health -eq 'Warning')
      temperatureC = $temp
      wear = $wear
    }
  }
  $out.smart = $smart
} catch {}
$out | ConvertTo-Json -Depth 6 -Compress
`.trim();

function toArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return [value];
  return [];
}

function parsePowerShellJson(output: string): Record<string, any> {
  const lines = output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    throw new Error('PowerShell no devolvió ninguna línea de salida');
  }
  // Tomamos la última línea con contenido: la salida JSON con -Compress es una sola línea.
  return JSON.parse(lines[lines.length - 1]) as Record<string, any>;
}

function gbFromBytes(bytes: number): number {
  if (!bytes || bytes <= 0) return 0;
  return Math.round((bytes / 1024 ** 3) * 100) / 100;
}

function classifyStorage(model: string, mediaType: string): StorageInfo['type'] {
  const haystack = `${model} ${mediaType}`.toLowerCase();
  if (haystack.includes('ssd') || haystack.includes('nvme') || haystack.includes('solid')) {
    return 'SSD';
  }
  if (haystack.includes('hdd') || haystack.includes('hard disk')) {
    return 'HDD';
  }
  return 'Desconocido';
}

function driverRec(code: number, cls: string): string {
  const c = String(cls || '').toLowerCase();
  switch (code) {
    case 28:
      return 'No hay un controlador instalado. Instala el driver oficial del fabricante; si es una GPU, usa DDU.';
    case 43:
      return 'El dispositivo reportó un problema detectado por Windows. Reinstala el controlador (para GPU usa DDU) o evalúa fallo físico.';
    case 22:
      return 'El dispositivo está deshabilitado. Habilítalo en el Administrador de dispositivos (Ver > Mostrar dispositivos ocultos).';
    case 31:
      return `Windows no pudo cargar el controlador de ${c || 'dispositivo'} correctamente. Actualiza o reinstala desde el sitio del fabricante.`;
    case 10:
      return `El dispositivo (${c || 'dispositivo'}) no pudo iniciarse (Código 10). Actualiza/reinstala el driver y verifica firmware/BIOS.`;
    default:
      return 'Revisa el Administrador de dispositivos y actualiza/reinstala el controlador del fabricante.';
  }
}

function smartFor(model: string, serial: string, smart: any[]): { status: StorageInfo['smartStatus']; predict: boolean } {
  if (!smart?.length) return { status: 'N/A', predict: false };
  const ml = String(model || '').toLowerCase();
  const sl = String(serial || '').trim().toLowerCase();
  for (const s of smart) {
    const fn = String(s.friendlyName || '').toLowerCase();
    const ss = String(s.serial || '').trim().toLowerCase();
    const match = (!!ss && !!sl && ss === sl) || (!!fn && !!ml && (fn.includes(ml) || ml.includes(fn)));
    if (match) {
      const h = String(s.healthStatus || '');
      const pred = !!s.predictFailure;
      let st: any = 'N/A';
      if (/healthy/i.test(h)) st = 'OK';
      else if (/warning/i.test(h)) st = 'Atencion';
      else if (/unhealthy|failing/i.test(h)) st = 'Fallo';
      return { status: st, predict: pred };
    }
  }
  return { status: 'N/A', predict: false };
}

async function scanWindows(log: (message: string) => void): Promise<Partial<HardwareReport>> {
  // Usamos -EncodedCommand (base64 UTF-16LE) para evitar que el escapado de
  // caracteres (\" ... \") rompa el script con "powershell -Command". Es el
  // método robusto para scripts multi-línea con comillas embebidas.
  const encoded = Buffer.from(WIN_SCRIPT, 'utf16le').toString('base64');
  log(`Ejecutando escaneo PowerShell (${(encoded.length / 1024).toFixed(1)} KB encoded)…`);

  const { stdout } = await execAsync(
    `powershell -NoProfile -NonInteractive -NoLogo -EncodedCommand ${encoded}`,
    { timeout: 8000, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
  );

  log(`Salida cruda PowerShell (${stdout.length} bytes): ${stdout.trim().slice(0, 300)}`);
  const data = parsePowerShellJson(stdout);

  const cpu = data.cpu ?? {};
  const disks = toArray(data.disks);
  const volumes = toArray(data.volumes);
  const smart = toArray(data.smart);
  const driverIssuesRaw = toArray(data.driverIssues);
  const totalCapacity = disks.reduce((acc, d) => acc + (Number(d.sizeBytes) || 0), 0);
  const totalFree = volumes.reduce((acc, v) => acc + (Number(v.freeBytes) || 0), 0);

  const driverIssues: DriverIssue[] = driverIssuesRaw
    .map((d) => {
      const device = String(d.device || '').trim();
      if (!device) return null;
      const cls = String(d.class || '');
      const code = Number(d.errorCode) || 0;
      return {
        device,
        class: cls || 'Dispositivo',
        errorCode: code,
        problem: String(d.problem || ''),
        recommendation: driverRec(code, cls),
      };
    })
    .filter((d): d is DriverIssue => !!d);

  const gpus: GpuInfo[] = toArray(data.gpus)
    .map((g) => {
      const name = String(g.name ?? '').trim();
      if (!name) return null;
      return {
        name,
        vramGB: Number(g.vramBytes) > 0 ? gbFromBytes(Number(g.vramBytes)) : null,
      };
    })
    .filter((g): g is GpuInfo => !!g);

  const storage: StorageInfo[] = disks
    .map((d) => {
      const sizeBytes = Number(d.sizeBytes) || 0;
      const freeBytes = totalCapacity > 0 ? totalFree * (sizeBytes / totalCapacity) : 0;
      const model = String(d.model ?? '').trim() || 'Disco desconocido';
      const sm = smartFor(model, String(d.serial ?? ''), smart);
      return {
        model,
        type: classifyStorage(String(d.model ?? ''), String(d.mediaType ?? '')),
        capacityGB: gbFromBytes(sizeBytes),
        freeGB: gbFromBytes(freeBytes),
        smartStatus: sm.status,
        predictFailure: sm.predict,
      };
    })
    .filter((d) => d.capacityGB > 0);

  const motherboard =
    data.motherboard && (data.motherboard.model || data.motherboard.manufacturer)
      ? {
          manufacturer: String(data.motherboard.manufacturer ?? '').trim(),
          model: String(data.motherboard.model ?? '').trim(),
        }
      : null;

  log(
    `Detección WMI → gpus=${gpus.length ? gpus.map((g) => `${g.name} (${g.vramGB ?? '?'} GB)`).join(', ') : 'ninguna'}; ` +
      `motherboard=${motherboard ? `${motherboard.manufacturer} ${motherboard.model}`.trim() : 'no detectada'}; ` +
      `storage=${storage.length ? storage.map((s) => `${s.model} (${s.type} ${s.capacityGB} GB)`).join(' | ') : 'ninguno'}`,
  );

  return {
    cpuModel: String(cpu.name ?? '').trim() || undefined,
    cpuCores: Number(cpu.cores) || undefined,
    cpuLogical: Number(cpu.logical) || undefined,
    cpuSpeedGhz: cpu.speedMhz ? Math.round((Number(cpu.speedMhz) / 1000) * 100) / 100 : undefined,
    gpus,
    motherboard,
    storage,
    driverIssues,
  };
}

@ApiTags('hardware')
@Controller('hardware')
export class HardwareController {
  private readonly logger = new Logger(HardwareController.name);

  @Get('scan')
  @ApiOperation({ summary: 'Detectar el hardware de la máquina local' })
  async scan(): Promise<HardwareReport> {
    this.logger.log('Solicitud de escaneo de hardware recibida…');
    const cpus = os.cpus();
    const logical = cpus.length;

    let extra: Partial<HardwareReport> = {};
    if (process.platform === 'win32') {
      try {
        extra = await scanWindows((msg) => this.logger.log(msg));
      } catch (error) {
        this.logger.warn(
          `Detección avanzada WMI no disponible: ${error instanceof Error ? error.message : error}`,
        );
        this.logger.warn('Se usará el respaldo básico de Node.js (os.*): CPU y memoria únicamente.');
      }
    } else {
      this.logger.log(`Plataforma ${process.platform}: usando respaldo básico de Node.js.`);
    }

    // Capacidad total redondeada a estándar comercial (15.9 → 16, 31.5 → 32).
    const totalMemoryGB = roundRamCapacityGB(gbFromBytes(os.totalmem()));
    const freeMemoryGB = gbFromBytes(os.freemem());
    const cpuCores = extra.cpuCores && extra.cpuCores > 0 ? extra.cpuCores : logical;

    // Detección de módulos de RAM (soporta 2x8GB, 4x8GB, …). Recorremos todos
    // los módulos, validamos que compartan el mismo estándar (DDR4/DDR5) y
    // sumamos la capacidad total redondeada a su valor comercial.
    let ramType: string | null = null;
    let ramSpeedMhz: number | null = null;
    let ramModules: number | null = null;
    let moduleTotalGB: number | null = null;
    if (process.platform === 'win32') {
      try {
        const layout = await si.memLayout();
        const modules = (layout ?? []).filter((module) => Number(module.size) > 0);
        if (modules.length > 0) {
          moduleTotalGB = roundRamCapacityGB(
            modules.reduce((acc, module) => acc + Number(module.size), 0) / 1024 ** 3,
          );
          const generations = modules
            .map(
              (module) =>
                extractRamGeneration(module.type) ??
                inferRamGenerationFromSpeed(module.clockSpeed),
            )
            .filter((generation): generation is RamGeneration => generation !== null);
          const uniqueGenerations = Array.from(new Set(generations));
          ramType = uniqueGenerations.length === 1 ? uniqueGenerations[0] : null;
          const speeds = modules
            .map((module) => Number(module.clockSpeed))
            .filter((speed) => Number.isFinite(speed) && speed > 0)
            .map((speed) => Math.round(speed));
          ramSpeedMhz = speeds.length > 0 ? Math.max(...speeds) : null;
          ramModules = modules.length;
        }
      } catch (error) {
        this.logger.warn(
          `No se pudo leer la disposición de memoria (memLayout): ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    const effectiveTotalMemoryGB = moduleTotalGB ?? totalMemoryGB;

    const report: HardwareReport = {
      hostname: os.hostname(),
      platform: os.platform(),
      os: os.type(),
      osVersion: os.release(),
      arch: os.arch(),
      cpuModel: String(extra.cpuModel ?? cpus[0]?.model ?? 'Desconocido').trim(),
      cpuCores,
      cpuLogical: extra.cpuLogical && extra.cpuLogical > 0 ? extra.cpuLogical : logical,
      cpuSpeedGhz: extra.cpuSpeedGhz ?? (cpus[0]?.speed ? Number((cpus[0].speed / 1000).toFixed(2)) : 0),
      totalMemoryGB: effectiveTotalMemoryGB,
      freeMemoryGB,
      usedMemoryGB: Math.max(0, Math.round((effectiveTotalMemoryGB - freeMemoryGB) * 100) / 100),
      ramType,
      ramSpeedMhz,
      ramModules,
      gpus: extra.gpus ?? [],
      motherboard: extra.motherboard ?? null,
      storage: extra.storage ?? [],
      driverIssues: extra.driverIssues ?? [],
      source: 'node',
    };

    this.logger.log(
      `Escaneo completado → cpu=${report.cpuModel}; gpus=${report.gpus.length}; ` +
        `motherboard=${report.motherboard?.model ?? 'null'}; storage=${report.storage.length}; ` +
        `ram=${report.totalMemoryGB}GB ${report.ramType ?? '?'} ${report.ramSpeedMhz ?? '?'}MHz x${report.ramModules ?? '?'}`,
    );
    return report;
  }
}
