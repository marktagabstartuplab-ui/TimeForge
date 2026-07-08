import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PerformanceController } from './performance.controller';
import { PerformanceService } from './performance.service';
import { InfraModule } from '../../infra/infra.module';

@Module({
  imports: [
    InfraModule,
    BullModule.registerQueue({ name: 'performance-export' }),
  ],
  controllers: [PerformanceController],
  providers: [PerformanceService],
  exports: [PerformanceService],
})
export class PerformanceModule {}
