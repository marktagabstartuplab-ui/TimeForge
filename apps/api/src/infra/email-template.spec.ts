import { EMAIL_LOGO_ATTACHMENTS, EMAIL_LOGO_CID } from './email-logo';
import { renderEmailHtml } from './email-template';

describe('email logo asset', () => {
  it('ships one inline base64 PNG whose cid matches the header <img>', () => {
    expect(EMAIL_LOGO_ATTACHMENTS).toHaveLength(1);
    const [logo] = EMAIL_LOGO_ATTACHMENTS;
    expect(logo.cid).toBe(EMAIL_LOGO_CID);
    expect(logo.contentType).toBe('image/png');
    expect(logo.encoding).toBe('base64');
    // decodes to a real PNG (\x89PNG magic bytes)
    expect(Buffer.from(logo.content, 'base64').subarray(0, 4).toString('hex')).toBe('89504e47');
  });
});

describe('renderEmailHtml', () => {
  it('shows the brand mark and the two-tone HeroTime wordmark in the header', () => {
    const html = renderEmailHtml('Subject', 'Body.');

    expect(html).toContain(`src="cid:${EMAIL_LOGO_CID}"`);
    expect(html).toContain('alt="HeroTime"'); // still readable when images are blocked
    expect(html).toContain('color:#1b1b1c;">Hero</span>');
    expect(html).toContain('color:#37bcf1;">Time</span>');
  });

  it('wraps the body in the branded shell with header, subject heading and footer', () => {
    const html = renderEmailHtml('Your HeroTime Account Has Been Approved', 'Hello Ana,\n\nApproved.');

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Your HeroTime Account Has Been Approved');
    expect(html).toContain('You received this message because you have a HeroTime account.');
  });

  it('turns blank-line-separated blocks into paragraphs and keeps single newlines as breaks', () => {
    const html = renderEmailHtml('Subject', 'Hello Ana,\n\nBest regards,\nThe HeroTime Team');

    expect(html).toContain('>Hello Ana,</p>');
    expect(html).toContain('Best regards,<br />The HeroTime Team</p>');
  });

  it('renders a bare URL line as a styled CTA button with an action label, not a raw link only', () => {
    const html = renderEmailHtml('Reset Your HeroTime Password', 'You requested a reset.\n\nhttps://app.test/reset-password?token=abc\n\nThanks.');

    expect(html).toContain('href="https://app.test/reset-password?token=abc"');
    expect(html).toContain('Reset Password');
    expect(html).toContain('border-radius:6px');
    // fallback plain link is still offered for clients that break the button
    expect(html).toContain("If the button doesn't work");
  });

  it.each([
    ['https://app.test/verify-email?token=x', 'Verify Email'],
    ['https://app.test/login', 'Log In'],
    ['https://app.test/', 'Log In'],
    ['https://app.test/leave/requests', 'Open HeroTime'],
  ])('labels the CTA for %s as "%s"', (url, label) => {
    expect(renderEmailHtml('Subject', `Intro.\n\n${url}`)).toContain(`>${label}</a>`);
  });

  it('escapes HTML in the subject and body so user-supplied names cannot inject markup', () => {
    const html = renderEmailHtml('Hi <b>x</b>', 'Hello <script>alert(1)</script> & co,');

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp; co,');
    expect(html).toContain('Hi &lt;b&gt;x&lt;/b&gt;');
  });

  it('does not emit empty paragraphs for trailing or repeated blank lines', () => {
    const html = renderEmailHtml('Subject', 'Only line.\n\n\n\n');

    expect(html).not.toMatch(/>\s*<\/p>/);
  });
});
