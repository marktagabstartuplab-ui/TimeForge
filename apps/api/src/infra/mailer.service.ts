import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

type MailStrategy = 'edge' | 'smtp' | 'mock';

/**
 * Mailer service — sends transactional emails through one resolved strategy:
 *
 * 1. **Supabase Edge Function**: calls the `send-email` edge function deployed
 *    on the Supabase project. Requires SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
 *    here *and* its own SMTP_HOST/PORT/USER/PASS set as Supabase project
 *    secrets (`supabase secrets set ...`) — a separate store from this app's
 *    .env, which is easy to leave unconfigured and causes silent send failures.
 *
 * 2. **Direct Gmail SMTP**: uses Nodemailer with the SMTP_* variables. Requires
 *    outbound SMTP to be reachable — some hosts (e.g. Railway) block it, which
 *    makes every send fail silently.
 *
 * 3. **Console mock**: logs the email payload to stdout when nothing is
 *    configured.
 *
 * MAIL_DRIVER picks the strategy:
 *  - `auto` (default): prefer the edge function when Supabase is configured,
 *    else SMTP, else mock. This is what makes production (which has Supabase
 *    configured and blocks SMTP) route through the edge function even if
 *    SMTP_* happen to be set.
 *  - `edge` / `smtp` / `mock`: force that strategy (falls back to mock with a
 *    warning if the forced strategy isn't actually configured).
 *
 * Email send failures are always caught and logged — they must never roll back
 * the business operation that triggered them (registration, approval, etc.).
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter: nodemailer.Transporter | null = null;
  private edgeFunctionUrl: string | null = null;
  private serviceRoleKey: string | null = null;
  private readonly strategy: MailStrategy;

  constructor(private readonly config: ConfigService) {
    const supabase = this.config.get<{ url: string; serviceRoleKey: string }>('supabase');
    const smtp = this.config.get<{ host: string; port: number; user: string; pass: string }>('smtp');
    const driver = this.config.get<{ driver: string }>('mail')?.driver ?? 'auto';

    const edgeConfigured = Boolean(supabase?.url && supabase?.serviceRoleKey);
    const smtpConfigured = Boolean(smtp?.user && smtp?.pass);

    // Resolve the driver preference into a concrete strategy that is actually
    // configured — a forced driver that isn't set up degrades to mock (logged).
    if (driver === 'edge') {
      this.strategy = edgeConfigured ? 'edge' : 'mock';
    } else if (driver === 'smtp') {
      this.strategy = smtpConfigured ? 'smtp' : 'mock';
    } else if (driver === 'mock') {
      this.strategy = 'mock';
    } else {
      // auto — prefer the edge function over SMTP when both are available.
      this.strategy = edgeConfigured ? 'edge' : smtpConfigured ? 'smtp' : 'mock';
    }

    if (this.strategy === 'edge') {
      this.edgeFunctionUrl = `${supabase!.url}/functions/v1/send-email`;
      this.serviceRoleKey = supabase!.serviceRoleKey;
      this.logger.log(
        `Mailer strategy: Supabase Edge Function → ${this.edgeFunctionUrl} (MAIL_DRIVER=${driver})`,
      );
    } else if (this.strategy === 'smtp') {
      const secure = smtp!.port === 465;
      this.transporter = nodemailer.createTransport({
        host: smtp!.host,
        port: smtp!.port,
        secure,
        auth: { user: smtp!.user, pass: smtp!.pass },
      });
      this.logger.log(
        `Mailer strategy: Direct SMTP → ${smtp!.user} (secure: ${secure}, MAIL_DRIVER=${driver})`,
      );
    } else {
      const forced = driver !== 'auto' && driver !== 'mock';
      this.logger.warn(
        forced
          ? `Mailer strategy: MOCK — MAIL_DRIVER=${driver} was requested but its credentials are not configured. Emails will be logged to console only.`
          : 'Mailer strategy: MOCK (no SMTP or SUPABASE_SERVICE_ROLE_KEY credentials set). Emails will be logged to console only.',
      );
    }
  }

  async send(to: string, subject: string, body: string): Promise<void> {
    if (this.strategy === 'edge') {
      await this.sendViaEdgeFunction(to, subject, body);
    } else if (this.strategy === 'smtp') {
      await this.sendViaSMTP(to, subject, body);
    } else {
      this.mockLog(to, subject, body);
    }
  }

  // ─── Strategy 1: Supabase Edge Function ──────────────────────────────────

  private async sendViaEdgeFunction(to: string, subject: string, body: string): Promise<void> {
    this.logger.log(`[EdgeFn] Sending email to ${to}: "${subject}"`);
    const response = await fetch(this.edgeFunctionUrl!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.serviceRoleKey}`,
      },
      body: JSON.stringify({ to, subject, body }),
    });

    if (!response.ok) {
      const error = await response.text().catch(() => response.statusText);
      throw new Error(`Edge function responded ${response.status}: ${error}`);
    }

    const result = (await response.json()) as { messageId?: string };
    this.logger.log(`[EdgeFn] Delivered to ${to}. MessageId: ${result.messageId ?? 'n/a'}`);
  }

  // ─── Strategy 2: Direct Gmail SMTP ───────────────────────────────────────

  private async sendViaSMTP(to: string, subject: string, body: string): Promise<void> {
    const smtpFrom = this.config.get<{ from: string }>('smtp')?.from ?? 'TimeForge Team';
    this.logger.log(`[SMTP] Sending email to ${to}: "${subject}"`);
    const info = await this.transporter!.sendMail({ from: smtpFrom, to, subject, text: body });
    this.logger.log(`[SMTP] Delivered to ${to}. MessageId: ${info.messageId}`);
  }

  // ─── Strategy 3: Console mock ─────────────────────────────────────────────

  private mockLog(to: string, subject: string, body: string): void {
    this.logger.log(
      `[MOCK MAIL]\n  To: ${to}\n  Subject: ${subject}\n  Body:\n${body
        .split('\n')
        .map((l) => `    ${l}`)
        .join('\n')}`,
    );
  }
}
