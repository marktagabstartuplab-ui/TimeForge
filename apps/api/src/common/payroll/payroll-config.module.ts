import { Global, Module } from '@nestjs/common';
import { OvertimeRateService } from './overtime-rate.service';

/**
 * Global module exposing the organization's payroll rate configuration so
 * payroll and reporting can price overtime from the same source. Mirrors the
 * global PrismaModule/TimeModule pattern.
 */
@Global()
@Module({
  providers: [OvertimeRateService],
  exports: [OvertimeRateService],
})
export class PayrollConfigModule {}
