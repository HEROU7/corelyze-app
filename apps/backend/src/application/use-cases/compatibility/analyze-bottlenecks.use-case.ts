import { Injectable } from '@nestjs/common';
import { CompatibilityService } from '../../../domain/services/compatibility.service';
import { PrismaComponentRepository } from '../../../infrastructure/repositories/prisma/component.repository';

@Injectable()
export class AnalyzeBottlenecksUseCase {
  constructor(
    private compatibilityService: CompatibilityService,
    private componentRepository: PrismaComponentRepository,
  ) {}

  async execute(cpuId: string, gpuId: string, ramIds: string[], resolution: '1080p' | '1440p' | '4K' = '1080p') {
    const [cpu, gpu, ...ramComponents] = await Promise.all([
      this.componentRepository.findById(cpuId),
      this.componentRepository.findById(gpuId),
      ...ramIds.map((id) => this.componentRepository.findById(id)),
    ]);

    const validRam = ramComponents.filter((r) => r !== null);
    return this.compatibilityService.analyzeBottlenecks(cpu, gpu, validRam, resolution);
  }
}
