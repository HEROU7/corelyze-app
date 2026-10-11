import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';

/**
 * Elemento de catálogo remoto. Solo `sku` es obligatorio: el `sku` es la clave
 * única que usamos para localizar el registro local en SQLite.
 */
export interface RemoteCatalogItem {
  sku: string;
  precio?: number | string | null;
}

/**
 * Payload ligero que espera el servicio. Se admite tanto la forma directa
 * `{ version, components }` como la envuelta `{ data: { version, components } }`.
 */
export interface RemoteCatalogPayload {
  version?: string;
  components: RemoteCatalogItem[];
}

/**
 * SyncService (Catálogo + precios estimados de mercado).
 *
 * Se ejecuta de forma silenciosa en segundo plano al arrancar la aplicación:
 *  - Hace un `HTTP GET` ligero a una fuente centralizada (`CATALOG_SYNC_URL`).
 *  - Si responde correctamente, actualiza de forma transparente los precios
 *    estimados de los componentes en la base SQLite local.
 *  - Si no hay internet o el servidor no responde, se omite en silencio y la
 *    app sigue operando con la base local, sin errores ni bloqueos.
 *
 * El arranque NUNCA se bloquea esperando la red: la sincronización se lanza en
 * un timer `unref()` (segundo plano) y todos los fallos se tragan.
 */
@Injectable()
export class CatalogSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CatalogSyncService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap(): void {
    this.scheduleBackgroundSync();
  }

  /** Lanza la sincronización en segundo plano sin bloquear el arranque. */
  private scheduleBackgroundSync(): void {
    // Pequeño retardo para asegurar que el servidor HTTP ya está escuchando.
    const timer: NodeJS.Timeout = setTimeout(() => {
      void this.run().catch(() => undefined);
    }, 1500);
    // `unref()` evita que este timer retenga el proceso (arranque/teardown limpios).
    timer.unref();
  }

  /**
   * Ejecuta una sincronización. Es público y no lanza excepciones: devuelve un
   * resumen para poder testearlo de forma aislada.
   */
  async run(): Promise<{ updated: number; skipped: boolean }> {
    const url = this.resolveUrl();
    if (!url) {
      this.logger.debug('Sincronización remota deshabilitada (CATALOG_SYNC_URL no definido).');
      return { updated: 0, skipped: true };
    }
    if (this.running) {
      return { updated: 0, skipped: true };
    }

    this.running = true;
    try {
      const payload = await this.fetchRemoteCatalog(url);
      if (!payload) {
        this.logger.debug('Sincronización omitida: sin catálogo remoto disponible.');
        return { updated: 0, skipped: true };
      }

      const updated = await this.applyRemoteCatalog(payload);
      if (updated > 0) {
        this.logger.log(
          `🔄 Catálogo sincronizado: ${updated} precio(s) estimado(s) actualizado(s)` +
            (payload.version ? ` (versión ${payload.version}).` : '.'),
        );
      } else {
        this.logger.debug('Sincronización completada sin cambios en el catálogo.');
      }
      return { updated, skipped: false };
    } catch (error) {
      // Fallback offline silencioso: nunca interrumpimos la app.
      this.logger.debug(
        `Sincronización remota omitida (offline): ${error instanceof Error ? error.message : String(error)}`,
      );
      return { updated: 0, skipped: true };
    } finally {
      this.running = false;
    }
  }

  private resolveUrl(): string | null {
    const url = process.env.CATALOG_SYNC_URL?.trim();
    return url ? url : null;
  }

  private resolveTimeoutMs(): number {
    const parsed = Number(process.env.CATALOG_SYNC_TIMEOUT_MS);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
  }

  /** `HTTP GET` ligero con timeout mediante `AbortController`. */
  private async fetchRemoteCatalog(url: string): Promise<RemoteCatalogPayload | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.resolveTimeoutMs());
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const raw: unknown = await response.json();
      return this.normalizePayload(raw);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Normaliza distintas formas de respuesta a un payload tipado y seguro. */
  private normalizePayload(raw: unknown): RemoteCatalogPayload | null {
    if (raw === null || raw === undefined) return null;

    const root = raw as Record<string, unknown>;
    const container =
      (root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : root) ??
      root;

    const itemsSource = Array.isArray(raw)
      ? (raw as unknown[])
      : Array.isArray(container.components)
        ? (container.components as unknown[])
        : [];

    const components: RemoteCatalogItem[] = [];
    for (const entry of itemsSource) {
      if (!entry || typeof entry !== 'object') continue;
      const record = entry as Record<string, unknown>;
      const sku = typeof record.sku === 'string' ? record.sku.trim() : '';
      if (!sku) continue;
      const precio = (record.precio ?? record.price ?? null) as number | string | null;
      components.push({ sku, precio });
    }

    if (components.length === 0) return null;
    const version = typeof root.version === 'string' ? root.version : undefined;
    return { version, components };
  }

  /**
   * Aplica los precios recibidos sobre los registros locales. Es idempotente y
   * tolerante a errores por elemento (un sku inexistente simplemente se ignora).
   */
  async applyRemoteCatalog(payload: RemoteCatalogPayload): Promise<number> {
    let updated = 0;
    for (const item of payload.components) {
      const precio = this.toNumber(item.precio);
      if (precio === null) continue;
      const result = await this.prisma.componente.updateMany({
        where: { sku: item.sku },
        data: { precio },
      });
      updated += result.count;
    }
    if (updated > 0) {
      await this.recordSyncState(payload.version);
    }
    return updated;
  }

  private toNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  /** Registra la última sincronización (best-effort: nunca rompe la app). */
  private async recordSyncState(version?: string): Promise<void> {
    try {
      const now = new Date().toISOString();
      await this.prisma.configuracionSistema.upsert({
        where: { clave: 'sync.lastSyncAt' },
        update: { valor: now },
        create: {
          clave: 'sync.lastSyncAt',
          valor: now,
          descripcion: 'Fecha/hora de la última sincronización de catálogo',
        },
      });
      if (version) {
        await this.prisma.configuracionSistema.upsert({
          where: { clave: 'sync.lastVersion' },
          update: { valor: version },
          create: {
            clave: 'sync.lastVersion',
            valor: version,
            descripcion: 'Versión del catálogo remoto sincronizado',
          },
        });
      }
    } catch {
      // El registro de estado es opcional.
    }
  }
}
