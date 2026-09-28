import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import localFont from "next/font/local";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import { getCurrentLocale } from "@/locales/server";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3173";

// Wealthsimple Sans, as mint-pocs sets it (regular, medium, bold), so the
// shell reads exactly as the reference while it is being ported. It is
// proprietary: it must be replaced by a licensed face before production.
// Exposed as --font-app, read by the tokens.
const appFont = localFont({
  src: [
    {
      path: "./fonts/wealthsimple-sans-display-regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/wealthsimple-sans-display-medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/wealthsimple-sans-display-bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-app",
  display: "swap",
  fallback: ["-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    template: "%s | ramnn",
    default: "ramnn",
  },
  description: "ramnn: personal and household finance.",
  icons: { icon: "/favicon.svg" },
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getCurrentLocale().catch(() => "en");

  // Reading the nonce header set by `src/proxy.ts` forces dynamic rendering,
  // which is required so every request gets a fresh CSP nonce. Next attaches
  // it to its own scripts; next-themes gets it for its inline theme script,
  // which the CSP would otherwise block (and the page would flash).
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang={locale} className={appFont.variable} suppressHydrationWarning>
      <body className="bg-canvas text-foreground font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
