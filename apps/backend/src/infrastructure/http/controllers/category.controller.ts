import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma/prisma.service';

@ApiTags('categories')
@Controller('categories')
export class CategoryController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener todas las categorías' })
  async findAll() {
    return this.prisma.categoria.findMany({
      orderBy: { nombre: 'asc' },
    });
  }
}
