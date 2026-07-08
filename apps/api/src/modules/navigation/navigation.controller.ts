import { Controller, Get } from '@nestjs/common';
import { NavigationService, SidebarResponse } from './navigation.service';
import { CurrentUser, AuthPrincipal } from '../../common/decorators';

@Controller({ path: 'navigation', version: '1' })
export class NavigationController {
  constructor(private readonly svc: NavigationService) {}

  /**
   * Returns the authenticated user's sidebar navigation payload:
   * workspace context, organization info, user summary, and an
   * RBAC-filtered menu with live badge counts.
   *
   * Protected by the global JwtAuthGuard — no extra permission needed
   * since every user receives only the items their roles grant.
   */
  @Get('sidebar')
  getSidebar(@CurrentUser() user: AuthPrincipal): Promise<SidebarResponse> {
    return this.svc.getSidebar(user);
  }
}
