import { Injectable } from '@nestjs/common';
import { PrismaComponentRepository } from '../../../infrastructure/repositories/prisma/component.repository';

@Injectable()
export class GetComponentsUseCase {
  constructor(private componentRepository: PrismaComponentRepository) {}

  async execute(filters?: any) {
    return this.componentRepository.findAll(filters);
  }
}

@Injectable()
export class GetComponentByIdUseCase {
  constructor(private componentRepository: PrismaComponentRepository) {}

  async execute(id: string) {
    return this.componentRepository.findById(id);
  }
}

@Injectable()
export class GetComponentsByCategoryUseCase {
  constructor(private componentRepository: PrismaComponentRepository) {}

  async execute(categoryId: string) {
    return this.componentRepository.findByCategory(categoryId);
  }
}

@Injectable()
export class SearchComponentsUseCase {
  constructor(private componentRepository: PrismaComponentRepository) {}

  async execute(query: string) {
    return this.componentRepository.search(query);
  }
}
