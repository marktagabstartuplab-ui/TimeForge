import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ShiftLimitsService } from './shift-limits.service';
import { DecideOverrideDto, RequestOverrideDto, UpdateShiftConfigDto, ViolationQueryDto } from './dto';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';

@ApiTags('Shift Limits')
@ApiBearerAuth()
@Controller({ path: 'shift-limits', version: '1' })
export class ShiftLimitsController {
  constructor(private readonly svc: ShiftLimitsService) {}

  @Get('config')
  @RequirePermissions('shift_config:read')
  getConfig(@CurrentUser() u: AuthPrincipal) {
    return this.svc.getConfig(u);
  }

  @Patch('config')
  @RequirePermissions('shift_config:update')
  updateConfig(@CurrentUser() u: AuthPrincipal, @Body() dto: UpdateShiftConfigDto) {
    return this.svc.updateConfig(u, dto);
  }

  @Post('override-requests')
  @RequirePermissions('shift_override:request')
  requestOverride(@CurrentUser() u: AuthPrincipal, @Body() dto: RequestOverrideDto) {
    return this.svc.requestOverride(u, dto);
  }

  @Post('override-requests/:id/decision')
  @HttpCode(200)
  @RequirePermissions('shift_override:approve')
  decideOverride(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideOverrideDto,
  ) {
    return this.svc.decideOverride(u, id, dto);
  }

  /**
   * Gated on the baseline read permission only — the team-vs-org scoping (and the
   * hard deny for anyone with neither) happens in the service, because
   * PermissionsGuard ANDs its arguments and cannot express "team OR org".
   */
  @Get('violations')
  @RequirePermissions('shift_config:read')
  listViolations(@CurrentUser() u: AuthPrincipal, @Query() query: ViolationQueryDto) {
    return this.svc.listViolations(u, query);
  }
}
