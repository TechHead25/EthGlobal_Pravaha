import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/components/theme/theme-provider";
import { ThemedToaster } from "@/components/theme/themed-toaster";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-display", display: "swap", axes: ["opsz"] });

export const metadata: Metadata = {
  applicationName: "OpenAid Protocol",
  title: {
    default: "OpenAid Protocol — Accountable humanitarian procurement",
    template: "%s · OpenAid Protocol",
  },
  description:
    "OpenAid connects humanitarian funding, sealed-bid procurement, delivery evidence, and validator-gated settlement in a publicly verifiable escrow on Arc Testnet.",
  keywords: ["OpenAid", "Humanitarian Aid", "Web3 Escrow", "Arc Testnet", "Circle USDC", "Chainlink CRE"],
  authors: [{ name: "OpenAid Protocol" }],
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: {
    title: "OpenAid Protocol — Accountable Humanitarian Procurement",
    description: "Decentralized charitable procurement and staged settlement protocol on Arc Testnet.",
    siteName: "OpenAid Protocol",
    locale: "en_US",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0b1020",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // The init script sets the `dark` class before hydration, so the attribute may differ from SSR.
    <html lang="en" className={`${sans.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans">
        <ThemeProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:shadow-lg"
          >
            Skip to content
          </a>
          {children}
          <ThemedToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
