import { Module } from '@nestjs/common';
import { BuildController } from '../../infrastructure/http/controllers/build.controller';
import {
  GetBuildsUseCase,
  GetBuildByIdUseCase,
  GetBuildBySlugUseCase,
  GetFeaturedBuildsUseCase,
} from '../use-cases/build/get-builds.use-case';
import { CreateBuildUseCase } from '../use-cases/build/create-build.use-case';
import { UpdateBuildUseCase } from '../use-cases/build/update-build.use-case';
import { DeleteBuildUseCase } from '../use-cases/build/delete-build.use-case';
import { PrismaBuildRepository } from '../../infrastructure/repositories/prisma/build.repository';
import { PrismaModule } from '../../infrastructure/database/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BuildController],
  providers: [
    PrismaBuildRepository,
    GetBuildsUseCase,
    GetBuildByIdUseCase,
    GetBuildBySlugUseCase,
    GetFeaturedBuildsUseCase,
    CreateBuildUseCase,
    UpdateBuildUseCase,
    DeleteBuildUseCase,
  ],
  exports: [PrismaBuildRepository],
})
export class BuildModule {}
