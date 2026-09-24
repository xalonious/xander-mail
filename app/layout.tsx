import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Xander Mail",
  description: "Private, single-user webmail client",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
