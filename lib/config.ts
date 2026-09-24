import { z } from "zod";

export function getPrimaryAddress(): string {
  const address = configured("MAIL_FROM_ADDRESS").trim().toLowerCase();
  if (!z.email().safeParse(address).success) throw new Error("MAIL_FROM_ADDRESS must be a valid email address.");
  return address;
}

export function getFromName(): string {
  return process.env.MAIL_FROM_NAME?.trim() || "Mail";
}
export const maxAttachmentBytes = 8 * 1024 * 1024;
export const maxRequestBytes = 12 * 1024 * 1024;

export function isManagedAddress(address: string): boolean {
  return getPrimaryAddress() === address.trim().toLowerCase();
}

export function configured(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}
