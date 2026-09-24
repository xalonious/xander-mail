import { retrySentCopy } from "@/lib/email/send";
import { errorResponse, requireSameOrigin } from "@/lib/http";
import { idempotencyKey } from "@/lib/validation";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await request.json() as { retryKey?: unknown };
    return Response.json(await retrySentCopy(idempotencyKey.parse(body.retryKey)));
  } catch (error) { return errorResponse(error, "retry-sent-copy"); }
}
