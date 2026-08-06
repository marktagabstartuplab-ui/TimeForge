import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { EmployeeRelationsService } from './employee-relations.service';
import {
  ApproveClearanceItemDto,
  CreateGrievanceDto,
  CreateNteDto,
  InitiateClearanceDto,
  RespondNteDto,
} from './dto';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';

@Controller({ path: 'employee-relations', version: '1' })
export class EmployeeRelationsController {
  constructor(private readonly svc: EmployeeRelationsService) {}

  // ── NTE (Discipline Memos) ───────────────────────────────────────────────────

  @Post('nte')
  @RequirePermissions('discipline:create')
  createNte(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateNteDto) {
    return this.svc.createNte(user, dto);
  }

  @Get('nte')
  @RequirePermissions('discipline:read_self')
  findNtes(@CurrentUser() user: AuthPrincipal, @Query('userId') userId?: string) {
    return this.svc.findNtesForUser(user, userId);
  }

  @Patch('nte/:id/respond')
  @RequirePermissions('discipline:respond')
  respondNte(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondNteDto,
  ) {
    return this.svc.respondNte(user, id, dto);
  }

  // ── Grievances ───────────────────────────────────────────────────────────────

  @Post('grievances')
  @RequirePermissions('grievance:create')
  createGrievance(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateGrievanceDto) {
    return this.svc.createGrievance(user, dto);
  }

  @Get('grievances')
  @RequirePermissions('grievance:read_org')
  findGrievances(@CurrentUser() user: AuthPrincipal) {
    return this.svc.findGrievances(user);
  }

  // ── Clearance Trackers ───────────────────────────────────────────────────────

  @Post('clearance')
  @RequirePermissions('clearance:create')
  initiateClearance(@CurrentUser() user: AuthPrincipal, @Body() dto: InitiateClearanceDto) {
    return this.svc.initiateClearance(user, dto);
  }

  @Get('clearance')
  @RequirePermissions('clearance:read_self')
  findClearances(@CurrentUser() user: AuthPrincipal, @Query('employeeId') employeeId?: string) {
    return this.svc.findClearances(user, employeeId);
  }

  @Patch('clearance/:id/items/:itemId/approve')
  @RequirePermissions('clearance:approve')
  approveClearanceItem(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: ApproveClearanceItemDto,
  ) {
    return this.svc.approveClearanceItem(user, id, itemId, dto.notes);
  }
}
