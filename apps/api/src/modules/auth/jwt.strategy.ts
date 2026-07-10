import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { RbacService } from '../rbac/rbac.service';
import { AuthPrincipal } from '../../common/decorators';

interface JwtPayload {
  sub: string;
  tid: string;
  oid: string;
  roles: string[];
  fid?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly rbac: RbacService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<{ accessSecret: string }>('jwt')!.accessSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthPrincipal> {
    const roles = payload.roles ?? [];
    const permissions = await this.rbac.resolvePermissions(payload.tid, roles);
    return {
      userId: payload.sub,
      tenantId: payload.tid,
      organizationId: payload.oid,
      roles,
      permissions,
      sessionFamilyId: payload.fid,
    };
  }
}
