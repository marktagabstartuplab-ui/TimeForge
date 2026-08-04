import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { GrievancesService } from './grievances.service';
import { CreateGrievanceDto, GrievanceQueryDto, UpdateGrievanceDto } from './dto';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';

@Controller({ path: 'grievances', version: '1' })
export class GrievancesController {
  constructor(private readonly svc: GrievancesService) {}

  @Post()
  @RequirePermissions('grievance:create')
  createGrievance(
    @CurrentUser() u: AuthPrincipal,
    @Body() dto: CreateGrievanceDto,
  ) {
    return this.svc.createGrievance(u, dto);
  }

  @Get('my')
  @RequirePermissions('grievance:read_self')
  findMyGrievances(
    @CurrentUser() u: AuthPrincipal,
    @Query() q: GrievanceQueryDto,
  ) {
    return this.svc.findMyGrievances(u, q);
  }

  @Get()
  @RequirePermissions('grievance:read_org')
  findAllGrievances(
    @CurrentUser() u: AuthPrincipal,
    @Query() q: GrievanceQueryDto,
  ) {
    return this.svc.findAllGrievances(u, q);
  }

  @Get(':id')
  findOneGrievance(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.findOneGrievance(u, id);
  }

  @Patch(':id')
  @RequirePermissions('grievance:update')
  updateGrievance(
    @CurrentUser() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGrievanceDto,
  ) {
    return this.svc.updateGrievance(u, id, dto);
  }
}
