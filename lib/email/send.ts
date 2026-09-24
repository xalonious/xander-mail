import "server-only";
import { findSentCopy, insertSentCopy } from "@/lib/gmail/threads";
import { buildMime, type OutgoingMail } from "@/lib/email/mime";
import { sendViaBrevo } from "@/lib/email/brevo";
import { deliverAndSaveSentCopy } from "@/lib/email/delivery";

export type SendResult =
  | { delivered: true; savedInGmail: true; rfcMessageId: string; gmailThreadId: string }
  | { delivered: true; savedInGmail: false; rfcMessageId: string; saveError: string; retryKey: string }
  | { delivered: false; savedInGmail: false; sendError: string };

type Entry = { started: number; promise: Promise<SendResult>; retry?: { mime: Buffer; gmailThreadId?: string; rfcMessageId: string } };
const entries = new Map<string, Entry>();
const maxEntries = 100;
const ttl = 15 * 60_000;

function prune() {
  for (const [key, entry] of entries) if (Date.now() - entry.started > ttl) entries.delete(key);
  while (entries.size >= maxEntries) entries.delete(entries.keys().next().value!);
}

export async function sendMailOnce(key: string, input: OutgoingMail): Promise<SendResult> {
  prune();
  const existing = entries.get(key);
  if (existing) return existing.promise;
  const entry: Entry = {
    started: Date.now(),
    promise: Promise.resolve({ delivered: false, savedInGmail: false, sendError: "Send did not start." }),
  };
  entries.set(key, entry);
  entry.promise = (async () => {
    const mail = await buildMime(input);
    const result = await deliverAndSaveSentCopy(mail, sendViaBrevo, insertSentCopy);
    if (!result.delivered) {
      console.error(JSON.stringify({ operation: "brevo-send", timestamp: new Date().toISOString(), rfcMessageId: mail.rfcMessageId, category: "transport-failure" }));
      return result;
    }
    if (result.savedInGmail) {
      console.info(JSON.stringify({ operation: "gmail-insert", timestamp: new Date().toISOString(), rfcMessageId: mail.rfcMessageId, gmailThreadId: result.gmailThreadId, category: "success" }));
      return result;
    }
    entry.retry = { mime: mail.mime, gmailThreadId: mail.gmailThreadId, rfcMessageId: mail.rfcMessageId };
    console.error(JSON.stringify({ operation: "gmail-insert", timestamp: new Date().toISOString(), rfcMessageId: mail.rfcMessageId, gmailThreadId: mail.gmailThreadId, category: "sent-copy-save-failure" }));
    return { ...result, retryKey: key };
  })();
  return entry.promise;
}

export async function retrySentCopy(key: string): Promise<SendResult> {
  const entry = entries.get(key);
  if (!entry || !entry.retry || Date.now() - entry.started > ttl) throw new Error("Sent copy retry expired. Check Gmail before taking further action.");
  const { mime, gmailThreadId, rfcMessageId } = entry.retry;
  const found = await findSentCopy(rfcMessageId);
  if (found && gmailThreadId && found.gmailThreadId !== gmailThreadId) throw new Error("Gmail saved this message in a different thread. Inspect it manually before retrying.");
  const saved = found || await insertSentCopy(mime, gmailThreadId);
  entry.retry = undefined;
  const result: SendResult = { delivered: true, savedInGmail: true, rfcMessageId, gmailThreadId: saved.gmailThreadId };
  entry.promise = Promise.resolve(result);
  return result;
}
