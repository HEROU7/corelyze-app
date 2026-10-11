import { Controller, Get, Post, Body, Param, Query, Patch, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import {
  GetBuildsUseCase,
  GetBuildByIdUseCase,
  GetBuildBySlugUseCase,
  GetFeaturedBuildsUseCase,
} from '../../../application/use-cases/build/get-builds.use-case';
import { CreateBuildUseCase } from '../../../application/use-cases/build/create-build.use-case';
import { UpdateBuildUseCase } from '../../../application/use-cases/build/update-build.use-case';
import { DeleteBuildUseCase } from '../../../application/use-cases/build/delete-build.use-case';
import { CreateBuildDto } from '../dtos/create-build.dto';
import { UpdateBuildDto } from '../dtos/update-build.dto';

@ApiTags('builds')
@Controller('builds')
export class BuildController {
  constructor(
    private getBuildsUseCase: GetBuildsUseCase,
    private getBuildByIdUseCase: GetBuildByIdUseCase,
    private getBuildBySlugUseCase: GetBuildBySlugUseCase,
    private getFeaturedBuildsUseCase: GetFeaturedBuildsUseCase,
    private createBuildUseCase: CreateBuildUseCase,
    private updateBuildUseCase: UpdateBuildUseCase,
    private deleteBuildUseCase: DeleteBuildUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Obtener todos los builds pre-configurados' })
  @ApiQuery({ name: 'categoria', required: false })
  @ApiQuery({ name: 'casoUso', required: false })
  @ApiQuery({ name: 'destacado', required: false })
  async findAll(@Query() query: any) {
    return this.getBuildsUseCase.execute(query);
  }

  @Post()
  @ApiOperation({ summary: 'Registrar un ensamble personalizado' })
  async create(@Body() body: CreateBuildDto) {
    return this.createBuildUseCase.execute(body);
  }

  @Get('featured')
  @ApiOperation({ summary: 'Obtener builds destacados' })
  async findFeatured() {
    return this.getFeaturedBuildsUseCase.execute();
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Obtener build por slug' })
  async findBySlug(@Param('slug') slug: string) {
    return this.getBuildBySlugUseCase.execute(slug);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar ensamble' })
  async update(@Param('id') id: string, @Body() body: UpdateBuildDto) {
    return this.updateBuildUseCase.execute(id, body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener build por ID' })
  async findById(@Param('id') id: string) {
    return this.getBuildByIdUseCase.execute(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Desactivar (eliminar lógico) un ensamble' })
  async remove(@Param('id') id: string) {
    return this.deleteBuildUseCase.execute(id);
  }
}
