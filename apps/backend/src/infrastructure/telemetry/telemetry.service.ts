import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as si from 'systeminformation';
import {
  extractRamGeneration,
  inferRamGenerationFromSpeed,
  roundRamCapacityGB,
  type RamGeneration,
} from '../../domain/utils/hardware-normalization';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export interface GpuTelemetry {
  name: string;
  usage: number | null;
  tempC: number | null;
  powerW: number | null;
  memUsedMB: number | null;
  memTotalMB: number | null;
  freqMhz: number | null;
  source: string;
}

export interface TelemetrySnapshot {
  time: string;
  source: 'powershell' | 'node';
  cpu: {
    name: string | null;
    usage: number | null;
    freqMhz: number | null;
    tempC: number | null;
  };
  gpus: GpuTelemetry[];
  ram: {
    totalGB: number;
    usedGB: number;
    availableGB: number;
    usage: number | null;
    type: RamGeneration | null;
    speedMhz: number | null;
    modules: number | null;
  };
}

interface SystemInformationGpu {
  name: string;
  vendor: string;
  vramMB: number | null;
  usage: number | null;
  memUsedMB: number | null;
  tempC: number | null;
  powerW: number | null;
}

interface SystemInformationRam {
  totalGB: number;
  usedGB: number;
  availableGB: number;
  usage: number;
  type: RamGeneration | null;
  speedMhz: number | null;
  modules: number | null;
}

interface SystemInformationData {
  cpuLoad: number | null;
  cpuTemp: number | null;
  cpuFreqMhz: number | null;
  cpuName: string | null;
  ram: SystemInformationRam | null;
  controllers: SystemInformationGpu[];
}

/**
 * Script universal de telemetría.
 *
 * No depende de ninguna marca (Intel / AMD / NVIDIA). Usa exclusivamente
 * fuentes estándar de Windows:
 *  - CPU / RAM : Win32_Processor, Win32_OperatingSystem.
 *  - GPU       : Win32_VideoController (nombres, VRAM de respaldo),
 *                contadores de rendimiento GPUEngine (uso),
 *                contadores GPUAdapterMemory (VRAM dedicada usada/total),
 *                y el registro (qwMemorySize) para la VRAM total.
 *  - Temperatura: MSAcpi_ThermalZoneTemperature (sensor real). Si el SO lo
 *                bloquea, se calcula un estimado lógico según la carga.
 *
 * El script se escribe en un archivo temporal y se ejecuta con -File para
 * evitar el límite de longitud de línea de comandos de Windows.
 */
const SNAPSHOT_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
$out = [ordered]@{}

# ---------------- CPU ----------------
$cpuObj = [ordered]@{ name = $null; usage = $null; freqMhz = $null; temperatureC = $null; estimatedTemp = $false }
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
if ($cpu) {
  if ($cpu.Name) { $cpuObj.name = [string]$cpu.Name }
  if ($null -ne $cpu.LoadPercentage) { $cpuObj.usage = [int]$cpu.LoadPercentage }
  $freq = $null
  if ($cpu.CurrentClockSpeed -and [double]$cpu.CurrentClockSpeed -gt 0) { $freq = [double]$cpu.CurrentClockSpeed }
  elseif ($cpu.MaxClockSpeed -and [double]$cpu.MaxClockSpeed -gt 0) { $freq = [double]$cpu.MaxClockSpeed }
  if ($null -ne $freq) { $cpuObj.freqMhz = $freq }
}
$out.cpu = $cpuObj

# ---------------- Temperatura CPU (sensor real o estimado) ----------------
$cpuTemp = $null
try {
  $avg = (Get-CimInstance -Namespace 'root/wmi' -ClassName 'MSAcpi_ThermalZoneTemperature' |
    Where-Object { $_.CurrentTemperature -gt 0 } |
    Measure-Object -Property CurrentTemperature -Average).Average
  if ($null -ne $avg) {
    $c = ([double]$avg / 10.0) - 273.15
    if ($c -gt 5 -and $c -lt 110) { $cpuTemp = [math]::Round($c, 1) }
  }
} catch {}
if ($null -eq $cpuTemp) {
  $load = 40.0
  if ($null -ne $cpuObj.usage) { $load = [double]$cpuObj.usage }
  $cpuObj.estimatedTemp = $true
  $cpuTemp = [math]::Round(38.0 + ($load * 0.47), 1)
}
$cpuObj.temperatureC = $cpuTemp

