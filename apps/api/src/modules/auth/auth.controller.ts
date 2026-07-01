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
      sameSite: 'strict',
      maxAge: refreshTtl * 1000,
      path: REFRESH_PATH,
    });
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.email, dto.password, req.ip);
    this.setRefreshCookie(res, result.refreshToken);
    return {
      accessToken: result.accessToken,
      tokenType: 'Bearer',
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE] ?? (req.body as { refreshToken?: string })?.refreshToken;
    const tokens = await this.auth.refresh(raw, req.ip);
    this.setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, tokenType: 'Bearer', expiresIn: tokens.expiresIn };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(202)
  async forgot(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.email);
    return { status: 'ok' };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  async reset(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.password);
    return { status: 'ok' };
  }

  @Public()
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
  @Get('departments')
  async departments() {
    return this.auth.departmentsForRegistration();
  }
}
