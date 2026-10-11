import { Injectable } from '@nestjs/common';
import { CompatibilityResult, CompatibilityIssue, BottleneckAnalysis } from '@analizador-hardware/types';
import {
  extractRamGeneration,
  inferRamGenerationFromSpeed,
  resolveRamGeneration,
  socketsMatch,
  valueInList,
} from '../utils/hardware-normalization';

@Injectable()
export class CompatibilityService {
  async validateCompatibility(selectedComponents: any[]): Promise<CompatibilityResult> {
    const issues: CompatibilityIssue[] = [];
    const warnings: CompatibilityIssue[] = [];

    const cpu = selectedComponents.find((c) => c.categoria?.slug === 'cpu');
    const motherboard = selectedComponents.find((c) => c.categoria?.slug === 'motherboard');
    const ram = selectedComponents.filter((c) => c.categoria?.slug === 'ram');
    const gpu = selectedComponents.filter((c) => c.categoria?.slug === 'gpu');
    const psu = selectedComponents.find((c) => c.categoria?.slug === 'psu');
    const caseComponent = selectedComponents.find((c) => c.categoria?.slug === 'case');
    const cooler = selectedComponents.find((c) => c.categoria?.slug === 'cooler');

    if (cpu && motherboard) {
      const cpuSocket = cpu.especificaciones?.socket || cpu.datosTecnicos?.socket;
      const mbSocket = motherboard.especificaciones?.socket || motherboard.datosTecnicos?.socket;
      // Comparación tolerante: "LGA 1700" == "LGA1700", "AM4" == "am4", etc.
      if (cpuSocket && mbSocket && !socketsMatch(cpuSocket, mbSocket)) {
        issues.push({
          type: 'SOCKET_MISMATCH',
          severity: 'CRITICAL',
          component1: cpu.sku,
          component2: motherboard.sku,
          description: `Socket CPU (${cpuSocket}) no compatible con socket Motherboard (${mbSocket})`,
          suggestion: 'Selecciona CPU y Motherboard con el mismo socket',
        });
      }

      const mbChipset = motherboard.especificaciones?.chipset || motherboard.datosTecnicos?.chipset;
      const cpuRamType = cpu.especificaciones?.ramType || cpu.datosTecnicos?.ramType;
      const mbRamType = motherboard.especificaciones?.tipoRam || motherboard.datosTecnicos?.tipoRam;

      // Resolvemos la generación real (DDR3/DDR4/DDR5) tolerando formatos y
      // aplicando respaldos inteligentes (frecuencia del equipo / chipset de la placa).
      const cpuRamGen = resolveRamGeneration({ type: cpuRamType });
      const mbRamGen = resolveRamGeneration({ type: mbRamType, chipset: mbChipset });

      if (ram.length > 0) {
        const ramEntry = ram[0];
        const ramDeclared =
          ramEntry.especificaciones?.tipo || ramEntry.datosTecnicos?.tipo;
        const ramSpeed =
          ramEntry.especificaciones?.frecuencia ||
          ramEntry.datosTecnicos?.frecuencia ||
          ramEntry.especificaciones?.velocidad;
        // La frecuencia física (3200, 3600, 6000 MHz…) es la fuente más
        // confiable. Se prefiere sobre el tipo declarado para que un registro
        // mal etiquetado (p. ej. un DDR4 3200 guardado como "DDR5") no genere
        // un falso positivo. Si no hay frecuencia, se usa el tipo declarado.
        const ramGen =
          inferRamGenerationFromSpeed(ramSpeed) ?? extractRamGeneration(ramDeclared);
        // Solo marcamos error cuando AMBOS lados son determinables y difieren.
        if (ramGen && mbRamGen && ramGen !== mbRamGen) {
          issues.push({
            type: 'RAM_TYPE_MISMATCH',
            severity: 'HIGH',
            component1: ramEntry.sku,
            component2: motherboard.sku,
            description: `Tipo RAM (${ramGen}) no compatible con Motherboard (${mbRamGen})`,
            suggestion: `Usa RAM ${mbRamGen} compatible con la motherboard`,
          });
        }
      }

      if (cpuRamGen && mbRamGen && cpuRamGen !== mbRamGen) {
        warnings.push({
          type: 'CPU_RAM_TYPE_MISMATCH',
          severity: 'MEDIUM',
          component1: cpu.sku,
          component2: motherboard.sku,
          description: `El CPU admite memoria ${cpuRamGen} pero la motherboard usa ${mbRamGen}`,
          suggestion: `Elige una motherboard compatible con memoria ${cpuRamGen}`,
        });
      }
    }

    if (psu) {
      let totalTdp = 0;
      if (cpu?.especificaciones?.tdp || cpu?.datosTecnicos?.tdp) {
        totalTdp += Number(cpu.especificaciones?.tdp || cpu.datosTecnicos?.tdp);
      }
      gpu.forEach((g) => {
        if (g.especificaciones?.tdp || g.datosTecnicos?.tdp) {
          totalTdp += Number(g.especificaciones?.tdp || g.datosTecnicos?.tdp);
        }
      });
      totalTdp += 50; // Otros componentes

      const requiredPower = Math.ceil(totalTdp * 1.2);
      const psuWattage = psu.especificaciones?.watts || psu.datosTecnicos?.watts || psu.especificaciones?.wattage;

      if (psuWattage && psuWattage < requiredPower) {
        warnings.push({
          type: 'INSUFFICIENT_POWER',
          severity: 'MEDIUM',
          component1: psu.sku,
          description: `Fuente de ${psuWattage}W puede ser insuficiente. Recomendado: ${requiredPower}W (con margen 20%)`,
          suggestion: 'Considera una fuente de mayor potencia',
        });
      }
    }

    if (gpu.length > 0 && caseComponent) {
      gpu.forEach((g) => {
        const gpuLength = g.especificaciones?.longitud || g.datosTecnicos?.longitud || g.especificaciones?.length;
        const caseMaxLength = caseComponent.especificaciones?.maxGpuLength || caseComponent.datosTecnicos?.maxGpuLength;
        if (gpuLength && caseMaxLength && gpuLength > caseMaxLength) {
          issues.push({
            type: 'GPU_CASE_MISMATCH',
            severity: 'HIGH',
            component1: g.sku,
            component2: caseComponent.sku,
            description: `GPU de ${gpuLength}mm excede espacio máximo del gabinete (${caseMaxLength}mm)`,
            suggestion: 'Selecciona gabinete con mayor espacio o GPU más corta',
          });
        }
      });
    }

    if (cpu && cooler) {
      const cpuSocket = cpu.especificaciones?.socket || cpu.datosTecnicos?.socket;
      const coolerSockets = cooler.especificaciones?.sockets || cooler.datosTecnicos?.sockets;
      if (Array.isArray(coolerSockets) && cpuSocket && !valueInList(cpuSocket, coolerSockets)) {
        issues.push({
          type: 'COOLER_SOCKET_MISMATCH',
          severity: 'HIGH',
          component1: cooler.sku,
          component2: cpu.sku,
          description: `El cooler no soporta el socket del CPU (${cpuSocket})`,
          suggestion: `Selecciona un cooler compatible con socket ${cpuSocket}`,
        });
      }

      const cpuTdp = Number(cpu.especificaciones?.tdp || cpu.datosTecnicos?.tdp || 0);
      const coolerTdp = Number(cooler.especificaciones?.tdp || cooler.datosTecnicos?.tdp || 0);
      if (cpuTdp && coolerTdp && coolerTdp < cpuTdp) {
        warnings.push({
          type: 'INSUFFICIENT_COOLING',
          severity: 'MEDIUM',
          component1: cooler.sku,
          component2: cpu.sku,
          description: `El cooler disipa ${coolerTdp}W y el CPU tiene un TDP de ${cpuTdp}W`,
          suggestion: 'Considera un cooler con mayor capacidad de disipación',
        });
      }
    }

    const compatible = issues.length === 0;
    const score = compatible ? 100 - warnings.length * 5 : Math.max(0, 60 - issues.length * 10);

    return {
      compatible,
      issues,
      warnings,
      score,
    };
  }

