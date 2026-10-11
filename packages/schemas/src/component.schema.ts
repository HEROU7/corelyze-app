import { z } from 'zod';

export const componentSchema = z.object({
  nombre: z.string().min(1),
  slug: z.string().min(1),
  sku: z.string().min(1),
  descripcion: z.string().optional(),
  marcaId: z.string().uuid(),
  categoriaId: z.string().uuid(),
  precio: z.number().positive().optional(),
  stock: z.number().int().nonnegative().default(0),
  activo: z.boolean().default(true),
  especificaciones: z.record(z.any()).optional(),
  datosTecnicos: z.record(z.any()).optional(),
});

export type CreateComponentDto = z.infer<typeof componentSchema>;
