import type { BuiltMail } from "@/lib/email/mime";

export type DeliveryOutcome =
  | { delivered: true; archivedInGmail: true; rfcMessageId: string; gmailThreadId: string }
  | { delivered: true; archivedInGmail: false; rfcMessageId: string; archiveError: string }
  | { delivered: false; archivedInGmail: false; sendError: string };

export async function deliverAndArchive(
  mail: BuiltMail,
  send: (mail: BuiltMail) => Promise<string>,
  insert: (mime: Buffer, gmailThreadId?: string) => Promise<{ gmailMessageId: string; gmailThreadId: string }>,
): Promise<DeliveryOutcome> {
  try {
    await send(mail);
  } catch {
    return { delivered: false, archivedInGmail: false, sendError: "Brevo did not confirm delivery. Check its logs before retrying." };
  }
  try {
    const saved = await insert(mail.mime, mail.gmailThreadId);
    return { delivered: true, archivedInGmail: true, rfcMessageId: mail.rfcMessageId, gmailThreadId: saved.gmailThreadId };
  } catch {
    return { delivered: true, archivedInGmail: false, rfcMessageId: mail.rfcMessageId, archiveError: "Email was delivered, but the copy could not be saved to Gmail." };
  }
}
