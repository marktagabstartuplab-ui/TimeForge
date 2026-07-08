import { Module } from '@nestjs/common';
import { ScrumController } from './scrum.controller';
import { ScrumDashboardController } from './scrum-dashboard.controller';
import { ScrumService } from './scrum.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [ScrumController, ScrumDashboardController],
  providers: [ScrumService],
  exports: [ScrumService],
})
export class ScrumModule {}
