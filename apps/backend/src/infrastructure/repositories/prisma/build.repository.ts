import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { decodeBuild, encodeJson, encodeJsonArray } from '../../database/prisma/json-codec';
import {
  CreateCustomBuildInput,
  IBuildRepository,
} from '../../../domain/repositories/build.repository';

const COMPONENT_INCLUDE = {
  componentes: {
    include: {
      componente: {
        include: { marca: true, categoria: true },
      },
    },
  },
} as const;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

@Injectable()
export class PrismaBuildRepository implements IBuildRepository {
  constructor(private prisma: PrismaService) {}

  async findAll(filters?: any) {
    const where: any = { activo: true };
    if (filters?.categoria) where.categoria = filters.categoria;
    // SQLite no soporta filtros de array (`has`); `casoUso` se guarda como JSON
    // serializado, por lo que basta con buscar el token dentro del texto.
    if (filters?.casoUso) where.casoUso = { contains: filters.casoUso };
    if (filters?.destacado !== undefined) where.destacado = filters.destacado;

    const rows = await this.prisma.ensamblePreconfigurado.findMany({
      where,
      include: COMPONENT_INCLUDE,
      orderBy: { precioTotal: 'asc' },
    });
    return rows.map(decodeBuild);
  }

  async findById(id: string) {
    const row = await this.prisma.ensamblePreconfigurado.findUnique({
      where: { id },
      include: COMPONENT_INCLUDE,
    });
    return decodeBuild(row);
  }

  async findBySlug(slug: string) {
    const row = await this.prisma.ensamblePreconfigurado.findUnique({
      where: { slug },
      include: COMPONENT_INCLUDE,
    });
    return decodeBuild(row);
  }

  async findFeatured() {
    const rows = await this.prisma.ensamblePreconfigurado.findMany({
      where: { activo: true, destacado: true },
      include: COMPONENT_INCLUDE,
      take: 6,
    });
    return rows.map(decodeBuild);
  }

  async findByCategory(category: string) {
    const rows = await this.prisma.ensamblePreconfigurado.findMany({
      where: { activo: true, categoria: category },
      include: COMPONENT_INCLUDE,
    });
    return rows.map(decodeBuild);
  }

  async findByUseCase(useCase: string) {
    const rows = await this.prisma.ensamblePreconfigurado.findMany({
      where: { activo: true, casoUso: { contains: useCase } },
      include: COMPONENT_INCLUDE,
    });
    return rows.map(decodeBuild);
  }

  async create(data: any) {
    return this.prisma.ensamblePreconfigurado.create({ data });
  }

  async createCustom(input: CreateCustomBuildInput) {
    const components = await this.prisma.componente.findMany({
      where: { id: { in: input.componentIds } },
    });

    const precioTotal = components.reduce(
      (acc, c) => acc + (c.precio ? Number(c.precio) : 0),
      0,
    );

    const baseSlug = slugify(input.nombre) || 'ensamble';
    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    const row = await this.prisma.ensamblePreconfigurado.create({
      data: {
        nombre: input.nombre,
        slug,
        descripcion: input.descripcion ?? null,
        categoria: input.categoria ?? 'CUSTOM',
        casoUso: encodeJsonArray(input.casoUso),
        pros: encodeJsonArray(input.pros),
        contras: encodeJsonArray(input.contras),
        precioTotal: components.length > 0 ? precioTotal : null,
        especificaciones: encodeJson(input.especificaciones),
        componentes: {
          create: components.map((c) => ({ componenteId: c.id })),
        },
      },
      include: COMPONENT_INCLUDE,
    });
    return decodeBuild(row);
  }

  async update(id: string, data: any) {
    const clean: any = { ...data };
    if ('casoUso' in clean) clean.casoUso = encodeJsonArray(clean.casoUso);
    if ('pros' in clean) clean.pros = encodeJsonArray(clean.pros);
    if ('contras' in clean) clean.contras = encodeJsonArray(clean.contras);
    if ('especificaciones' in clean) clean.especificaciones = encodeJson(clean.especificaciones);
    if ('rendimiento' in clean) clean.rendimiento = encodeJson(clean.rendimiento);
    if ('configuracion' in clean) clean.configuracion = encodeJson(clean.configuracion);

    const row = await this.prisma.ensamblePreconfigurado.update({ where: { id }, data: clean });
    return decodeBuild(row);
  }

  async replaceComponents(id: string, componentIds: string[]) {
    const components = await this.prisma.componente.findMany({
      where: { id: { in: componentIds } },
    });

    const precioTotal = components.reduce(
      (acc, c) => acc + (c.precio ? Number(c.precio) : 0),
      0,
    );

    await this.prisma.ensambleComponente.deleteMany({
      where: { ensamblajeId: id },
    });

    if (components.length > 0) {
      await this.prisma.ensambleComponente.createMany({
        data: components.map((c) => ({ ensamblajeId: id, componenteId: c.id })),
      });
    }

    await this.prisma.ensamblePreconfigurado.update({
      where: { id },
      data: { precioTotal: components.length > 0 ? precioTotal : null },
    });
  }

  async delete(id: string) {
    return this.prisma.ensamblePreconfigurado.update({ where: { id }, data: { activo: false } });
  }
}
