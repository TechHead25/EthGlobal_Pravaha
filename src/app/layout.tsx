import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenAid Protocol — Decentralized Charitable Procurement",
  description: "Purpose-bound USDC escrow and conditional settlement engine powered by Arc, Arkiv, Chainlink CRE, and World IDKit.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-[#0a0e17] text-gray-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
