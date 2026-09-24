import { z } from "zod";
import { maxAttachmentBytes } from "@/lib/config";
import type { OutgoingMail, OutgoingAttachment } from "@/lib/email/mime";

const headerText = z.string().trim().min(1).max(300).refine((value) => !/[\r\n\0]/.test(value), "Invalid header text.");
const email = z.email().max(254);
const id = z.string().regex(/^[a-zA-Z0-9_-]{5,128}$/);
export const gmailId = id;
export const idempotencyKey = z.uuid();
export const folderSchema = z.enum(["inbox", "sent"]);
export const actionSchema = z.enum(["read", "unread"]);

function recipients(raw: FormDataEntryValue | null): string[] {
  const value = String(raw || "").trim();
  if (!value) return [];
  return value.split(",").map((part) => email.parse(part.trim().toLowerCase()));
}

export async function parseOutgoing(form: FormData): Promise<OutgoingMail> {
  const to = recipients(form.get("to"));
  if (!to.length) throw new Error("Add at least one recipient.");
  const cc = recipients(form.get("cc"));
  const bcc = recipients(form.get("bcc"));
  if (to.length + cc.length + bcc.length > 50) throw new Error("Too many recipients.");
  const subject = headerText.parse(form.get("subject"));
  const body = z.string().min(1).max(100_000).parse(form.get("body"));
  const files = form.getAll("attachments").filter((part): part is File => part instanceof File && part.size > 0);
  if (files.length > 5 || files.some((file) => file.size > maxAttachmentBytes) ||
      files.reduce((sum, file) => sum + file.size, 0) > maxAttachmentBytes) {
    throw new Error("Attachments exceed the 8 MB total limit or five-file limit.");
  }
  const blockedExtension = /\.(?:exe|dll|bat|cmd|ps1|sh|js|mjs|html?|svg|php|jar|scr)$/i;
  if (files.some((file) => blockedExtension.test(file.name) || /^(?:text\/html|image\/svg\+xml|application\/(?:javascript|x-msdownload))$/i.test(file.type))) {
    throw new Error("Attachment file type is not allowed.");
  }
  const attachments: OutgoingAttachment[] = await Promise.all(files.map(async (file) => ({
    filename: headerText.parse(file.name), contentType: file.type || "application/octet-stream",
    content: Buffer.from(await file.arrayBuffer()),
  })));
  return { to, cc, bcc, subject, body, attachments };
}
