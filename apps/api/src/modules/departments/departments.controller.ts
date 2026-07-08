import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';

@Controller({ path: 'departments', version: '1' })
export class DepartmentsController {
  constructor(private readonly svc: DepartmentsService) {}

  @Get()
  @RequirePermissions('department:read')
  findAll(@CurrentUser() u: AuthPrincipal, @Query() query: Record<string, string>) {
    return this.svc.findAll(u.tenantId, u.organizationId, query);
  }

  @Get(':id')
  @RequirePermissions('department:read')
  findOne(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.findOne(u.tenantId, u.organizationId, id);
  }

  @Post()
  @RequirePermissions('department:create')
  create(@CurrentUser() u: AuthPrincipal, @Body() dto: CreateDepartmentDto) {
    return this.svc.create(u.tenantId, u.organizationId, u.userId, dto);
  }

  // No decorator: department:update (Admin/HR, any department) vs department:update_own
  // (Supervisor, only their assigned department) is resolved inside the service.
  @Patch(':id')
  update(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDepartmentDto) {
    return this.svc.update(u, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('department:delete')
  remove(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('version', ParseIntPipe) version: number) {
    return this.svc.remove(u.tenantId, u.organizationId, id, u.userId, version);
  }
}
