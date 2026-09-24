import { isManagedAddress } from "@/lib/config";
import type { MailAddress } from "@/lib/types";

export function parseAddresses(value: string): MailAddress[] {
  return value.split(/,(?![^<]*>)/).map((part) => {
    const match = part.trim().match(/^(?:"?([^"<>]+)"?\s*)?<([^<>\s]+)>$/);
    return match ? { name: match[1]?.trim(), address: match[2].toLowerCase() } : { address: part.trim().toLowerCase() };
  }).filter((item) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(item.address));
}

export function relevantAddresses(from: MailAddress, to: MailAddress[], cc: MailAddress[], bcc: MailAddress[]): boolean {
  return [from, ...to, ...cc, ...bcc].some((item) => isManagedAddress(item.address));
}

export function replyRecipient(from: MailAddress, replyTo: MailAddress[], to: MailAddress[]): string {
  const candidates = [...replyTo, from, ...to];
  return (candidates.find((item) => !isManagedAddress(item.address)) || candidates[0]).address;
}

export function formatAddress(address: MailAddress): string {
  return address.name ? `${address.name} <${address.address}>` : address.address;
}
