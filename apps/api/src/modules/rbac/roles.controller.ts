import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto } from './dto';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';

@ApiTags('RBAC')
@ApiBearerAuth('access-token')
@Controller({ path: 'roles', version: '1' })
export class RolesController {
  constructor(private readonly svc: RolesService) {}

  @Get()
  @RequirePermissions('role:read')
  @ApiOperation({ summary: 'List all roles (cursor-paginated)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  findAll(@CurrentUser() u: AuthPrincipal, @Query() query: Record<string, string>) {
    return this.svc.findAll(u.tenantId, query);
  }

  // Registered before `:id` so "matrix" isn't parsed as a role id.
  @Get('matrix')
  @RequirePermissions('role:read')
  @ApiOperation({ summary: 'Permission matrix — real roles × real permissions, grouped by resource' })
  matrix(@CurrentUser() u: AuthPrincipal) {
    return this.svc.matrix(u.tenantId);
  }

  @Get(':id')
  @RequirePermissions('role:read')
  @ApiOperation({ summary: 'Fetch a single role by ID' })
  findOne(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.findOne(u.tenantId, id);
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('role:create')
  @ApiOperation({ summary: 'Create a custom role' })
  create(@CurrentUser() u: AuthPrincipal, @Body() dto: CreateRoleDto) {
    return this.svc.create(u.tenantId, u.userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('role:update')
  @ApiOperation({ summary: 'Rename a role or replace its permission set' })
  update(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.svc.update(u.tenantId, id, u.userId, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('role:delete')
  @ApiOperation({ summary: 'Soft-delete a custom role. System roles return 409.' })
  @ApiQuery({ name: 'version', required: true, type: Number, description: 'Optimistic lock version' })
  remove(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('version', ParseIntPipe) version: number,
  ) {
    return this.svc.remove(u.tenantId, id, u.userId, version);
  }
}
