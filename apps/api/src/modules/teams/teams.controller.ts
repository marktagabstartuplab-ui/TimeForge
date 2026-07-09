import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TeamsService } from './teams.service';
import { CreateTeamDto, UpdateTeamDto } from './dto';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';

@ApiTags('Teams')
@ApiBearerAuth()
@Controller({ path: 'teams', version: '1' })
export class TeamsController {
  constructor(private readonly svc: TeamsService) {}

  @Get()
  @RequirePermissions('team:read')
  findAll(@CurrentUser() u: AuthPrincipal, @Query() query: Record<string, string>) {
    return this.svc.findAll(u.tenantId, u.organizationId, query);
  }

  @Get(':id')
  @RequirePermissions('team:read')
  findOne(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.findOne(u.tenantId, u.organizationId, id);
  }

  @Post()
  @RequirePermissions('team:create')
  create(@CurrentUser() u: AuthPrincipal, @Body() dto: CreateTeamDto) {
    return this.svc.create(u.tenantId, u.organizationId, u.userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('team:update')
  update(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTeamDto) {
    return this.svc.update(u.tenantId, u.organizationId, id, u.userId, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('team:delete')
  remove(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('version', ParseIntPipe) version: number) {
    return this.svc.remove(u.tenantId, u.organizationId, id, u.userId, version);
  }
}
