import { Module } from '@nestjs/common';
import { RecurringIssuesController } from './recurring-issues.controller';
import { RecurringIssuesService } from './recurring-issues.service';

@Module({
  controllers: [RecurringIssuesController],
  providers: [RecurringIssuesService],
})
export class RecurringIssuesModule {}
