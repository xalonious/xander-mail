import type { BuiltMail } from "@/lib/email/mime";

export type DeliveryOutcome =
  | { delivered: true; savedInGmail: true; rfcMessageId: string; gmailThreadId: string }
  | { delivered: true; savedInGmail: false; rfcMessageId: string; saveError: string }
  | { delivered: false; savedInGmail: false; sendError: string };

export async function deliverAndSaveSentCopy(
  mail: BuiltMail,
  send: (mail: BuiltMail) => Promise<string>,
  insert: (mime: Buffer, gmailThreadId?: string) => Promise<{ gmailMessageId: string; gmailThreadId: string }>,
): Promise<DeliveryOutcome> {
  try {
    await send(mail);
  } catch {
    return { delivered: false, savedInGmail: false, sendError: "Brevo did not confirm delivery. Check its logs before retrying." };
  }
  try {
    const saved = await insert(mail.mime, mail.gmailThreadId);
    return { delivered: true, savedInGmail: true, rfcMessageId: mail.rfcMessageId, gmailThreadId: saved.gmailThreadId };
  } catch {
    return { delivered: true, savedInGmail: false, rfcMessageId: mail.rfcMessageId, saveError: "Email was delivered, but the copy could not be saved to Gmail." };
  }
}