  async analyzeBottlenecks(cpu: any, gpu: any, ram: any, resolution: '1080p' | '1440p' | '4K' = '1080p'): Promise<BottleneckAnalysis> {
    const cpuScore = cpu?.benchmarkScore || cpu?.datosTecnicos?.benchmarkScore || 5000;
    const gpuScore = gpu?.benchmarkScore || gpu?.datosTecnicos?.benchmarkScore || 5000;
    const ramAmount = this.calculateTotalRam(ram) || 16;

    let ratio = cpuScore / gpuScore;
    let bottleneckPercentage = 0;
    let overallBottleneck: BottleneckAnalysis['overallBottleneck'] = 'BALANCED';
    let classification: 'BALANCED' | 'CPU_LIMITED' | 'GPU_LIMITED' = 'BALANCED';

    if (ratio > 1.3) {
      bottleneckPercentage = Math.min(30, (ratio - 1) * 15);
      overallBottleneck = 'GPU';
      classification = 'GPU_LIMITED';
    } else if (ratio < 0.7) {
      bottleneckPercentage = Math.min(30, (1 / ratio - 1) * 15);
      overallBottleneck = 'CPU';
      classification = 'CPU_LIMITED';
    } else {
      bottleneckPercentage = 5;
      overallBottleneck = 'BALANCED';
      classification = 'BALANCED';
    }

    if (ramAmount < 16 && resolution !== '1080p') {
      // ram might be limiting
    }

    const resolutionMultiplier = {
      '1080p': 1.0,
      '1440p': 0.8,
      '4K': 0.6,
    };

    const adjustedPercentage = bottleneckPercentage * resolutionMultiplier[resolution];

    const baseScore: any = {
      bottleneckType: overallBottleneck,
      percentage: Math.round(adjustedPercentage * 10) / 10,
      impact: adjustedPercentage > 15 ? 'HIGH' : adjustedPercentage > 8 ? 'MEDIUM' : 'LOW',
    };

    const recommendations: string[] = [];
    if (classification === 'CPU_LIMITED') {
      recommendations.push('Considera actualizar el CPU para equilibrar el sistema');
    } else if (classification === 'GPU_LIMITED') {
      recommendations.push('Considera actualizar la GPU para equilibrar el sistema');
    } else {
      recommendations.push('Sistema equilibrado para esta configuración');
    }
    if (ramAmount < 16) {
      recommendations.push('Se recomienda al menos 16GB de RAM para mejor rendimiento');
    }

    return {
      overallBottleneck,
      bottleneckPercentage: Math.round(bottleneckPercentage * 10) / 10,
      cpuGpuBalance: {
        ratio: Math.round(ratio * 100) / 100,
        classification,
      },
      resolutionAnalysis: {
        '1080p': baseScore,
        '1440p': { ...baseScore, percentage: Math.round(adjustedPercentage * 0.8 * 10) / 10 },
        '4K': { ...baseScore, percentage: Math.round(adjustedPercentage * 0.6 * 10) / 10 },
      },
      recommendations,
    };
  }

  private calculateTotalRam(ram: any[] | any): number {
    if (!ram) return 0;
    if (Array.isArray(ram)) {
      return ram.reduce((total, r) => {
        const capacity = r.especificaciones?.capacidad || r.datosTecnicos?.capacidad || r.capacity || 0;
        return total + Number(capacity);
      }, 0);
    }
    return ram.especificaciones?.capacidad || ram.datosTecnicos?.capacidad || ram.capacity || 0;
  }
}
