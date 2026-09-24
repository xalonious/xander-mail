import { modifyThread } from "@/lib/gmail/threads";
import { errorResponse, requireSameOrigin } from "@/lib/http";
import { actionSchema, gmailId } from "@/lib/validation";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  try {
    requireSameOrigin(request);
    const { threadId } = await params;
    const body = await request.json() as { action?: unknown };
    const action = actionSchema.parse(body.action);
    const id = gmailId.parse(threadId);
    const changes = {
      read: [[], ["UNREAD"]], unread: [["UNREAD"], []],
    } as const;
    const [add, remove] = changes[action];
    await modifyThread(id, [...add], [...remove]);
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error, "thread-action"); }
}
