import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateMeDto,
  AssignRolesDto,
  UsersListQuery,
  ChangePasswordDto,
} from './dto';
import { AuthPrincipal, CurrentUser, RequirePermissions } from '../../common/decorators';

interface UploadedMulterFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Get()
  @RequirePermissions('user:read')
  findAll(@CurrentUser() u: AuthPrincipal, @Query() query: UsersListQuery) {
    return this.svc.findAll(u, query);
  }

  @Get('me')
  @RequirePermissions('user:read_self')
  findMe(@CurrentUser() u: AuthPrincipal) {
    return this.svc.findMe(u);
  }

  @Patch('me')
  @RequirePermissions('user:read_self')
  updateMe(@CurrentUser() u: AuthPrincipal, @Body() dto: UpdateMeDto) {
    return this.svc.updateMe(u, dto);
  }

  @Patch('me/avatar')
  @RequirePermissions('user:read_self')
  @UseInterceptors(FileInterceptor('file'))
  updateAvatar(@CurrentUser() u: AuthPrincipal, @UploadedFile() file: UploadedMulterFile) {
    return this.svc.updateAvatar(u, file);
  }

  @Patch('me/password')
  @RequirePermissions('user:read_self')
  changePassword(@CurrentUser() u: AuthPrincipal, @Body() dto: ChangePasswordDto) {
    return this.svc.changePassword(u, dto);
  }

  @Get('me/sessions')
  @RequirePermissions('user:read_self')
  listSessions(@CurrentUser() u: AuthPrincipal) {
    return this.svc.listSessions(u);
  }

  @Delete('me/sessions')
  @HttpCode(204)
  @RequirePermissions('user:read_self')
  logoutOtherDevices(@CurrentUser() u: AuthPrincipal) {
    return this.svc.revokeOtherSessions(u);
  }

  @Get(':id')
  // Permission check handled in service (self vs user:read)
  findOne(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.findOne(u, id);
  }

  @Post()
  @RequirePermissions('user:create')
  create(@CurrentUser() u: AuthPrincipal, @Body() dto: CreateUserDto) {
    return this.svc.create(u, dto);
  }

  @Patch(':id')
  @RequirePermissions('user:update')
  update(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.svc.update(u, id, dto);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermissions('user:deactivate')
  deactivate(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deactivate(u, id);
  }

  @Post(':id/roles')
  @RequirePermissions('user:assign_role')
  assignRoles(@CurrentUser() u: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignRolesDto) {
    return this.svc.assignRoles(u, id, dto);
  }
}
