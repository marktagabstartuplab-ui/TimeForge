// Supabase Edge Function: send-email
// Sends transactional emails via Gmail SMTP using Nodemailer (Deno-compatible).
// Secrets required (set via: supabase secrets set SMTP_USER=... SMTP_PASS=...):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @deno-types="npm:@types/nodemailer"
import nodemailer from "npm:nodemailer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailPayload {
  to: string;
  subject: string;
  body: string;
  /** Optional branded HTML part rendered by the API's email template. */
  html?: string;
  /** Optional inline attachments (the brand mark, referenced by `cid:`). */
  attachments?: Array<{
    filename: string;
    content: string;
    encoding: string;
    contentType: string;
    cid: string;
  }>;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const payload: EmailPayload = await req.json();
    const { to, subject, body, html, attachments } = payload;

    if (!to || !subject || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject, body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const smtpHost = Deno.env.get("SMTP_HOST") ?? "smtp.gmail.com";
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") ?? "587", 10);
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    const smtpFrom = Deno.env.get("SMTP_FROM") ?? `HeroTime Team <${smtpUser}>`;

    if (!smtpUser || !smtpPass) {
      console.error("[send-email] SMTP_USER or SMTP_PASS secret is not set.");
      return new Response(
        JSON.stringify({ error: "SMTP credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const secure = smtpPort === 465;
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const info = await transporter.sendMail({
      from: smtpFrom,
      to,
      subject,
      text: body,
      ...(html ? { html } : {}),
      ...(attachments?.length ? { attachments } : {}),
    });

    console.log(`[send-email] Delivered to ${to}. MessageId: ${info.messageId}`);

    return new Response(
      JSON.stringify({ success: true, messageId: info.messageId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[send-email] Failed:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
