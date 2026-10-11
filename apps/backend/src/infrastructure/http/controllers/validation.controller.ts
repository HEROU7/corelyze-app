import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ValidateCompatibilityUseCase } from '../../../application/use-cases/compatibility/validate-compatibility.use-case';
import { AnalyzeBottlenecksUseCase } from '../../../application/use-cases/compatibility/analyze-bottlenecks.use-case';

@ApiTags('validation')
@Controller('validation')
export class ValidationController {
  constructor(
    private validateCompatibilityUseCase: ValidateCompatibilityUseCase,
    private analyzeBottlenecksUseCase: AnalyzeBottlenecksUseCase,
  ) {}

  @Post('compatibility')
  @ApiOperation({ summary: 'Validar compatibilidad entre componentes' })
  async validateCompatibility(@Body() body: { componentIds: string[] }) {
    return this.validateCompatibilityUseCase.execute(body.componentIds);
  }

  @Post('bottlenecks')
  @ApiOperation({ summary: 'Analizar cuellos de botella CPU/GPU' })
  async analyzeBottlenecks(
    @Body()
    body: {
      cpuId: string;
      gpuId: string;
      ramIds: string[];
      resolution?: '1080p' | '1440p' | '4K';
    },
  ) {
    return this.analyzeBottlenecksUseCase.execute(
      body.cpuId,
      body.gpuId,
      body.ramIds,
      body.resolution || '1080p',
    );
  }
}
