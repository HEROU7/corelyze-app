import { Injectable } from '@nestjs/common';
import { CompatibilityService } from '../../../domain/services/compatibility.service';
import { PrismaComponentRepository } from '../../../infrastructure/repositories/prisma/component.repository';

@Injectable()
export class ValidateCompatibilityUseCase {
  constructor(
    private compatibilityService: CompatibilityService,
    private componentRepository: PrismaComponentRepository,
  ) {}

  async execute(componentIds: string[]) {
    const components = await Promise.all(
      componentIds.map((id) => this.componentRepository.findById(id)),
    );
    const validComponents = components.filter((c) => c !== null);
    return this.compatibilityService.validateCompatibility(validComponents);
  }
}
