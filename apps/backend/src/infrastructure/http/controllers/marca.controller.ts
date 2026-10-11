import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma/prisma.service';

@ApiTags('marcas')
@Controller('marcas')
export class MarcaController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener todas las marcas' })
  async findAll() {
    return this.prisma.marca.findMany({
      orderBy: { nombre: 'asc' },
    });
  }
}
