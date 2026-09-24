import "server-only";
import { gmailAccessToken } from "@/lib/google/oauth";

export class GmailError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function gmail<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await gmailAccessToken();
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...init.headers },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new GmailError(response.status, response.status === 401 || response.status === 403
      ? "Google authorization has expired or lacks Gmail permission."
      : `Gmail request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}
