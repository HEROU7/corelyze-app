import { Module } from '@nestjs/common';
import { ValidationController } from '../../infrastructure/http/controllers/validation.controller';
import { ValidateCompatibilityUseCase } from '../use-cases/compatibility/validate-compatibility.use-case';
import { AnalyzeBottlenecksUseCase } from '../use-cases/compatibility/analyze-bottlenecks.use-case';
import { CompatibilityService } from '../../domain/services/compatibility.service';
import { PrismaComponentRepository } from '../../infrastructure/repositories/prisma/component.repository';
import { PrismaModule } from '../../infrastructure/database/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ValidationController],
  providers: [
    CompatibilityService,
    PrismaComponentRepository,
    ValidateCompatibilityUseCase,
    AnalyzeBottlenecksUseCase,
  ],
  exports: [CompatibilityService],
})
export class ValidationModule {}
