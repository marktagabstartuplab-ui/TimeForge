import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, ForgotPasswordDto, ResetPasswordDto, VerifyEmailDto, RegisterDto } from './dto';
import { Public, CurrentUser, AuthPrincipal } from '../../common/decorators';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_PATH = '/api/v1/auth';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private setRefreshCookie(res: Response, token: string): void {
    const secure = Boolean(this.config.get('cookieSecure'));
    const refreshTtl = this.config.get<{ refreshTtl: number }>('jwt')!.refreshTtl;
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure,
      // 'strict' blocks the cookie on every cross-site request, including the
      // POST /auth/refresh call itself when frontend and backend are on
      // different domains (e.g. Vercel + Railway) — 'none' is required for a
      // cross-site cookie to be sent at all, and requires `secure: true`
      // (already the case in production), which browsers enforce.
      sameSite: secure ? 'none' : 'strict',
      maxAge: refreshTtl * 1000,
      path: REFRESH_PATH,
    });
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.email, dto.password, req.ip, req.headers['user-agent']);
    this.setRefreshCookie(res, result.refreshToken);
    return {
      accessToken: result.accessToken,
      // Body copy of the refresh token — the client keeps it as a fallback for
      // when the cross-site httpOnly cookie isn't sent (e.g. Safari ITP, or a
      // frontend/backend domain split). The cookie remains the primary path;
      // tokens are rotated on every refresh and reuse is detected server-side.
      refreshToken: result.refreshToken,
      tokenType: 'Bearer',
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE] ?? (req.body as { refreshToken?: string })?.refreshToken;
    const tokens = await this.auth.refresh(raw, req.ip);
    this.setRefreshCookie(res, tokens.refreshToken);
    return {
      accessToken: tokens.accessToken,
      // Rotated token for the client's body-based fallback (see login()).
      refreshToken: tokens.refreshToken,
      tokenType: 'Bearer',
      expiresIn: tokens.expiresIn,
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(202)
  async forgot(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.email);
    return { status: 'ok' };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(200)
  async reset(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.password);
    return { status: 'ok' };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('verify-email')
  @HttpCode(200)
  async verify(@Body() dto: VerifyEmailDto) {
    await this.auth.verifyEmail(dto.token);
    return { status: 'ok' };
  }

  @Get('me')
  me(@CurrentUser() user: AuthPrincipal) {
    return user;
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post('register')
  @HttpCode(201)
  async register(@Body() dto: RegisterDto) {
    await this.auth.register(dto);
    return { status: 'pending_approval' };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('departments')
  async departments() {
    return this.auth.departmentsForRegistration();
  }
}
