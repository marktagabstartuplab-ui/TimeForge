import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { EmployeesController } from './employees.controller';
import { UsersService } from './users.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [UsersController, EmployeesController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
