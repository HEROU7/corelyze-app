import { Module } from '@nestjs/common';
import { ComponentController } from '../../infrastructure/http/controllers/component.controller';
import {
  GetComponentsUseCase,
  GetComponentByIdUseCase,
  GetComponentsByCategoryUseCase,
  SearchComponentsUseCase,
} from '../use-cases/component/get-components.use-case';
import { PrismaComponentRepository } from '../../infrastructure/repositories/prisma/component.repository';
import { PrismaModule } from '../../infrastructure/database/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ComponentController],
  providers: [
    PrismaComponentRepository,
    GetComponentsUseCase,
    GetComponentByIdUseCase,
    GetComponentsByCategoryUseCase,
    SearchComponentsUseCase,
  ],
  exports: [PrismaComponentRepository],
})
export class ComponentModule {}
