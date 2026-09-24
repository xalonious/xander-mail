import "server-only";
import { scopedQuery, type Folder } from "@/lib/gmail/query";
import { gmail } from "@/lib/gmail/client";
import { isRelevantMessage, toMailMessage, type GmailMessage } from "@/lib/gmail/messages";
import type { MailPage, MailThread } from "@/lib/types";


export async function getThread(id: string): Promise<MailThread> {
  const raw = await gmail<{ id: string; messages?: GmailMessage[] }>(`/threads/${encodeURIComponent(id)}?format=full`);
  const messages = (raw.messages || []).map(toMailMessage).sort((a, b) => a.date.localeCompare(b.date));
  if (!messages.some(isRelevantMessage)) throw new Error("Thread is outside the managed mailbox.");
  const latest = messages.at(-1);
  if (!latest) throw new Error("Gmail thread is empty.");
  return {
    gmailThreadId: raw.id, messages, latest,
    unread: messages.some((item) => item.unread),
  };
}

export async function listThreads(folder: Folder, search = "", pageToken?: string): Promise<MailPage> {
  const params = new URLSearchParams({ q: scopedQuery(folder, search), maxResults: "25" });
  if (folder === "inbox") params.set("includeSpamTrash", "true");
  if (pageToken) params.set("pageToken", pageToken);
  const page = await gmail<{ threads?: { id: string }[]; nextPageToken?: string; resultSizeEstimate?: number }>(`/threads?${params}`);
  const settled = await Promise.allSettled((page.threads || []).map((item) => getThread(item.id)));
  const threads = settled.flatMap((item) => item.status === "fulfilled" ? [item.value] : []);
  if (settled.length && !threads.length) throw new Error("Could not load Gmail threads.");
  if (settled.some((item) => item.status === "rejected")) {
    console.error(JSON.stringify({ operation: "list-threads", timestamp: new Date().toISOString(), category: "partial-thread-fetch", failures: settled.filter((item) => item.status === "rejected").length }));
  }
  return { threads, nextPageToken: page.nextPageToken, resultSizeEstimate: page.resultSizeEstimate };
}

export async function modifyThread(id: string, addLabelIds: string[] = [], removeLabelIds: string[] = []): Promise<void> {
  await getThread(id);
  await gmail(`/threads/${encodeURIComponent(id)}/modify`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addLabelIds, removeLabelIds }),
  });
}

export async function insertSentCopy(mime: Buffer, gmailThreadId?: string): Promise<{ gmailMessageId: string; gmailThreadId: string }> {
  const inserted = await gmail<{ id: string; threadId: string }>("/messages?internalDateSource=dateHeader", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      raw: mime.toString("base64url"), labelIds: ["SENT"],
      ...(gmailThreadId ? { threadId: gmailThreadId } : {}),
    }),
  });
  if (gmailThreadId && inserted.threadId !== gmailThreadId) {
    throw new Error(`Gmail inserted the sent copy into a different thread (${inserted.threadId}).`);
  }
  return { gmailMessageId: inserted.id, gmailThreadId: inserted.threadId };
}

export async function findSentCopy(rfcMessageId: string): Promise<{ gmailMessageId: string; gmailThreadId: string } | null> {
  const params = new URLSearchParams({ q: `in:sent rfc822msgid:${rfcMessageId}`, maxResults: "2" });
  const page = await gmail<{ messages?: { id: string; threadId: string }[] }>(`/messages?${params}`);
  const match = page.messages?.[0];
  return match ? { gmailMessageId: match.id, gmailThreadId: match.threadId } : null;
}
