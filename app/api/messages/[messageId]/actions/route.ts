import { modifyMessage } from "@/lib/gmail/messages";
import { errorResponse, requireSameOrigin } from "@/lib/http";
import { actionSchema, gmailId } from "@/lib/validation";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ messageId: string }> }) {
  try {
    requireSameOrigin(request);
    const { messageId } = await params;
    const body = await request.json() as { action?: unknown };
    const action = actionSchema.parse(body.action);
    const changes = {
      read: [[], ["UNREAD"]], unread: [["UNREAD"], []],
    } as const;
    const [add, remove] = changes[action];
    await modifyMessage(gmailId.parse(messageId), [...add], [...remove]);
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error, "message-action"); }
}
