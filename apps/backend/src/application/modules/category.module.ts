import { Module } from '@nestjs/common';
import { CategoryController } from '../../infrastructure/http/controllers/category.controller';
import { PrismaModule } from '../../infrastructure/database/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CategoryController],
})
export class CategoryModule {}
