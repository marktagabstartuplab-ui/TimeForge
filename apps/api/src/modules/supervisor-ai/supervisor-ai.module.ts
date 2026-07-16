import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SupervisorAiController } from './supervisor-ai.controller';
import { SupervisorAiService } from './supervisor-ai.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'performance-export' }),
    StorageModule,
  ],
  controllers: [SupervisorAiController],
  providers: [SupervisorAiService],
})
export class SupervisorAiModule {}
