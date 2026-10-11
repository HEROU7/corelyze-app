import { Module } from '@nestjs/common';
import { HardwareController } from '../../infrastructure/http/controllers/hardware.controller';

@Module({
  controllers: [HardwareController],
})
export class HardwareModule {}
