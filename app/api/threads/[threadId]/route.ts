import { getThread } from "@/lib/gmail/threads";
import { errorResponse } from "@/lib/http";
import { gmailId } from "@/lib/validation";

export const runtime = "nodejs";
export async function GET(_: Request, { params }: { params: Promise<{ threadId: string }> }) {
  try {
    const { threadId } = await params;
    return Response.json(await getThread(gmailId.parse(threadId)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error, "get-thread"); }
}
