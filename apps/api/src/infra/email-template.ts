/**
 * Branded HTML wrapper for transactional email.
 *
 * Call sites keep composing plain-text bodies (line-per-line, blank line between
 * paragraphs, a bare URL on its own line where a link is needed). This module
 * turns that same body into an HTML part without any call site changing:
 *
 *  - blank-line-separated blocks become paragraphs
 *  - a block that is just a URL becomes a styled CTA button
 *  - everything is wrapped in a table-based shell with header and footer
 *
 * Constraints that shape the markup: email clients strip <style> blocks and
 * external CSS, so every rule is inline; the brand mark is referenced as
 * `cid:` (see email-logo.ts) because `data:` image sources are stripped, and
 * the "HeroTime" wordmark stays live text so the header still reads correctly
 * in the clients that block images until the reader opts in.
 */

import { EMAIL_LOGO_CID } from './email-logo';

const BRAND_NAME = 'HeroTime';
// Brand tokens from apps/web/app/globals.css.
const BRAND_COLOR = '#2563eb'; // --primary / --brand (CTA)
const BRAND_INK = '#1b1b1c'; // --brand-ink ("Hero" in the wordmark)
const BRAND_CYAN = '#37bcf1'; // --brand-cyan ("Time" in the wordmark)
const BRAND_SURFACE = '#f6f3f4'; // --brand-surface (header band)

/** Escapes the five characters that can break out of HTML text/attribute context. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** True when the whole block is a single bare URL — the shape call sites use for links. */
function asBareUrl(block: string): string | null {
  const trimmed = block.trim();
  return /^https?:\/\/\S+$/.test(trimmed) ? trimmed : null;
}

/**
 * Picks the button label from the link's path so the CTA reads as an action
 * instead of a naked URL. Unknown paths get a neutral fallback.
 */
function ctaLabel(url: string): string {
  let path = '';
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    path = '';
  }
  if (path.includes('reset-password')) return 'Reset Password';
  if (path.includes('verify-email')) return 'Verify Email';
  if (path.includes('login') || path === '/' || path === '') return 'Log In';
  return `Open ${BRAND_NAME}`;
}

/** Bulletproof (table-based) CTA button — <a> styling alone is unreliable in Outlook. */
function renderButton(url: string): string {
  const safeUrl = escapeHtml(url);
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
                <tr>
                  <td align="center" bgcolor="${BRAND_COLOR}" style="border-radius:6px;">
                    <a href="${safeUrl}" style="display:inline-block;padding:12px 28px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">${escapeHtml(ctaLabel(url))}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#6b7280;">
                If the button doesn't work, copy and paste this link into your browser:<br />
                <a href="${safeUrl}" style="color:${BRAND_COLOR};word-break:break-all;">${safeUrl}</a>
              </p>`;
}

/** A text block: single-newline breaks are preserved, the block becomes one paragraph. */
function renderParagraph(block: string): string {
  const html = block
    .split('\n')
    .map((line) => escapeHtml(line))
    .join('<br />');
  return `
              <p style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;">${html}</p>`;
}

/**
 * Wraps a plain-text transactional body in the branded HTML shell.
 *
 * @param subject Used as the preheader/heading so the email has a visual anchor.
 * @param body    The existing plain-text body — also sent as the text/plain part.
 */
export function renderEmailHtml(subject: string, body: string): string {
  const blocks = body
    .split(/\n[ \t]*\n/)
    .map((block) => block.replace(/^\n+|\n+$/g, ''))
    .filter((block) => block.trim().length > 0);

  const content = blocks
    .map((block) => {
      const url = asBareUrl(block);
      return url ? renderButton(url) : renderParagraph(block);
    })
    .join('');

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f5f7;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="background-color:${BRAND_SURFACE};padding:20px 32px;border-bottom:1px solid #e5e7eb;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding-right:8px;" valign="middle">
                      <img src="cid:${EMAIL_LOGO_CID}" width="32" height="32" alt="${BRAND_NAME}" style="display:block;width:32px;height:32px;border:0;" />
                    </td>
                    <td valign="middle" style="font-family:Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;letter-spacing:-0.4px;line-height:1;">
                      <span style="color:${BRAND_INK};">Hero</span><span style="color:${BRAND_CYAN};">Time</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:20px;line-height:1.4;font-weight:600;color:#111827;">${escapeHtml(subject)}</h1>${content}
              </td>
            </tr>
            <tr>
              <td style="background-color:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
                <p style="margin:0 0 6px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#6b7280;">
                  You received this message because you have a ${BRAND_NAME} account.
                </p>
                <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#6b7280;">
                  Need help? Contact your HR or system administrator. This is an automated message — please do not reply.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#9ca3af;">&copy; ${new Date().getFullYear()} ${BRAND_NAME}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
