import { Module } from '@nestjs/common';
import { EmployeeRelationsController } from './employee-relations.controller';
import { EmployeeRelationsService } from './employee-relations.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [EmployeeRelationsController],
  providers: [EmployeeRelationsService],
  exports: [EmployeeRelationsService],
})
export class EmployeeRelationsModule {}
