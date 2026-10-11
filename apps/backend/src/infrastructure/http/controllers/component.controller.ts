import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import {
  GetComponentsUseCase,
  GetComponentByIdUseCase,
  GetComponentsByCategoryUseCase,
  SearchComponentsUseCase,
} from '../../../application/use-cases/component/get-components.use-case';

@ApiTags('components')
@Controller('components')
export class ComponentController {
  constructor(
    private getComponentsUseCase: GetComponentsUseCase,
    private getComponentByIdUseCase: GetComponentByIdUseCase,
    private getComponentsByCategoryUseCase: GetComponentsByCategoryUseCase,
    private searchComponentsUseCase: SearchComponentsUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Obtener todos los componentes' })
  @ApiQuery({ name: 'categoriaId', required: false })
  @ApiQuery({ name: 'marcaId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async findAll(@Query() query: any) {
    return this.getComponentsUseCase.execute(query);
  }

  @Get('search')
  @ApiOperation({ summary: 'Buscar componentes' })
  @ApiQuery({ name: 'q', required: true })
  async search(@Query('q') q: string) {
    return this.searchComponentsUseCase.execute(q);
  }

  @Get('category/:categoryId')
  @ApiOperation({ summary: 'Obtener componentes por categoría' })
  async findByCategory(@Param('categoryId') categoryId: string) {
    return this.getComponentsByCategoryUseCase.execute(categoryId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener componente por ID' })
  async findById(@Param('id') id: string) {
    return this.getComponentByIdUseCase.execute(id);
  }
}
