import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './infrastructure/database/prisma/prisma.module';
import { ComponentModule } from './application/modules/component.module';
import { BuildModule } from './application/modules/build.module';
import { CategoryModule } from './application/modules/category.module';
import { MarcaModule } from './application/modules/marca.module';
import { ValidationModule } from './application/modules/validation.module';
import { HardwareModule } from './application/modules/hardware.module';
import { TelemetryModule } from './application/modules/telemetry.module';
import { SyncModule } from './application/modules/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // Caché en memoria de NestJS: sin Redis ni servicios externos.
    CacheModule.register({
      isGlobal: true,
      ttl: 30_000,
      max: 200,
    }),
    PrismaModule,
    ComponentModule,
    BuildModule,
    CategoryModule,
    MarcaModule,
    ValidationModule,
    HardwareModule,
    TelemetryModule,
    SyncModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
