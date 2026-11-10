import { z } from "zod";
import { composeFields, splitRecipients, validateCompose } from "@/lib/compose-validation";
import { HttpError } from "@/lib/http";
import type { OutgoingMail, OutgoingAttachment } from "@/lib/email/mime";

const id = z.string().regex(/^[a-zA-Z0-9_-]{5,128}$/);
export const gmailId = id;
export const idempotencyKey = z.uuid();
export const folderSchema = z.enum(["inbox", "sent"]);
export const actionSchema = z.enum(["read", "unread"]);

export async function parseOutgoing(form: FormData): Promise<OutgoingMail> {
  const input = Object.fromEntries(composeFields.map((field) => {
    const value = form.get(field);
    if (value !== null && typeof value !== "string") throw new HttpError(400, "Message fields must contain text.");
    return [field, value || ""];
  })) as Record<typeof composeFields[number], string>;
  const files = form.getAll("attachments").filter((part): part is File => part instanceof File && part.size > 0);
  const errors = validateCompose(input, files);
  if (Object.keys(errors).length) throw new HttpError(400, Object.values(errors)[0]!, errors);
  const attachments: OutgoingAttachment[] = await Promise.all(files.map(async (file) => ({
    filename: file.name.trim(), contentType: file.type || "application/octet-stream",
    content: Buffer.from(await file.arrayBuffer()),
  })));
  return {
    to: splitRecipients(input.to), cc: splitRecipients(input.cc), bcc: splitRecipients(input.bcc),
    subject: input.subject.trim(), body: input.body, attachments,
  };
}
