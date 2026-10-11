export interface CreateCustomBuildInput {
  nombre: string;
  descripcion?: string;
  categoria?: string;
  casoUso?: string[];
  pros?: string[];
  contras?: string[];
  especificaciones?: Record<string, unknown>;
  componentIds: string[];
}

export interface IBuildRepository {
  findAll(filters?: any): Promise<any[]>;
  findById(id: string): Promise<any>;
  findBySlug(slug: string): Promise<any>;
  findFeatured(): Promise<any[]>;
  findByCategory(category: string): Promise<any[]>;
  findByUseCase(useCase: string): Promise<any[]>;
  create(data: any): Promise<any>;
  createCustom(input: CreateCustomBuildInput): Promise<any>;
  replaceComponents(id: string, componentIds: string[]): Promise<any>;
  update(id: string, data: any): Promise<any>;
  delete(id: string): Promise<any>;
}
