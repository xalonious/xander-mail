import { maxRequestBytes } from "@/lib/config";
import { ZodError } from "zod";

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_URL || "http://localhost:3000";
  const developmentOrigin = process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1):3000$/.test(origin || "");
  if (!origin || (!developmentOrigin && new URL(origin).origin !== new URL(expected).origin)) {
    throw new HttpError(403, "Request origin is not allowed.");
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new HttpError(403, "Cross-site request blocked.");
}

export function requireSmallRequest(request: Request): void {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maxRequestBytes) throw new HttpError(413, "Request is too large.");
}

export async function readLimitedFormData(request: Request): Promise<FormData> {
  requireSmallRequest(request);
  if (!request.body) throw new HttpError(400, "Request body is missing.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxRequestBytes) {
      await reader.cancel();
      throw new HttpError(413, "Request is too large.");
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  const rebuilt = new Request(request.url, {
    method: "POST",
    headers: { "Content-Type": request.headers.get("content-type") || "" },
    body: new Blob([combined.buffer as ArrayBuffer]),
  });
  return rebuilt.formData();
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function errorResponse(error: unknown, operation: string): Response {
  const status = error instanceof HttpError ? error.status : error instanceof ZodError ? 400 : 502;
  const message = error instanceof Error ? error.message : "Request failed.";
  console.error(JSON.stringify({ operation, timestamp: new Date().toISOString(), category: error instanceof Error ? error.constructor.name : "unknown" }));
  const safe = status === 403 || status === 413 || status === 429 ||
    /outside the managed|not found|not configured|Add at least|Too many|Invalid|exceed|expired|no valid Message-ID|Google authorization|Could not load Gmail/.test(message);
  return Response.json({ error: safe ? message : "Request failed. Check server logs." }, { status });
}

const hits: number[] = [];
export function rateLimitSend(): void {
  const now = Date.now();
  while (hits.length && hits[0] < now - 3600_000) hits.shift();
  if (hits.length >= 30) throw new HttpError(429, "Send limit reached. Try again later.");
  hits.push(now);
}
