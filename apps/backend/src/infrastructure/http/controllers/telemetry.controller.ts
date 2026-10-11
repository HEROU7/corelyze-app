import { Controller, Get, Logger, MessageEvent, Query, Sse } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Observable, timer, exhaustMap, map, catchError, of, from } from 'rxjs';
import { TelemetryService } from '../../telemetry/telemetry.service';

const INTERVAL_MIN = 500;
const INTERVAL_MAX = 5000;
const INTERVAL_DEFAULT = 1000;

function clampInterval(value: number): number {
  if (!Number.isFinite(value)) return INTERVAL_DEFAULT;
  return Math.min(INTERVAL_MAX, Math.max(INTERVAL_MIN, Math.round(value)));
}

@ApiTags('telemetria')
@Controller('telemetry')
export class TelemetryController {
  private readonly logger = new Logger(TelemetryController.name);

  constructor(private readonly telemetryService: TelemetryService) {}

  @Get('snapshot')
  @ApiOperation({ summary: 'Obtener una muestra de telemetría del sistema local' })
  async snapshot() {
    return { data: await this.telemetryService.getSnapshot() };
  }

  @Sse('stream')
  @ApiOperation({ summary: 'Flujo continuo en tiempo real (SSE) de telemetría del sistema' })
  @ApiQuery({
    name: 'interval',
    required: false,
    description: 'Intervalo entre muestras en ms (500–5000).',
    schema: { type: 'number', default: 1000 },
  })
  stream(@Query('interval') intervalRaw?: string): Observable<MessageEvent> {
    const tick = clampInterval(Number(intervalRaw ?? INTERVAL_DEFAULT));

    return timer(0, tick).pipe(
      // exhaustMap evita que un tick cancele la muestra en curso. La captura
      // tarda más que el intervalo, por lo que switchMap nunca llegaba a emitir.
      exhaustMap(() =>
        from(this.telemetryService.getSnapshot()).pipe(
          catchError((error) => {
            this.logger.warn(`Muestra de telemetría fallida: ${error instanceof Error ? error.message : error}`);
            return of(this.telemetryService.getFallbackSnapshot());
          }),
        ),
      ),
      map((snapshot) => ({ data: JSON.stringify(snapshot) }) as MessageEvent),
    );
  }
}