import { listThreads } from "@/lib/gmail/threads";
import { folderSchema } from "@/lib/validation";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const folder = folderSchema.parse(url.searchParams.get("folder") || "inbox");
    const search = (url.searchParams.get("q") || "").slice(0, 200);
    const pageToken = url.searchParams.get("pageToken") || undefined;
    if (pageToken && !/^[a-zA-Z0-9_-]{1,512}$/.test(pageToken)) throw new Error("Invalid page token.");
    return Response.json(await listThreads(folder, search, pageToken), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error, "list-mail"); }
}
