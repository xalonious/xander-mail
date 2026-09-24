import "server-only";
import sanitizeHtml from "sanitize-html";
import { gmail } from "@/lib/gmail/client";
import { parseAddresses, relevantAddresses } from "@/lib/email/addresses";
import type { AttachmentInfo, MailMessage } from "@/lib/types";

export type GmailPart = {
  partId?: string; mimeType?: string; filename?: string; headers?: { name: string; value: string }[];
  body?: { data?: string; attachmentId?: string; size?: number }; parts?: GmailPart[];
};
export type GmailMessage = {
  id: string; threadId: string; labelIds?: string[]; snippet?: string; internalDate?: string; payload?: GmailPart;
};

function header(part: GmailPart, name: string): string {
  return part.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value || "";
}

export function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function extract(part: GmailPart, gmailMessageId: string): { text: string; html: string | null; attachments: AttachmentInfo[] } {
  let text = "";
  let html: string | null = null;
  const attachments: AttachmentInfo[] = [];
  const visit = (node: GmailPart, path = "") => {
    if (node.filename && (node.body?.attachmentId || node.body?.data)) attachments.push({
      gmailMessageId, attachmentId: node.body.attachmentId || `inline-${Buffer.from(path).toString("base64url")}`, filename: node.filename,
      mimeType: node.mimeType || "application/octet-stream", size: node.body.size || 0,
    });
    else if (!node.filename && node.body?.data) {
      const decoded = decodeBase64Url(node.body.data).toString("utf8");
      if (node.mimeType === "text/plain" && !text) text = decoded;
      if (node.mimeType === "text/html" && !html) html = decoded;
    }
    node.parts?.forEach((child, index) => visit(child, path ? `${path}.${index}` : String(index)));
  };
  visit(part);
  return { text, html: html ? sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.filter((tag) => !["img", "form", "input", "button", "style", "svg"].includes(tag)),
    allowedAttributes: { a: ["href", "title", "target", "rel"], table: ["cellpadding", "cellspacing"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: { a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }) },
  }) : null, attachments };
}

export function toMailMessage(raw: GmailMessage): MailMessage {
  const payload = raw.payload || {};
  const from = parseAddresses(header(payload, "From"))[0] || { address: "unknown" };
  const to = parseAddresses(header(payload, "To"));
  const cc = parseAddresses(header(payload, "Cc"));
  const bcc = parseAddresses(header(payload, "Bcc"));
  const body = extract(payload, raw.id);
  const labels = raw.labelIds || [];
  return {
    gmailMessageId: raw.id, gmailThreadId: raw.threadId, rfcMessageId: header(payload, "Message-ID") || null,
    references: header(payload, "References"), replyTo: parseAddresses(header(payload, "Reply-To")),
    from, to, cc, bcc, subject: header(payload, "Subject") || "(no subject)",
    snippet: raw.snippet || "", date: new Date(Number(raw.internalDate) || Date.now()).toISOString(),
    text: body.text, html: body.html, attachments: body.attachments,
    unread: labels.includes("UNREAD"), inbox: labels.includes("INBOX"),
    sent: labels.includes("SENT"), spam: labels.includes("SPAM"),
  };
}

export function isRelevantMessage(message: MailMessage): boolean {
  return relevantAddresses(message.from, message.to, message.cc, message.bcc);
}

export async function getMessage(id: string): Promise<MailMessage> {
  const raw = await gmail<GmailMessage>(`/messages/${encodeURIComponent(id)}?format=full`);
  const message = toMailMessage(raw);
  if (!isRelevantMessage(message)) throw new Error("Message is outside the managed mailbox.");
  return message;
}

export async function modifyMessage(id: string, addLabelIds: string[] = [], removeLabelIds: string[] = []): Promise<void> {
  await getMessage(id);
  await gmail(`/messages/${encodeURIComponent(id)}/modify`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addLabelIds, removeLabelIds }),
  });
}

export async function getAttachment(gmailMessageId: string, attachmentId: string): Promise<{ bytes: Buffer; filename: string; mimeType: string }> {
  const message = await getMessage(gmailMessageId);
  const info = message.attachments.find((item) => item.attachmentId === attachmentId);
  if (!info) throw new Error("Attachment was not found.");
  if (attachmentId.startsWith("inline-")) {
    const raw = await gmail<GmailMessage>(`/messages/${encodeURIComponent(gmailMessageId)}?format=full`);
    const path = Buffer.from(attachmentId.slice(7), "base64url").toString("utf8");
    const node = path ? path.split(".").reduce<GmailPart | undefined>((current, part) => current?.parts?.[Number(part)], raw.payload) : raw.payload;
    if (!node?.body?.data || node.filename !== info.filename) throw new Error("Attachment was not found.");
    return { bytes: decodeBase64Url(node.body.data), filename: info.filename, mimeType: info.mimeType };
  }
  const result = await gmail<{ data: string }>(`/messages/${encodeURIComponent(gmailMessageId)}/attachments/${encodeURIComponent(attachmentId)}`);
  return { bytes: decodeBase64Url(result.data), filename: info.filename, mimeType: info.mimeType };
}
