import { Module } from '@nestjs/common';
import { MarcaController } from '../../infrastructure/http/controllers/marca.controller';
import { PrismaModule } from '../../infrastructure/database/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MarcaController],
})
export class MarcaModule {}
