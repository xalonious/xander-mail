import { getMessage } from "@/lib/gmail/messages";
import { errorResponse } from "@/lib/http";
import { gmailId } from "@/lib/validation";

export const runtime = "nodejs";
export async function GET(_: Request, { params }: { params: Promise<{ messageId: string }> }) {
  try {
    const { messageId } = await params;
    return Response.json(await getMessage(gmailId.parse(messageId)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error, "get-message"); }
}
