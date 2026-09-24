import { getAttachment } from "@/lib/gmail/messages";
import { errorResponse } from "@/lib/http";
import { gmailId } from "@/lib/validation";

export const runtime = "nodejs";
export async function GET(_: Request, { params }: { params: Promise<{ messageId: string; attachmentId: string }> }) {
  try {
    const { messageId, attachmentId } = await params;
    const attachment = await getAttachment(gmailId.parse(messageId), gmailId.parse(attachmentId));
    const filename = attachment.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    return new Response(new Uint8Array(attachment.bytes), {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(attachment.bytes.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) { return errorResponse(error, "get-attachment"); }
}
