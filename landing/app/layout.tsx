import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PingCRM — AI Networking CRM | Open Source",
  description:
    "Upload your contacts, connect your accounts. Ping tells you who to reach out to and writes the message. Open source, self-hostable personal CRM.",
  openGraph: {
    title: "PingCRM — AI Networking CRM",
    description:
      "Upload your contacts, connect your accounts. Ping tells you who to reach out to and writes the message.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
