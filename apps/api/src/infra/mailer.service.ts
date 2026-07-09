import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * Mailer service — sends transactional emails using one of two strategies:
 *
 * 1. **Supabase Edge Function** (preferred in production): calls the `send-email`
 *    edge function deployed on your Supabase project. SMTP secrets are stored
 *    securely as Supabase project secrets (never in this codebase).
 *    Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
 *
 * 2. **Direct Gmail SMTP** (local dev fallback): uses Nodemailer with the
 *    SMTP_* variables from .env. Activated when SUPABASE_SERVICE_ROLE_KEY is
 *    not set (i.e. local development without full Supabase config).
 *
 * 3. **Console mock** (offline fallback): logs the email payload to stdout when
 *    neither SMTP credentials nor Supabase are configured.
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

  constructor(private readonly config: ConfigService) {
    const supabase = this.config.get<{ url: string; serviceRoleKey: string }>('supabase');
    const smtp = this.config.get<{ host: string; port: number; user: string; pass: string }>('smtp');

    if (supabase?.url && supabase?.serviceRoleKey) {
      // Strategy 1: Supabase Edge Function
      this.edgeFunctionUrl = `${supabase.url}/functions/v1/send-email`;
      this.serviceRoleKey = supabase.serviceRoleKey;
      this.logger.log(`Mailer strategy: Supabase Edge Function → ${this.edgeFunctionUrl}`);
    } else if (smtp?.user && smtp?.pass) {
      // Strategy 2: Direct Gmail SMTP
      const secure = smtp.port === 465;
      this.transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure,
        auth: { user: smtp.user, pass: smtp.pass },
      });
      this.logger.log(`Mailer strategy: Direct SMTP → ${smtp.user} (secure: ${secure})`);
    } else {
      // Strategy 3: Console mock
      this.logger.warn(
        'Mailer strategy: MOCK (no SUPABASE_SERVICE_ROLE_KEY or SMTP credentials set). Emails will be logged to console only.',
      );
    }
  }

  async send(to: string, subject: string, body: string): Promise<void> {
    if (this.edgeFunctionUrl && this.serviceRoleKey) {
      await this.sendViaEdgeFunction(to, subject, body);
    } else if (this.transporter) {
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
