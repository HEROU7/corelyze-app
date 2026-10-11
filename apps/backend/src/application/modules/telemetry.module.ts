import { Module } from '@nestjs/common';
import { TelemetryController } from '../../infrastructure/http/controllers/telemetry.controller';
import { TelemetryService } from '../../infrastructure/telemetry/telemetry.service';

@Module({
  controllers: [TelemetryController],
  providers: [TelemetryService],
  exports: [TelemetryService],
})
export class TelemetryModule {}