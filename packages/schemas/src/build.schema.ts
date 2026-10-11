import { z } from 'zod';

export const buildCategorySchema = z.enum(['ENTRY', 'MID_RANGE', 'HIGH_END', 'ULTRA', 'CUSTOM']);

export type BuildCategory = z.infer<typeof buildCategorySchema>;

export const useCaseSchema = z.enum([
  'GAMING',
  'WORKSTATION',
  'OFFICE',
  'STREAMING',
  'EDITING',
  'RENDERING',
  'GENERAL',
]);

export type UseCase = z.infer<typeof useCaseSchema>;

export const buildComponentSchema = z.object({
  componentId: z.string().uuid(),
  cantidad: z.number().int().positive(),
  posicion: z.string().optional(),
  obligatorio: z.boolean().default(true),
});

export type BuildComponent = z.infer<typeof buildComponentSchema>;

export const preconfiguredBuildSchema = z.object({
  nombre: z.string().min(1),
  slug: z.string().min(1),
  descripcion: z.string().optional(),
  categoria: buildCategorySchema.default('CUSTOM'),
  casoUso: z.array(useCaseSchema).min(1),
  puntuacionGlobal: z.number().min(0).max(10).optional(),
  precioTotal: z.number().positive().optional(),
  pros: z.array(z.string()).default([]),
  contras: z.array(z.string()).default([]),
  componentes: z.array(buildComponentSchema).min(1),
  rendimiento: z.record(z.any()).optional(),
  configuracion: z.record(z.any()).optional(),
  activo: z.boolean().default(true),
  destacado: z.boolean().default(false),
});

export type CreatePreconfiguredBuildDto = z.infer<typeof preconfiguredBuildSchema>;

export type UpdatePreconfiguredBuildDto = Partial<CreatePreconfiguredBuildDto>;
