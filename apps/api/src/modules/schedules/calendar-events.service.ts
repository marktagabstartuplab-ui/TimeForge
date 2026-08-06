import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthPrincipal } from '../../common/decorators';
import {
  CalendarEventQuery,
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
} from './calendar-events.dto';

@Injectable()
export class CalendarEventsService {
  constructor(private readonly prisma: PrismaService) {}

  /** List the calling employee's own events for a date range. */
  async findAll(p: AuthPrincipal, query: CalendarEventQuery) {
    const where: Record<string, unknown> = {
      tenantId: p.tenantId,
      organizationId: p.organizationId,
      userId: p.userId,
      deletedAt: null,
    };
    if (query.from) {
      where['eventDate'] = { ...(where['eventDate'] as object ?? {}), gte: query.from };
    }
    if (query.to) {
      where['eventDate'] = { ...(where['eventDate'] as object ?? {}), lte: query.to };
    }
    return this.prisma.employeeCalendarEvent.findMany({
      where: where as any,
      orderBy: [{ eventDate: 'asc' }, { startTime: 'asc' }],
    });
  }

  /** Create a personal event scoped to the calling employee. */
  async create(p: AuthPrincipal, dto: CreateCalendarEventDto) {
    return this.prisma.employeeCalendarEvent.create({
      data: {
        tenantId: p.tenantId,
        organizationId: p.organizationId,
        userId: p.userId,
        title: dto.title,
        eventType: dto.eventType,
        eventDate: dto.eventDate,
        startTime: dto.startTime ? new Date(dto.startTime) : null,
        endTime: dto.endTime ? new Date(dto.endTime) : null,
        notes: dto.notes ?? null,
        createdBy: p.userId,
        updatedBy: p.userId,
      },
    });
  }

  /** Update a personal event — caller must own it. */
  async update(p: AuthPrincipal, id: string, dto: UpdateCalendarEventDto) {
    const event = await this.prisma.employeeCalendarEvent.findFirst({
      where: { id, tenantId: p.tenantId, deletedAt: null },
    });
    if (!event) throw new NotFoundException('Calendar event not found');
    if (event.userId !== p.userId)
      throw new ForbiddenException('You can only edit your own calendar events');
    if (event.version !== dto.version)
      throw new ConflictException('Stale version — refresh and retry');

    return this.prisma.employeeCalendarEvent.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.eventType !== undefined && { eventType: dto.eventType }),
        ...(dto.eventDate !== undefined && { eventDate: dto.eventDate }),
        ...(dto.startTime !== undefined && { startTime: dto.startTime ? new Date(dto.startTime) : null }),
        ...(dto.endTime !== undefined && { endTime: dto.endTime ? new Date(dto.endTime) : null }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        updatedBy: p.userId,
        version: { increment: 1 },
      },
    });
  }

  /** Soft-delete a personal event — caller must own it. */
  async remove(p: AuthPrincipal, id: string, version: number) {
    const event = await this.prisma.employeeCalendarEvent.findFirst({
      where: { id, tenantId: p.tenantId, deletedAt: null },
    });
    if (!event) throw new NotFoundException('Calendar event not found');
    if (event.userId !== p.userId)
      throw new ForbiddenException('You can only delete your own calendar events');
    if (event.version !== version)
      throw new ConflictException('Stale version — refresh and retry');

    await this.prisma.employeeCalendarEvent.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: p.userId },
    });
  }
}
