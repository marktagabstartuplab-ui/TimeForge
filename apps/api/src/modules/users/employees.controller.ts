import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { BulkImportEmployeesDto, CreateUserDto, EmployeesExportQuery, UpdateUserDto, UsersListQuery } from './dto';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';

/**
 * Employee Management — the Admin-facing directory (search/filter/invite/import/
 * export/edit). Distinct from UsersController (`/users`), which also serves the
 * self-service `/users/me/*` routes; this wraps the exact same UsersService so
 * every RBAC/audit/soft-delete rule stays enforced in one place.
 */
@ApiTags('Employee Management')
@ApiBearerAuth('access-token')
@Controller({ path: 'employees', version: '1' })
export class EmployeesController {
  constructor(private readonly svc: UsersService) {}

  @Get()
  @RequirePermissions('user:read')
  @ApiOperation({ summary: 'List employees — cursor-paginated, full-text search, department/role/status filters' })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'departmentId', required: false, type: String })
  @ApiQuery({ name: 'teamId', required: false, type: String })
  @ApiQuery({ name: 'role', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  findAll(@CurrentUser() u: AuthPrincipal, @Query() query: UsersListQuery) {
    return this.svc.findAll(u, query);
  }

  // Registered before `:id` so "export" isn't parsed as an employee id.
  @Get('export')
  @RequirePermissions('user:read')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="employees.csv"')
  @ApiOperation({ summary: 'CSV export of the employee directory under the same filters as GET /employees' })
  async export(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: EmployeesExportQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csv = await this.svc.exportCsv(u, query);
    res.send(csv);
  }

  // Registered before `:id` so "export/pdf" isn't parsed as an employee id.
  @Get('export/pdf')
  @RequirePermissions('user:read')
  @ApiOperation({ summary: 'PDF export of the employee directory under the same filters as GET /employees' })
  async exportPdf(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: EmployeesExportQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, contentType, filename } = await this.svc.exportPdf(u, query);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get(':id')
  @RequirePermissions('user:read')
  @ApiOperation({ summary: 'Fetch a single employee profile' })
  findOne(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.findOne(u, id);
  }

  @Patch(':id')
  @RequirePermissions('user:update')
  @ApiOperation({ summary: 'Edit an employee (name, phone, department, role assignment fields, status)' })
  update(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.svc.update(u, id, dto);
  }

  @Post('invite')
  @RequirePermissions('user:create')
  @ApiOperation({ summary: 'Create an employee and email them a real invitation' })
  invite(@CurrentUser() u: AuthPrincipal, @Body() dto: CreateUserDto) {
    return this.svc.invite(u, dto);
  }

  @Post('import')
  @RequirePermissions('user:create')
  @ApiOperation({ summary: 'Bulk-create employees (max 100). Per-item ok/error result.' })
  import(@CurrentUser() u: AuthPrincipal, @Body() dto: BulkImportEmployeesDto) {
    return this.svc.bulkImport(u, dto);
  }
}
