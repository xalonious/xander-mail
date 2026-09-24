import { getPrimaryAddress } from "@/lib/config";

export type Folder = "inbox" | "sent";
const folderQuery: Record<Folder, string> = {
  inbox: "{in:inbox in:spam}", sent: "in:sent",
};

export function scopedQuery(folder: Folder, search = ""): string {
  const address = getPrimaryAddress();
  const addressTerms = [`to:${address}`, `cc:${address}`, `from:${address}`];
  const sanitized = search.trim().slice(0, 200).replace(/[{}()]/g, " ");
  return `${folderQuery[folder]} {${addressTerms.join(" ")}}${sanitized ? ` (${sanitized})` : ""}`;
}
