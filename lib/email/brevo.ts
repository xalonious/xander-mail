import "server-only";
import nodemailer from "nodemailer";
import { configured, getPrimaryAddress } from "@/lib/config";
import type { BuiltMail } from "@/lib/email/mime";

export async function sendViaBrevo(mail: BuiltMail): Promise<string> {
  const transport = nodemailer.createTransport({
    host: "smtp-relay.brevo.com", port: 587, secure: false, requireTLS: true,
    auth: { user: configured("BREVO_SMTP_LOGIN"), pass: configured("BREVO_SMTP_KEY") },
    connectionTimeout: 20_000, greetingTimeout: 20_000, socketTimeout: 30_000,
  });
  const result = await transport.sendMail({
    raw: mail.mime,
    envelope: { from: getPrimaryAddress(), to: mail.envelopeRecipients },
  });
  if (!result.accepted.length || result.rejected.length) {
    throw new Error("Brevo did not accept every recipient.");
  }
  return result.messageId || mail.rfcMessageId;
}
