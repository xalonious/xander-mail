import { z } from "zod";

export const maxAttachmentBytes = 8 * 1024 * 1024;
export const composeFields = ["to", "cc", "bcc", "subject", "body"] as const;
export type ComposeField = typeof composeFields[number];
export type ComposeInput = Record<ComposeField, string>;
export type ComposeErrors = Partial<Record<ComposeField | "attachments", string>>;
type AttachmentInfo = { name: string; size: number; type: string };

const email = z.email().max(254);
export function splitRecipients(value: string): string[] {
  return value.trim() ? value.split(",").map((part) => part.trim().toLowerCase()) : [];
}

export function validateCompose(input: ComposeInput, files: AttachmentInfo[]): ComposeErrors {
  const errors: ComposeErrors = {};
  let recipientCount = 0;
  for (const field of ["to", "cc", "bcc"] as const) {
    const addresses = splitRecipients(input[field]);
    recipientCount += addresses.length;
    if (field === "to" && !addresses.length) errors.to = "Add at least one recipient.";
    else if (addresses.some((address) => !email.safeParse(address).success)) {
      errors[field] = `Enter valid email addresses in ${field === "to" ? "To" : field === "cc" ? "Cc" : "Bcc"}, separated by commas.`;
    }
  }
  if (recipientCount > 50 && !errors.to) errors.to = "Use no more than 50 recipients across To, Cc, and Bcc.";

  const subject = input.subject.trim();
  if (!subject) errors.subject = "Add a subject.";
  else if (subject.length > 300) errors.subject = "Keep the subject to 300 characters or fewer.";
  else if (/[\r\n\0]/.test(subject)) errors.subject = "The subject must be a single line without control characters.";

  if (!input.body.trim()) errors.body = "Write a message before sending.";
  else if (input.body.length > 100_000) errors.body = "Keep the message to 100,000 characters or fewer.";

  const blockedExtension = /\.(?:exe|dll|bat|cmd|ps1|sh|js|mjs|html?|svg|php|jar|scr)$/i;
  if (files.length > 5) errors.attachments = "Attach no more than five files.";
  else if (files.reduce((sum, file) => sum + file.size, 0) > maxAttachmentBytes) {
    errors.attachments = "Attachments must total 8 MB or less.";
  } else if (files.some((file) => blockedExtension.test(file.name) || /^(?:text\/html|image\/svg\+xml|application\/(?:javascript|x-msdownload))$/i.test(file.type))) {
    errors.attachments = "This attachment type is not allowed. Remove executable, script, HTML, or SVG files.";
  } else if (files.some((file) => !file.name.trim() || file.name.trim().length > 300 || /[\r\n\0]/.test(file.name))) {
    errors.attachments = "Attachment names must be 1–300 characters without line breaks or control characters.";
  }
  return errors;
}
