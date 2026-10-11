export enum BuildCategory {
  ENTRY = 'ENTRY',
  MID_RANGE = 'MID_RANGE',
  HIGH_END = 'HIGH_END',
  ULTRA = 'ULTRA',
  CUSTOM = 'CUSTOM',
}

export enum UseCase {
  GAMING = 'GAMING',
  WORKSTATION = 'WORKSTATION',
  OFFICE = 'OFFICE',
  STREAMING = 'STREAMING',
  EDITING = 'EDITING',
  RENDERING = 'RENDERING',
  GENERAL = 'GENERAL',
}

export interface BuildComponent {
  componentId: string;
  cantidad: number;
  posicion?: string;
  obligatorio: boolean;
}

export interface PreconfiguredBuild {
  id: string;
  nombre: string;
  slug: string;
  descripcion: string | null;
  categoria: BuildCategory;
  casoUso: UseCase[];
  puntuacionGlobal: number | null;
  precioTotal: number | null;
  pros: string[];
  contras: string[];
  componentes: BuildComponent[];
  rendimiento?: any;
  configuracion?: any;
}