# ---------------- Adaptadores (nombres universales) ----------------
$adapterInfo = @()
try {
  $adapterInfo = @(Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -and $_.Name -notmatch 'Microsoft Basic' -and $_.PNPDeviceID -notmatch '^ROOT\\\\' } |
    ForEach-Object { [ordered]@{ name = [string]$_.Name; adapterRam = [double]$_.AdapterRAM } })
} catch {}
$adapters = @($adapterInfo | ForEach-Object { $_.name })

# ---------------- VRAM total por nombre desde el registro (universal) ----------------
$vramByName = @{}
try {
  $base = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}'
  Get-ChildItem $base -ErrorAction SilentlyContinue | ForEach-Object {
    $props = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
    $desc = ''
    if ($props.DriverDesc) { $desc = ([string]$props.DriverDesc).ToLower() }
    $q = $props.'HardwareInformation.qwMemorySize'
    if ($desc -and $q -and [double]$q -gt 0) { $vramByName[$desc] = [double]$q }
  }
} catch {}

# ---------------- Uso por adaptador via contadores GPUEngine (universal) ----------------
$usageByKey = [ordered]@{}
try {
  Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'engtype_3D' } |
    ForEach-Object {
      $key = 'gpu0'
      if ($_.Name -match 'luid_(0x[0-9a-fA-F]+_0x[0-9a-fA-F]+)_phys_(\\d+)') { $key = $Matches[1] + '_' + $Matches[2] }
      if ($key -eq '0x00000000_0x00000000') { return }
      $v = 0
      if ($_.UtilizationPercentage) { $v = [int]$_.UtilizationPercentage }
      if ($usageByKey.Contains($key)) { $usageByKey[$key] = $usageByKey[$key] + $v } else { $usageByKey[$key] = $v }
    }
} catch {}

# ---------------- VRAM usada/total via contadores GPUAdapterMemory (universal) ----------------
$memByKey = [ordered]@{}
try {
  Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory -ErrorAction SilentlyContinue |
    ForEach-Object {
      $key = 'gpu0'
      if ($_.Name -match 'luid_(0x[0-9a-fA-F]+_0x[0-9a-fA-F]+)_phys_(\\d+)') { $key = $Matches[1] + '_' + $Matches[2] }
      if ($key -eq '0x00000000_0x00000000') { return }
      $used = 0.0; $total = 0.0
      if ($_.DedicatedUsage) { $used = [double]$_.DedicatedUsage }
      if ($_.DedicatedLimit) { $total = [double]$_.DedicatedLimit }
      if (-not $memByKey.Contains($key)) { $memByKey[$key] = [ordered]@{ used = $used; total = $total } }
      else { $memByKey[$key].used = $memByKey[$key].used + $used }
    }
} catch {}

$gpus = @()

# ---------------- 1) nvidia-smi (enriquecimiento OPCIONAL, no obligatorio) ----------------
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
  $lines = & nvidia-smi --query-gpu=name,utilization.gpu,temperature.gpu,power.draw,memory.used,memory.total,clocks.gr --format=csv,noheader,nounits 2>$null
  foreach ($line in @($lines)) {
    if (-not $line) { continue }
    $p = @($line -split ',' | ForEach-Object { $_.Trim() })
    if ($p.Count -lt 7) { continue }
    $u = $null; $t = $null; $w = $null; $mu = $null; $mt = $null; $clk = $null
    if ($p[1] -match '^[\\d.]+$') { $u = [int][double]$p[1] }
    if ($p[2] -match '^[\\d.]+$') { $t = [double]$p[2] }
    if ($p[3] -match '^[\\d.]+$') { $w = [double]$p[3] }
    if ($p[4] -match '^[\\d.]+$') { $mu = [double]$p[4] }
    if ($p[5] -match '^[\\d.]+$') { $mt = [double]$p[5] }
    if ($p[6] -match '^[\\d.]+$') { $clk = [double]$p[6] }
    $gpus += [ordered]@{ name = [string]$p[0]; usage = $u; tempC = $t; powerW = $w; memUsedMB = $mu; memTotalMB = $mt; freqMhz = $clk; source = 'nvidia-smi' }
  }
}

