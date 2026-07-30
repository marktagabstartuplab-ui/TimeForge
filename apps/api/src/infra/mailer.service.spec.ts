import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailerService } from './mailer.service';

jest.mock('nodemailer');

const EDGE = { url: 'https://proj.supabase.co', serviceRoleKey: 'service-key' };
const SMTP = { host: 'smtp.gmail.com', port: 587, user: 'me@gmail.com', pass: 'app-pass' };

/** Builds a ConfigService stub returning the given transport config by key. */
function makeConfig(opts: {
  driver?: string;
  edge?: boolean;
  smtp?: boolean;
}): ConfigService {
  const map: Record<string, unknown> = {
    mail: { driver: opts.driver ?? 'auto' },
    supabase: opts.edge ? EDGE : {},
    smtp: opts.smtp ? SMTP : { host: 'smtp.gmail.com', port: 587 },
  };
  return { get: (key: string) => map[key] } as unknown as ConfigService;
}

describe('MailerService transport selection', () => {
  let sendMail: jest.Mock;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    sendMail = jest.fn().mockResolvedValue({ messageId: 'smtp-id' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: 'edge-id' }),
      text: async () => '',
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => jest.clearAllMocks());

  it('auto: prefers the edge function when Supabase is configured, even if SMTP is set (the Railway case)', async () => {
    const mailer = new MailerService(makeConfig({ driver: 'auto', edge: true, smtp: true }));
    await mailer.send('to@x.com', 'Subject', 'Body');

    expect(fetchMock).toHaveBeenCalledWith(
      `${EDGE.url}/functions/v1/send-email`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('auto: falls back to SMTP when only SMTP is configured', async () => {
    const mailer = new MailerService(makeConfig({ driver: 'auto', edge: false, smtp: true }));
    await mailer.send('to@x.com', 'Subject', 'Body');

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('MAIL_DRIVER=edge: forces the edge function even when SMTP is also configured', async () => {
    const mailer = new MailerService(makeConfig({ driver: 'edge', edge: true, smtp: true }));
    await mailer.send('to@x.com', 'Subject', 'Body');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('MAIL_DRIVER=smtp: forces SMTP even when the edge function is configured', async () => {
    const mailer = new MailerService(makeConfig({ driver: 'smtp', edge: true, smtp: true }));
    await mailer.send('to@x.com', 'Subject', 'Body');

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('MAIL_DRIVER=edge but Supabase not configured: degrades to mock (no send attempted)', async () => {
    const mailer = new MailerService(makeConfig({ driver: 'edge', edge: false, smtp: true }));
    await mailer.send('to@x.com', 'Subject', 'Body');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('sends both a text and a branded html part (SMTP)', async () => {
    const mailer = new MailerService(makeConfig({ driver: 'smtp', smtp: true }));
    await mailer.send('to@x.com', 'Subject', 'Body');

    const sent = sendMail.mock.calls[0][0] as {
      text: string;
      html: string;
      attachments: Array<{ cid: string }>;
    };
    expect(sent.text).toBe('Body');
    expect(sent.html).toContain('<!DOCTYPE html>');
    // the brand mark must ride along, or the header <img src="cid:..."> breaks
    expect(sent.attachments[0].cid).toBe('herotime-logo');
    expect(sent.html).toContain('cid:herotime-logo');
  });

  it('includes the html part in the edge function payload', async () => {
    const mailer = new MailerService(makeConfig({ driver: 'edge', edge: true }));
    await mailer.send('to@x.com', 'Subject', 'Body');

    const init = fetchMock.mock.calls[0][1] as { body: string };
    const payload = JSON.parse(init.body) as {
      body: string;
      html: string;
      attachments: Array<{ cid: string }>;
    };
    expect(payload.body).toBe('Body');
    expect(payload.html).toContain('<!DOCTYPE html>');
    expect(payload.attachments[0].cid).toBe('herotime-logo');
  });

  it('nothing configured: mock (no send attempted)', async () => {
    const mailer = new MailerService(makeConfig({ driver: 'auto', edge: false, smtp: false }));
    await mailer.send('to@x.com', 'Subject', 'Body');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
});
