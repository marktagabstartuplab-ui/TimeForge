import { Module } from '@nestjs/common';
import { GrievancesController } from './grievances.controller';
import { GrievancesService } from './grievances.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [GrievancesController],
  providers: [GrievancesService],
  exports: [GrievancesService],
})
export class GrievancesModule {}
