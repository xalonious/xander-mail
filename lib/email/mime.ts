import { randomUUID } from "node:crypto";
import MailComposer from "nodemailer/lib/mail-composer";
import { getFromName, getPrimaryAddress } from "@/lib/config";
import { replyHeaders, normalizeReplySubject } from "@/lib/email/threading";

export type OutgoingAttachment = { filename: string; contentType: string; content: Buffer };
export type OutgoingMail = {
  to: string[]; cc: string[]; bcc: string[]; subject: string; body: string;
  attachments: OutgoingAttachment[];
  reply?: { rfcMessageId: string; references: string; gmailThreadId: string };
};

export type BuiltMail = {
  mime: Buffer; rfcMessageId: string; gmailThreadId?: string;
  envelopeRecipients: string[];
};

export async function buildMime(input: OutgoingMail): Promise<BuiltMail> {
  const senderAddress = getPrimaryAddress();
  const rfcMessageId = `<${randomUUID()}@${senderAddress.split("@")[1]}>`;
  const thread = input.reply ? replyHeaders(input.reply.rfcMessageId, input.reply.references) : null;
  const composer = new MailComposer({
    from: { name: getFromName(), address: senderAddress },
    to: input.to.join(", "), cc: input.cc.join(", "), bcc: input.bcc.join(", "),
    subject: thread ? normalizeReplySubject(input.subject) : input.subject,
    text: input.body, messageId: rfcMessageId, date: new Date(),
    inReplyTo: thread?.inReplyTo, references: thread?.references,
    attachments: input.attachments.map((item) => ({
      filename: item.filename, contentType: item.contentType, content: item.content,
    })),
  });
  const mime = await new Promise<Buffer>((resolve, reject) => composer.compile().build((error, message) =>
    error ? reject(error) : resolve(message)));
  return {
    mime, rfcMessageId, gmailThreadId: input.reply?.gmailThreadId,
    envelopeRecipients: [...input.to, ...input.cc, ...input.bcc],
  };
}
