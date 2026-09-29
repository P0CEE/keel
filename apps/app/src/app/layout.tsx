import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import localFont from "next/font/local";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import { getCurrentLocale } from "@/locales/server";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3173";

// Wealthsimple Sans, as mint-pocs sets it (regular, medium, bold), so the
// app reads exactly as the reference. Exposed as --font-app, read by the
// tokens.
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
  // mint-pocs' mark: the SVG where it is supported, the .ico elsewhere
  // (and for the browsers that ask for /favicon.ico on their own).
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32" },
    ],
  },
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
  // Transitions stay on when the theme changes, as in mint-pocs: the sun
  // cross-fades into the moon, and the pressed button eases back from 0.94
  // instead of snapping (next-themes' `disableTransitionOnChange` did that).
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang={locale} className={appFont.variable} suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          nonce={nonce}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
