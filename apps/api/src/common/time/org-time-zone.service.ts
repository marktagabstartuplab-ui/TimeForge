import { Injectable } from '@nestjs/common';
import { DEFAULT_TIME_ZONE } from '@timeforge/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuthPrincipal } from '../decorators';

/** Organization timezones change approximately never; re-read occasionally anyway. */
const TTL_MS = 5 * 60_000;

/**
 * Resolves the timezone an organization's calendar days are measured in.
 *
 * Every "today", day-bucketing, and day-boundary calculation should go through
 * here rather than assuming UTC — see `@timeforge/shared/timezone`. Falls back
 * to {@link DEFAULT_TIME_ZONE} when an organization has none configured.
 */
@Injectable()
export class OrgTimeZoneService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly cache = new Map<string, { timeZone: string; expiresAt: number }>();

  async forPrincipal(p: AuthPrincipal): Promise<string> {
    return this.forOrganization(p.tenantId, p.organizationId);
  }

  async forOrganization(tenantId: string, organizationId: string): Promise<string> {
    const key = `${tenantId}:${organizationId}`;
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.timeZone;

    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, tenantId },
      select: { timezone: true },
    });
    const timeZone = org?.timezone || DEFAULT_TIME_ZONE;
    this.cache.set(key, { timeZone, expiresAt: Date.now() + TTL_MS });
    return timeZone;
  }
}
