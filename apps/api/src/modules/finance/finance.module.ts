import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'finance-analytics' }),
  ],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
