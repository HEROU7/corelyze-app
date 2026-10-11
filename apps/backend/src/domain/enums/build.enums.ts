// El conector SQLite de Prisma no soporta enums nativos, por lo que los
// representamos como uniones de strings con un objeto de valores para
// class-validator (`@IsEnum`) y Swagger, manteniendo la misma API pública.

export const BuildCategory = {
  ENTRY: 'ENTRY',
  MID_RANGE: 'MID_RANGE',
  HIGH_END: 'HIGH_END',
  ULTRA: 'ULTRA',
  CUSTOM: 'CUSTOM',
} as const;
export type BuildCategory = (typeof BuildCategory)[keyof typeof BuildCategory];

export const UseCase = {
  GAMING: 'GAMING',
  WORKSTATION: 'WORKSTATION',
  OFFICE: 'OFFICE',
  STREAMING: 'STREAMING',
  EDITING: 'EDITING',
  RENDERING: 'RENDERING',
  GENERAL: 'GENERAL',
} as const;
export type UseCase = (typeof UseCase)[keyof typeof UseCase];
