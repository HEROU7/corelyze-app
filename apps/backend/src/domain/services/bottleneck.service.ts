import { Injectable } from '@nestjs/common';

@Injectable()
export class BottleneckService {
  analyzeCPUvsGPU(cpuScore: number, gpuScore: number, resolution: '1080p' | '1440p' | '4K' = '1080p'): any {
    const ratio = cpuScore / gpuScore;
    const resolutionFactors = { '1080p': 1.0, '1440p': 0.85, '4K': 0.65 };

    let bottleneckPercent = 0;
    let type: 'CPU' | 'GPU' | 'BALANCED' = 'BALANCED';

    if (ratio > 1.25) {
      bottleneckPercent = Math.min(25, (ratio - 1) * 12);
      type = 'GPU';
    } else if (ratio < 0.8) {
      bottleneckPercent = Math.min(25, (1 / ratio - 1) * 12);
      type = 'CPU';
    } else {
      bottleneckPercent = 3;
      type = 'BALANCED';
    }

    const adjusted = bottleneckPercent * resolutionFactors[resolution];
    return {
      type,
      percentage: Math.round(adjusted * 10) / 10,
      impact: adjusted > 15 ? 'HIGH' : adjusted > 8 ? 'MEDIUM' : 'LOW',
    };
  }
}
