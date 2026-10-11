export interface IComponentRepository {
  findAll(filters?: any): Promise<any[]>;
  findById(id: string): Promise<any>;
  findBySlug(slug: string): Promise<any>;
  findByCategory(categoryId: string): Promise<any[]>;
  search(query: string): Promise<any[]>;
  create(data: any): Promise<any>;
  update(id: string, data: any): Promise<any>;
  delete(id: string): Promise<any>;
}
