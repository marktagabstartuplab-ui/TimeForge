import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { NotificationCategory, NotificationPriority } from '@prisma/client';

export type NotificationSort = 'newest' | 'oldest' | 'priority' | 'unread';

/**
 * Query booleans arrive as the strings "true"/"false". With enableImplicitConversion on,
 * class-transformer coerces via Boolean(value) *before* this runs, turning "false" into
 * true, so read the untransformed raw value off `obj` instead of the mangled `value`.
 */
const toBoolean = ({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
  const raw = obj[key];
  return typeof raw === 'string' ? raw === 'true' : raw;
};

export class ListNotificationsQueryDto {
  @IsOptional()
  @IsEnum(NotificationCategory)
  category?: NotificationCategory;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  unreadOnly?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  archived?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(['newest', 'oldest', 'priority', 'unread'])
  sortBy?: NotificationSort;

  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  pageSize?: number;
}

export class CreateAnnouncementDto {
  @IsString()
  title!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  actionUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  actionLabel?: string;
}
