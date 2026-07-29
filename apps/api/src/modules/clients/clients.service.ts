import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPage, decodeCursor, ListQuery, PageResult } from '../../common/crud/crud.service';
import { CreateClientDto, UpdateClientDto } from './dto';
import { Client } from '@prisma/client';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, orgId: string, query: ListQuery): Promise<PageResult<Client>> {
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const nameWhere = query.q ? { name: { contains: String(query.q), mode: 'insensitive' as const } } : {};
    const items = await this.prisma.client.findMany({
      where: { tenantId, organizationId: orgId, deletedAt: null, ...nameWhere },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return buildPage(items, limit);
  }

  async findOne(tenantId: string, orgId: string, id: string): Promise<Client> {
    const item = await this.prisma.client.findFirst({ where: { id, tenantId, organizationId: orgId, deletedAt: null } });
    if (!item) throw new NotFoundException('Client not found');
    return item;
  }

  async create(tenantId: string, orgId: string, actorId: string, dto: CreateClientDto): Promise<Client> {
    try {
      return await this.prisma.client.create({
        data: { tenantId, organizationId: orgId, ...dto, createdBy: actorId, updatedBy: actorId },
      });
    } catch (err: unknown) { handleP2002(err); }
  }

  async update(tenantId: string, orgId: string, id: string, actorId: string, dto: UpdateClientDto): Promise<Client> {
    const existing = await this.findOne(tenantId, orgId, id);
    if (existing.version !== dto.version) throw new ConflictException('Version mismatch');
    const { version, ...rest } = dto;
    try {
      return await this.prisma.client.update({ where: { id }, data: { ...rest, updatedBy: actorId, version: { increment: 1 } } });
    } catch (err: unknown) { handleP2002(err); }
  }

  async remove(tenantId: string, orgId: string, id: string, actorId: string, version: number): Promise<void> {
    const existing = await this.findOne(tenantId, orgId, id);
    if (existing.version !== version) throw new ConflictException('Version mismatch');
    await this.prisma.client.update({ where: { id }, data: { deletedAt: new Date(), updatedBy: actorId, version: { increment: 1 } } });
  }
}

function handleP2002(err: unknown): never {
  const e = err as { code?: string };
  if (e?.code === 'P2002') throw new ConflictException('A client with this name already exists');
  throw err;
}
