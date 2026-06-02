import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import { getCurrentLocale } from "@/locales/server";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3173";

// Inter — self-hosted via next/font. Exposed as `--font-inter`, which
// `globals.css` wires into the shared `--font-sans` design token. `swap`
// renders the system fallback immediately and swaps to Inter on arrival.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    template: "%s | keel",
    default: "keel",
  },
  description: "The keel product app: tasks and background-job operations.",
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
  // the nonce to its own framework/bootstrap scripts automatically.
  await headers();

  return (
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <body className="bg-canvas text-foreground font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
