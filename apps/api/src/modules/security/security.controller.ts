import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { SecurityService } from './security.service';
import { SecurityLogsQuery, SecurityExportDto } from './dto';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';

@ApiTags('Security')
@ApiBearerAuth()
@Controller({ path: 'security', version: '1' })
@RequirePermissions('*') // Admins only (wildcard matches admin permissions)
export class SecurityController {
  constructor(private readonly svc: SecurityService) {}

  @Get('logs')
  async getLogs(
    @CurrentUser() u: AuthPrincipal,
    @Query() query: SecurityLogsQuery,
  ) {
    return this.svc.findLogs(u, query);
  }

  @Get('alerts')
  async getAlerts(@CurrentUser() u: AuthPrincipal) {
    return this.svc.findAlerts(u);
  }

  @Get('health')
  async getHealth(@CurrentUser() u: AuthPrincipal) {
    return this.svc.getHealth(u);
  }

  @Post('export')
  @HttpCode(200)
  async exportLogs(
    @CurrentUser() u: AuthPrincipal,
    @Body() dto: SecurityExportDto,
    @Res() res: Response,
  ) {
    const { data, filename } = await this.svc.exportLogs(u, dto);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(data);
  }
}
