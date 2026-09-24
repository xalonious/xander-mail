import { replyRecipient } from "@/lib/email/addresses";
import { normalizeReplySubject } from "@/lib/email/threading";
import { sendMailOnce } from "@/lib/email/send";
import { getThread } from "@/lib/gmail/threads";
import { errorResponse, rateLimitSend, readLimitedFormData, requireSameOrigin } from "@/lib/http";
import { gmailId, idempotencyKey, parseOutgoing } from "@/lib/validation";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const key = idempotencyKey.parse(request.headers.get("x-idempotency-key"));
    const input = await parseOutgoing(await readLimitedFormData(request));
    const replyThreadId = request.headers.get("x-reply-thread-id");
    const replyMessageId = request.headers.get("x-reply-message-id");
    if (replyThreadId || replyMessageId) {
      if (!replyThreadId || !replyMessageId) throw new Error("Invalid reply target.");
      const thread = await getThread(gmailId.parse(replyThreadId));
      const target = thread.messages.find((item) => item.gmailMessageId === gmailId.parse(replyMessageId));
      if (!target || !target.rfcMessageId) throw new Error("Reply target has no valid Message-ID.");
      input.to = [replyRecipient(target.from, target.replyTo, target.to)];
      input.cc = [];
      input.bcc = [];
      input.subject = normalizeReplySubject(target.subject);
      input.reply = { rfcMessageId: target.rfcMessageId, references: target.references, gmailThreadId: thread.gmailThreadId };
    }
    rateLimitSend();
    const result = await sendMailOnce(key, input);
    return Response.json(result, { status: result.delivered ? 200 : 502 });
  } catch (error) { return errorResponse(error, "send-mail"); }
}