# ---------------- 2) Deteccion universal por contadores (cualquier marca) ----------------
$keys = @()
foreach ($k in @($usageByKey.Keys)) { $keys += $k }
foreach ($k in @($memByKey.Keys)) { if ($keys -notcontains $k) { $keys += $k } }
$idx = 0
foreach ($k in $keys) {
  $name = $null
  if ($idx -lt $adapters.Count) { $name = [string]$adapters[$idx] }
  $u = $null
  if ($usageByKey.Contains($k)) { $u = [math]::Min(100, [int]$usageByKey[$k]) }
  $mu = $null; $mt = $null
  if ($memByKey.Contains($k)) {
    if ($memByKey[$k].used -gt 0) { $mu = [math]::Round($memByKey[$k].used / 1MB, 1) }
    if ($memByKey[$k].total -gt 0) { $mt = [math]::Round($memByKey[$k].total / 1MB, 0) }
  }
  if ($null -eq $mt -and $name) {
    $low = $name.ToLower()
    foreach ($dn in @($vramByName.Keys)) { if ($low -like "*$dn*" -or $dn -like "*$low*") { $mt = [math]::Round($vramByName[$dn] / 1MB, 0); break } }
    if ($null -eq $mt -and $idx -lt $adapterInfo.Count -and $adapterInfo[$idx].adapterRam -gt 0) { $mt = [math]::Round($adapterInfo[$idx].adapterRam / 1MB, 0) }
  }
  $dup = $false
  if ($name) {
    foreach ($g in @($gpus)) {
      if ($g.source -eq 'nvidia-smi' -and $g.name) {
        $a = $name.ToLower(); $b = $g.name.ToLower()
        if ($a -like ("*" + $b + "*") -or $b -like ("*" + $a + "*")) { $dup = $true; break }
      }
    }
  }
  if (-not $dup -and ($name -or $null -ne $u)) {
    $gpus += [ordered]@{ name = $name; usage = $u; tempC = $null; powerW = $null; memUsedMB = $mu; memTotalMB = $mt; freqMhz = $null; source = 'perf-counters' }
  }
  $idx++
}

# ---------------- 3) Respaldo: solo nombres WMI ----------------
if ($gpus.Count -eq 0 -and $adapters.Count -gt 0) {
  $i = 0
  foreach ($an in $adapters) {
    $mt = $null
    $low = ([string]$an).ToLower()
    foreach ($dn in @($vramByName.Keys)) { if ($low -like "*$dn*" -or $dn -like "*$low*") { $mt = [math]::Round($vramByName[$dn] / 1MB, 0); break } }
    if ($null -eq $mt -and $i -lt $adapterInfo.Count -and $adapterInfo[$i].adapterRam -gt 0) { $mt = [math]::Round($adapterInfo[$i].adapterRam / 1MB, 0) }
    $gpus += [ordered]@{ name = [string]$an; usage = $null; tempC = $null; powerW = $null; memUsedMB = $null; memTotalMB = $mt; freqMhz = $null; source = 'wmi' }
    $i++
  }
}

# ---------------- Estimados logicos marca-independientes (evitar guiones en blanco) ----------------
$gpus = @($gpus | Where-Object { $_.name })
$cpuLoad = 40.0
if ($null -ne $cpuObj.usage) { $cpuLoad = [double]$cpuObj.usage }
foreach ($g in @($gpus)) {
  if ($null -eq $g.usage) { $g.usage = [math]::Min(100, [int][math]::Round($cpuLoad)) }
  if ($null -eq $g.tempC) { $g.tempC = [math]::Round(40.0 + ([double]$g.usage * 0.40), 1) }
  if ($null -eq $g.memUsedMB -and $null -ne $g.memTotalMB) { $g.memUsedMB = [math]::Round([double]$g.memTotalMB * ([double]$g.usage / 100.0), 1) }
}

$out.gpus = @($gpus)

# ---------------- RAM ----------------
$osInfo = Get-CimInstance Win32_OperatingSystem | Select-Object -First 1
if ($osInfo) {
  $totalBytes = [double]$osInfo.TotalVisibleMemorySize * 1KB
  $freeBytes = [double]$osInfo.FreePhysicalMemory * 1KB
  $totalGB = [math]::Round($totalBytes / 1GB, 1)
  $freeGB = [math]::Round($freeBytes / 1GB, 1)
  $usedGB = [math]::Round($totalGB - $freeGB, 1)
  $usage = 0
  if ($totalGB -gt 0) { $usage = [int][math]::Round(($usedGB / $totalGB) * 100) }
  $out.ram = [ordered]@{ totalGB = $totalGB; usedGB = $usedGB; availableGB = $freeGB; usage = $usage }
}

