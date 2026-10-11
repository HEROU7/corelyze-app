import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { decodeComponent } from '../../database/prisma/json-codec';
import { IComponentRepository } from '../../../domain/repositories/component.repository';

@Injectable()
export class PrismaComponentRepository implements IComponentRepository {
  constructor(private prisma: PrismaService) {}

  async findAll(filters?: any) {
    const where: any = { activo: true };
    if (filters?.categoriaId) where.categoriaId = filters.categoriaId;
    if (filters?.marcaId) where.marcaId = filters.marcaId;
    if (filters?.search) {
      // SQLite no soporta `mode: 'insensitive'`; su LIKE ya es case-insensitive
      // para ASCII, suficiente para las búsquedas del catálogo.
      where.OR = [
        { nombre: { contains: filters.search } },
        { sku: { contains: filters.search } },
        { slug: { contains: filters.search } },
      ];
    }
    // IMPORTANTE: sin tope por defecto. El catálogo completo debe estar
    // disponible para el análisis (emparejado de hardware, compatibilidad,
    // cálculo de cuello de botella, etc.). Solo se aplica `take` cuando el
    // cliente envía un `limit` numérico positivo; `0`/vacío/ausente = todos.
    const rawLimit = filters?.limit;
    const limit =
      rawLimit !== undefined && rawLimit !== null && rawLimit !== '' ? Number(rawLimit) : NaN;
    const rawOffset = filters?.offset;
    const offset =
      rawOffset !== undefined && rawOffset !== null && rawOffset !== '' ? Number(rawOffset) : NaN;
    const rows = await this.prisma.componente.findMany({
      where,
      include: { marca: true, categoria: true },
      ...(Number.isFinite(limit) && limit > 0 ? { take: limit } : {}),
      ...(Number.isFinite(offset) && offset > 0 ? { skip: offset } : {}),
    });
    return rows.map(decodeComponent);
  }

  async findById(id: string) {
    const row = await this.prisma.componente.findUnique({
      where: { id },
      include: { marca: true, categoria: true },
    });
    return decodeComponent(row);
  }

  async findBySlug(slug: string) {
    const row = await this.prisma.componente.findUnique({
      where: { slug },
      include: { marca: true, categoria: true },
    });
    return decodeComponent(row);
  }

  async findByCategory(categoryId: string) {
    const rows = await this.prisma.componente.findMany({
      where: { categoriaId: categoryId, activo: true },
      include: { marca: true, categoria: true },
    });
    return rows.map(decodeComponent);
  }

  async search(query: string) {
    const rows = await this.prisma.componente.findMany({
      where: {
        activo: true,
        OR: [
          { nombre: { contains: query } },
          { sku: { contains: query } },
          { descripcion: { contains: query } },
        ],
      },
      include: { marca: true, categoria: true },
    });
    return rows.map(decodeComponent);
  }

  async create(data: any) {
    return this.prisma.componente.create({ data });
  }

  async update(id: string, data: any) {
    return this.prisma.componente.update({ where: { id }, data });
  }

  async delete(id: string) {
    return this.prisma.componente.update({ where: { id }, data: { activo: false } });
  }
}
