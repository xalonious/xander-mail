const idPattern = /<[^<>\s\r\n]+@[^<>\s\r\n]+>/g;

export function normalizeReplySubject(subject: string): string {
  const clean = subject.replace(/[\r\n]/g, " ").trim();
  return /^re\s*:/i.test(clean) ? clean : `Re: ${clean}`;
}

export function validRfcMessageId(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.trim().match(/^<[^<>\s\r\n]+@[^<>\s\r\n]+>$/);
  return match ? match[0] : null;
}

export function replyHeaders(rfcMessageId: string, existingReferences: string): { inReplyTo: string; references: string } {
  const valid = validRfcMessageId(rfcMessageId);
  if (!valid) throw new Error("The original message has no valid Message-ID; a safe threaded reply cannot be sent.");
  const refs = existingReferences.match(idPattern) || [];
  return { inReplyTo: valid, references: [...new Set([...refs, valid])].join(" ") };
}
