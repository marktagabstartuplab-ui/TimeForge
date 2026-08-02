import { Module } from '@nestjs/common';
import { ShiftLimitsController } from './shift-limits.controller';
import { ShiftLimitsService } from './shift-limits.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [ShiftLimitsController],
  providers: [ShiftLimitsService],
  exports: [ShiftLimitsService],
})
export class ShiftLimitsModule {}