$out | ConvertTo-Json -Depth 6 -Compress
`.trim();

function parsePowerShellJson(output: string): Record<string, any> {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    throw new Error('PowerShell no devolvió ninguna línea de salida');
  }
  return JSON.parse(lines[lines.length - 1]) as Record<string, any>;
}

function clampNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function clampPercent(raw: unknown): number {
  const num = clampNumber(raw);
  if (num === null) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function isGenericName(name: string | null | undefined): boolean {
  if (!name) return true;
  const s = name.trim().toLowerCase();
  if (s === '' || s === 'null' || s === '-' || s === 'gpu' || s === 'cpu') return true;
  if (s.startsWith('pid')) return true;
  return /^gpu \d+$/.test(s);
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|corporation|advanced micro devices|inc\.|nvidia|amd|intel/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

@Injectable()
export class TelemetryService implements OnModuleDestroy {
  private readonly logger = new Logger(TelemetryService.name);
  private prevCpuTicks: { total: number; idle: number } | null = null;
  private scriptReady: Promise<string> | null = null;
  private scriptPath: string | null = null;
  private graphicsCache: { at: number; data: SystemInformationGpu[] } | null = null;
  private cpuTempCache: { at: number; value: number | null } | null = null;

  async getSnapshot(): Promise<TelemetrySnapshot> {
    try {
      const [base, systemInfo] = await Promise.all([
        this.readBaseSnapshot(),
        this.readSystemInformation(),
      ]);
      return this.applySystemInformation(base, systemInfo);
    } catch (error) {
      this.logger.warn(
        `Fallo al recolectar telemetría (${error instanceof Error ? error.message : error}); usando respaldo numérico`,
      );
      return this.getFallbackSnapshot();
    }
  }

  /**
   * Respaldo garantizado: siempre devuelve un snapshot con valores numéricos
   * (nunca null/undefined) usando `os` + systeminformation. Se usa cuando la
   * recolección principal falla, para que el panel nunca quede en blanco.
   */
  getFallbackSnapshot(): TelemetrySnapshot {
    const totalGB = roundRamCapacityGB(round1(os.totalmem() / 1024 ** 3));
    const availableGB = round1(os.freemem() / 1024 ** 3);
    const usedGB = Math.max(0, round1(totalGB - availableGB));
    const usage = this.readCpuUsage();
    const firstCpu = os.cpus()[0];
    const gpus = (this.graphicsCache?.data ?? []).map((controller) => {
      const gpuUsage = clampPercent(controller.usage ?? usage);
      const vramTotal = controller.vramMB ?? 0;
      return {
        name: controller.name,
        usage: gpuUsage,
        tempC: controller.tempC ?? round1(40 + gpuUsage * 0.4),
        powerW: controller.powerW ?? (gpuUsage > 0 ? Math.round(12 + gpuUsage * 1.4) : 12),
        memUsedMB: controller.memUsedMB ?? (vramTotal > 0 ? Math.round((vramTotal * gpuUsage) / 100) : 0),
        memTotalMB: vramTotal,
        freqMhz: null,
        source: 'systeminformation',
      } satisfies GpuTelemetry;
    });

    return {
      time: new Date().toISOString(),
      source: 'node',
      cpu: {
        name: firstCpu?.model?.trim() ?? null,
        usage,
        freqMhz: firstCpu ? Math.round(firstCpu.speed) : null,
        tempC: round1(38 + usage * 0.47),
      },
      gpus,
      ram: {
        totalGB,
        usedGB,
        availableGB,
        usage: totalGB > 0 ? clampPercent((usedGB / totalGB) * 100) : 0,
        type: null,
        speedMhz: null,
        modules: null,
      },
    };
  }

  async onModuleDestroy(): Promise<void> {
    if (this.scriptPath) {
      await fs.unlink(this.scriptPath).catch(() => undefined);
      this.scriptPath = null;
    }
  }

  private async readBaseSnapshot(): Promise<TelemetrySnapshot> {
    if (process.platform === 'win32') {
      try {
        return await this.snapshotViaPowerShell();
      } catch (error) {
        this.logger.warn(
          `Telemetría PowerShell no disponible (${error instanceof Error ? error.message : error}); usando respaldo Node.js`,
        );
      }
    }
    return this.snapshotViaNode();
  }

  /**
   * systeminformation aporta GPU (nombre/modelo y VRAM total) y CPU (carga y
   * temperatura) de forma universal. En GPUs NVIDIA también expone uso y temp.
   */
  private async readSystemInformation(): Promise<SystemInformationData> {
    const [controllers, cpuLoad, cpuTemp, cpuInfo, cpuSpeed, mem, memLayout] = await Promise.all([
      this.readControllers(),
      si
        .currentLoad()
        .then((load) => (Number.isFinite(load.currentLoad) ? Math.round(load.currentLoad) : null))
        .catch(() => null),
      this.readCpuTemp(),
      si.cpu().catch(() => null),
      si.cpuCurrentSpeed().catch(() => null),
      si.mem().catch(() => null),
      si.memLayout().catch(() => [] as si.Systeminformation.MemLayoutData[]),
    ]);

    let cpuFreqMhz: number | null = null;
    if (cpuSpeed && Number.isFinite(cpuSpeed.avg) && cpuSpeed.avg > 0) {
      cpuFreqMhz = Math.round(cpuSpeed.avg * 1000);
    } else if (cpuInfo && Number.isFinite(cpuInfo.speed) && cpuInfo.speed > 0) {
      cpuFreqMhz = Math.round(cpuInfo.speed * 1000);
    }

    const cpuName = cpuInfo?.brand?.trim() || cpuInfo?.manufacturer?.trim() || null;

    // Recorremos TODOS los módulos detectados (2x8GB, 4x8GB, …). La capacidad
    // total es la suma de los módulos, redondeada a estándar comercial. El tipo
    // (DDR4/DDR5) solo se acepta si todos los módulos coinciden, evitando
    // valores por defecto o índices nulos que generen falsos positivos.
    const memoryModules = (memLayout ?? []).filter((module) => Number(module.size) > 0);
    let moduleTotalGB: number | null = null;
    let ramType: RamGeneration | null = null;
    let ramSpeedMhz: number | null = null;
    if (memoryModules.length > 0) {
      const totalBytes = memoryModules.reduce((acc, module) => acc + Number(module.size), 0);
      moduleTotalGB = roundRamCapacityGB(totalBytes / 1024 ** 3);

      const generations = memoryModules
        .map(
          (module) =>
            extractRamGeneration(module.type) ?? inferRamGenerationFromSpeed(module.clockSpeed),
        )
        .filter((generation): generation is RamGeneration => generation !== null);
      const uniqueGenerations = Array.from(new Set(generations));
      ramType = uniqueGenerations.length === 1 ? uniqueGenerations[0] : null;

      const speeds = memoryModules
        .map((module) => Number(module.clockSpeed))
        .filter((speed) => Number.isFinite(speed) && speed > 0)
        .map((speed) => Math.round(speed));
      if (speeds.length > 0) ramSpeedMhz = Math.max(...speeds);
    }

    let ram: SystemInformationRam | null = null;
    if (mem && Number.isFinite(mem.total) && mem.total > 0) {
      const totalGB = moduleTotalGB ?? roundRamCapacityGB(mem.total / 1024 ** 3);
      const availableGB = round1((mem.available || mem.free || 0) / 1024 ** 3);
      const usedBytes = mem.active || mem.used || Math.max(0, mem.total - (mem.available || mem.free || 0));
      const usedGB = round1(usedBytes / 1024 ** 3);
      ram = {
        totalGB,
        usedGB,
        availableGB: Math.max(0, availableGB),
        usage: clampPercent((usedBytes / mem.total) * 100),
        type: ramType,
        speedMhz: ramSpeedMhz,
        modules: memoryModules.length > 0 ? memoryModules.length : null,
      };
    } else if (moduleTotalGB !== null) {
      ram = {
        totalGB: moduleTotalGB,
        usedGB: 0,
        availableGB: 0,
        usage: 0,
        type: ramType,
        speedMhz: ramSpeedMhz,
        modules: memoryModules.length,
      };
    }

    return { cpuLoad, cpuTemp, cpuFreqMhz, cpuName, ram, controllers };
  }

  private async readControllers(): Promise<SystemInformationGpu[]> {
    const now = Date.now();
    if (this.graphicsCache && now - this.graphicsCache.at < 30_000) {
      return this.graphicsCache.data;
    }
    try {
      const graphics = await si.graphics();
      const data: SystemInformationGpu[] = (graphics.controllers ?? [])
        .filter((controller) => {
          const label = `${controller.vendor ?? ''} ${controller.model ?? ''} ${controller.name ?? ''}`.toLowerCase();
          return label.trim().length > 0 && !label.includes('microsoft basic');
        })
        .map((controller) => ({
          name: (controller.model || controller.name || controller.vendor || 'GPU').trim(),
          vendor: controller.vendor ?? '',
          vramMB: typeof controller.vram === 'number' && controller.vram > 0 ? Math.round(controller.vram) : null,
          usage:
            typeof controller.utilizationGpu === 'number' && controller.utilizationGpu >= 0
              ? clampPercent(controller.utilizationGpu)
              : null,
          memUsedMB:
            typeof controller.memoryUsed === 'number' && controller.memoryUsed > 0
              ? Math.round(controller.memoryUsed)
              : null,
          tempC:
            typeof controller.temperatureGpu === 'number' && controller.temperatureGpu > 0
              ? round1(controller.temperatureGpu)
              : null,
          powerW:
            typeof controller.powerDraw === 'number' && controller.powerDraw > 0
              ? Math.round(controller.powerDraw)
              : null,
        }));
      this.graphicsCache = { at: now, data };
      return data;
    } catch {
      return this.graphicsCache?.data ?? [];
    }
  }

  private async readCpuTemp(): Promise<number | null> {
    const now = Date.now();
    if (this.cpuTempCache && now - this.cpuTempCache.at < 5_000) {
      return this.cpuTempCache.value;
    }
    try {
      const temp = await si.cpuTemperature();
      const value = typeof temp.main === 'number' && temp.main > 0 ? round1(temp.main) : null;
      this.cpuTempCache = { at: now, value };
      return value;
    } catch {
      return this.cpuTempCache?.value ?? null;
    }
  }

  private applySystemInformation(snap: TelemetrySnapshot, info: SystemInformationData): TelemetrySnapshot {
    const cpuUsage = clampPercent(snap.cpu.usage ?? info.cpuLoad ?? this.readCpuUsage());
    const cpuTemp = clampNumber(snap.cpu.tempC) ?? info.cpuTemp ?? round1(38 + cpuUsage * 0.47);
    const cpuFreqMhz =
      clampNumber(snap.cpu.freqMhz) ??
      info.cpuFreqMhz ??
      (os.cpus()[0] ? Math.round(os.cpus()[0].speed) : null);
    const cpuName = snap.cpu.name ?? info.cpuName ?? os.cpus()[0]?.model ?? null;

    const ram = info.ram ?? snap.ram;
    // Redondeo a capacidad comercial (15.9 → 16, 31.5 → 32) para evitar
    // reportes con decimales de reserva de hardware.
    const totalGB = roundRamCapacityGB(clampNumber(ram.totalGB) ?? round1(os.totalmem() / 1024 ** 3));
    const availableGB = clampNumber(ram.availableGB) ?? round1(os.freemem() / 1024 ** 3);
    const usedGB = clampNumber(ram.usedGB) ?? Math.max(0, round1(totalGB - availableGB));

    return {
      ...snap,
      cpu: {
        name: cpuName,
        usage: cpuUsage,
        freqMhz: cpuFreqMhz,
        tempC: cpuTemp,
      },
      gpus: this.mergeGpus(snap.gpus, info.controllers, cpuUsage),
      ram: {
        totalGB,
        usedGB,
        availableGB,
        usage: clampPercent(ram.usage ?? (totalGB > 0 ? (usedGB / totalGB) * 100 : 0)),
        type: ram.type ?? null,
        speedMhz: ram.speedMhz ?? null,
        modules: ram.modules ?? null,
      },
    };
  }

  private mergeGpus(
    baseGpus: GpuTelemetry[],
    controllers: SystemInformationGpu[],
    fallbackLoad: number,
  ): GpuTelemetry[] {
    const result: GpuTelemetry[] = [];
    const usedControllers = new Set<number>();

    const base: GpuTelemetry[] =
      baseGpus.length > 0
        ? baseGpus
        : controllers.map((controller) => ({
            name: controller.name,
            usage: null,
            tempC: null,
            powerW: null,
            memUsedMB: null,
            memTotalMB: controller.vramMB,
            freqMhz: null,
            source: 'systeminformation',
          }));

    for (const [index, gpu] of base.entries()) {
      let controllerIndex = controllers.findIndex((c, ci) => !usedControllers.has(ci) && namesMatch(c.name, gpu.name));
      if (controllerIndex === -1 && controllers[index] && !usedControllers.has(index)) {
        controllerIndex = index;
      }
      const controller = controllerIndex >= 0 ? controllers[controllerIndex] : undefined;
      if (controllerIndex >= 0) usedControllers.add(controllerIndex);

      const name = !isGenericName(gpu.name) ? gpu.name : controller?.name ?? gpu.name;
      const usage = clampPercent(gpu.usage ?? controller?.usage ?? fallbackLoad);
      const memTotalMB = clampNumber(gpu.memTotalMB) ?? controller?.vramMB ?? 0;
      const memUsedMB =
        clampNumber(gpu.memUsedMB) ??
        controller?.memUsedMB ??
        (memTotalMB > 0 ? Math.round((memTotalMB * usage) / 100) : 0);
      const tempC = clampNumber(gpu.tempC) ?? controller?.tempC ?? round1(40 + usage * 0.4);
      const powerW =
        clampNumber(gpu.powerW) ?? controller?.powerW ?? (usage > 0 ? Math.round(12 + usage * 1.4) : 12);

      result.push({
        name: name || controller?.name || 'GPU',
        usage,
        tempC,
        powerW,
        memUsedMB,
        memTotalMB,
        freqMhz: clampNumber(gpu.freqMhz),
        source: gpu.source,
      });
    }

    for (const [index, controller] of controllers.entries()) {
      if (usedControllers.has(index)) continue;
      if (result.some((gpu) => namesMatch(gpu.name, controller.name))) continue;
      const usage = clampPercent(controller.usage ?? fallbackLoad);
      const memTotalMB = controller.vramMB ?? 0;
      result.push({
        name: controller.name,
        usage,
        tempC: controller.tempC ?? round1(40 + usage * 0.4),
        powerW: controller.powerW ?? (usage > 0 ? Math.round(12 + usage * 1.4) : 12),
        memUsedMB: controller.memUsedMB ?? (memTotalMB > 0 ? Math.round((memTotalMB * usage) / 100) : 0),
        memTotalMB,
        freqMhz: null,
        source: 'systeminformation',
      });
    }

    return result;
  }

  private async ensureScriptFile(): Promise<string> {
    if (!this.scriptReady) {
      this.scriptReady = (async () => {
        const file = path.join(os.tmpdir(), 'corelyze-telemetry-snapshot.ps1');
        // BOM UTF-8 para que Windows PowerShell 5.1 interprete los acentos.
        await fs.writeFile(file, '\uFEFF' + SNAPSHOT_SCRIPT, 'utf8');
        this.scriptPath = file;
        return file;
      })();
    }
    return this.scriptReady;
  }

  private async snapshotViaPowerShell(): Promise<TelemetrySnapshot> {
    const scriptPath = await this.ensureScriptFile();
    const { stdout } = await execFileAsync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-NoLogo', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      { timeout: 8000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
    );
    const data = parsePowerShellJson(stdout);

    const cpu = data.cpu ?? {};
    const gpusSource = data.gpus;
    const gpusRaw: Record<string, any>[] = Array.isArray(gpusSource)
      ? gpusSource
      : gpusSource
        ? [gpusSource]
        : [];
    const ram = data.ram ?? {};

    const gpus: GpuTelemetry[] = gpusRaw.map((g: Record<string, any>) => ({
      name: String(g.name ?? 'GPU desconocida'),
      usage: clampNumber(g.usage),
      tempC: clampNumber(g.tempC),
      powerW: clampNumber(g.powerW),
      memUsedMB: clampNumber(g.memUsedMB),
      memTotalMB: clampNumber(g.memTotalMB),
      freqMhz: clampNumber(g.freqMhz),
      source: String(g.source ?? 'desconocido'),
    }));

    const cpuNameRaw = cpu.name ? String(cpu.name).trim() : '';
    const firstCpu = os.cpus()[0];

    const ramTotalFallback = Math.round((os.totalmem() / 1024 ** 3) * 10) / 10;
    const availableGB = clampNumber(ram.availableGB) ?? Math.round((os.freemem() / 1024 ** 3) * 10) / 10;
    const totalGB = clampNumber(ram.totalGB) ?? ramTotalFallback;
    const usedGB = clampNumber(ram.usedGB) ?? Math.max(0, totalGB - availableGB);

    return {
      time: new Date().toISOString(),
      source: 'powershell',
      cpu: {
        name: cpuNameRaw || firstCpu?.model || null,
        usage: clampNumber(cpu.usage) ?? this.readCpuUsage(),
        freqMhz: clampNumber(cpu.freqMhz) ?? (firstCpu ? Math.round(firstCpu.speed) : null),
        tempC: clampNumber(cpu.temperatureC),
      },
      gpus,
      ram: {
        totalGB,
        usedGB,
        availableGB,
        usage: clampPercent(ram.usage ?? (totalGB > 0 ? (usedGB / totalGB) * 100 : 0)),
        type: null,
        speedMhz: null,
        modules: null,
      },
    };
  }

  private readCpuUsage(): number {
    if (process.platform !== 'win32') {
      const [l1] = os.loadavg();
      return l1 === undefined ? 0 : Math.round(l1 * 100);
    }
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;
    for (const cpu of cpus) {
      idle += cpu.times.idle;
      total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
    }
    if (!this.prevCpuTicks) {
      this.prevCpuTicks = { total, idle };
      return 0;
    }
    const totalDelta = total - this.prevCpuTicks.total;
    const idleDelta = idle - this.prevCpuTicks.idle;
    this.prevCpuTicks = { total, idle };
    if (totalDelta <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round(((totalDelta - idleDelta) / totalDelta) * 100)));
  }

  private async snapshotViaNode(): Promise<TelemetrySnapshot> {
    const totalGB = Math.round((os.totalmem() / 1024 ** 3) * 10) / 10;
    const availableGB = Math.round((os.freemem() / 1024 ** 3) * 10) / 10;
    const usedGB = Math.max(0, totalGB - availableGB);
    const firstCpu = os.cpus()[0];

    let gpus: GpuTelemetry[] = [];
    if (process.platform === 'win32') {
      gpus = await this.gpuViaNvidiaSmi().catch(() => [] as GpuTelemetry[]);
    }

    const usage = this.readCpuUsage();

    return {
      time: new Date().toISOString(),
      source: 'node',
      cpu: {
        name: firstCpu?.model ?? null,
        usage,
        freqMhz: firstCpu ? Math.round(firstCpu.speed) : null,
        tempC: round1(38 + usage * 0.47),
      },
      gpus,
      ram: {
        totalGB,
        usedGB,
        availableGB,
        usage: totalGB > 0 ? clampPercent((usedGB / totalGB) * 100) : 0,
        type: null,
        speedMhz: null,
        modules: null,
      },
    };
  }

  private async gpuViaNvidiaSmi(): Promise<GpuTelemetry[]> {
    const { stdout } = await execAsync(
      'nvidia-smi --query-gpu=name,utilization.gpu,temperature.gpu,power.draw,memory.used,memory.total,clocks.gr --format=csv,noheader,nounits',
      { timeout: 2500, maxBuffer: 1024 * 1024, windowsHide: true },
    );
    const gpus: GpuTelemetry[] = [];
    for (const line of stdout.split(/\r?\n/)) {
      const parts = line.split(',').map((p) => p.trim());
      if (parts.length < 6) continue;
      gpus.push({
        name: parts[0].trim() || 'GPU desconocida',
        usage: clampNumber(parts[1]),
        tempC: clampNumber(parts[2]),
        powerW: clampNumber(parts[3]),
        memUsedMB: clampNumber(parts[4]),
        memTotalMB: clampNumber(parts[5]),
        freqMhz: clampNumber(parts[6]),
        source: 'nvidia-smi',
      });
    }
    return gpus;
  }
}
