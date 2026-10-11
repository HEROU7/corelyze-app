import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const databaseUrl = process.env.DATABASE_URL || 'file:../data/corelyze.sqlite';
    super({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('✅ SQLite conectado correctamente (base de datos local, sin servicios externos)');
    } catch (error) {
      this.logger.warn(
        `⚠️  No se pudo abrir la base de datos SQLite: ${error instanceof Error ? error.message : error}. La API iniciará sin BD.`,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
