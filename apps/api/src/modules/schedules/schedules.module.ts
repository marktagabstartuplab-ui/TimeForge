import { Module } from '@nestjs/common';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { CalendarEventsController } from './calendar-events.controller';
import { CalendarEventsService } from './calendar-events.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [SchedulesController, CalendarEventsController],
  providers: [SchedulesService, CalendarEventsService],
  exports: [SchedulesService],
})
export class SchedulesModule {}

