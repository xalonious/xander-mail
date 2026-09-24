import "server-only";
import { configured } from "@/lib/config";

let cached: { token: string; expiresAt: number } | null = null;

export async function gmailAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: configured("GOOGLE_CLIENT_ID"),
      client_secret: configured("GOOGLE_CLIENT_SECRET"),
      refresh_token: configured("GOOGLE_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Google authorization has expired or been revoked.");
  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Google did not return an access token.");
  cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return cached.token;
}
