import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import localFont from "next/font/local";
import type { ReactNode } from "react";

import { SITE_URL } from "@/lib/seo";
import "./globals.css";

// Wealthsimple Sans, the app's face (regular, medium, bold), exposed as
// --font-app, which the Mint tokens read.
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

// Title, description and per-locale metadata are owned by `[locale]/layout.tsx`
// (see its `generateMetadata`). The root only sets app-wide defaults.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // mint-pocs' mark: the SVG where it is supported, the .ico elsewhere
  // (and for the browsers that ask for /favicon.ico on their own).
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32" },
    ],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={appFont.variable} suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
