import { Global, Module } from '@nestjs/common';
import { OrgTimeZoneService } from './org-time-zone.service';

/**
 * Global module exposing the organization timezone lookup so any feature module
 * can resolve local calendar days without re-importing it. Mirrors the global
 * PrismaModule/ScopingModule pattern.
 */
@Global()
@Module({
  providers: [OrgTimeZoneService],
  exports: [OrgTimeZoneService],
})
export class TimeModule {}
