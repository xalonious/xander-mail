import MailApp from "@/components/mail-app";
import { getFromName, getPrimaryAddress } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function Home() {
  return <MailApp fromAddress={getPrimaryAddress()} fromName={getFromName()} />;
}
