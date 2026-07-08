import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { InfraModule } from '../../infra/infra.module';

@Module({
  imports: [
    InfraModule,
    BullModule.registerQueue({ name: 'reports-export' }),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
