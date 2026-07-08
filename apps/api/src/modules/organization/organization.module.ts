import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OrganizationController } from './organization.controller';
import { OrganizationService, ORGANIZATION_EXPORT_QUEUE } from './organization.service';
import { DepartmentsModule } from '../departments/departments.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [
    DepartmentsModule,
    ProjectsModule,
    BullModule.registerQueue({ name: ORGANIZATION_EXPORT_QUEUE }),
  ],
  controllers: [OrganizationController],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
