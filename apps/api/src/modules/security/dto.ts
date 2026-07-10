import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { SecuritySeverity, SecurityStatus } from '@prisma/client';

export class SecurityLogsQuery {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(SecurityStatus)
  status?: SecurityStatus;

  @IsOptional()
  @IsEnum(SecuritySeverity)
  severity?: SecuritySeverity;

  @IsOptional()
  @IsString()
  timeRange?: '24h' | '7d' | '30d' | 'all';

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsString()
  cursor?: string;
}

export class SecurityExportDto {
  @IsEnum(['CSV'] as const)
  format!: 'CSV';

  @IsOptional()
  @IsUUID()
  periodId?: string;
}
