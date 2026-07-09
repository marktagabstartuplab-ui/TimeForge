import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WorkCategoriesService } from './work-categories.service';
import { CreateWorkCategoryDto, UpdateWorkCategoryDto } from './dto';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';

@ApiTags('Work Categories')
@ApiBearerAuth()
@Controller({ path: 'work-categories', version: '1' })
export class WorkCategoriesController {
  constructor(private readonly svc: WorkCategoriesService) {}

  @Get()
  @RequirePermissions('work_category:read')
  findAll(@CurrentUser() u: AuthPrincipal, @Query() query: Record<string, string>) {
    return this.svc.findAll(u.tenantId, u.organizationId, query);
  }

  @Get(':id')
  @RequirePermissions('work_category:read')
  findOne(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.findOne(u.tenantId, u.organizationId, id);
  }

  @Post()
  @RequirePermissions('work_category:create')
  create(@CurrentUser() u: AuthPrincipal, @Body() dto: CreateWorkCategoryDto) {
    return this.svc.create(u.tenantId, u.organizationId, u.userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('work_category:update')
  update(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWorkCategoryDto) {
    return this.svc.update(u.tenantId, u.organizationId, id, u.userId, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('work_category:delete')
  remove(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('version', ParseIntPipe) version: number) {
    return this.svc.remove(u.tenantId, u.organizationId, id, u.userId, version);
  }
}
