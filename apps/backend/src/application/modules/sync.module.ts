import { Module } from '@nestjs/common';
import { CatalogSyncService } from '../../infrastructure/sync/sync.service';

/**
 * Sincronización remota del catálogo en segundo plano.
 * PrismaModule es global, por lo que PrismaService está disponible sin importar.
 */
@Module({
  providers: [CatalogSyncService],
  exports: [CatalogSyncService],
})
export class SyncModule {}
