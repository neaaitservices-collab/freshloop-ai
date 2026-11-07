import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { auth } from "@/auth";
import { RoleProvider } from "@/components/auth/RoleProvider";
import { OfflineSyncProvider } from "@/components/offline/OfflineSyncProvider";
import { getPublicSiteUrl } from "@/lib/env/server";
import "./globals.css";

const siteUrl = getPublicSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "FreshLoop AI • Yield Management & Recipe Rescue",
  description: "Cross-department yield management, invoice OCR, and recipe rescue for independent grocers.",
  openGraph: {
    title: "FreshLoop AI • Yield Management & Recipe Rescue",
    description: "Cross-department yield management, invoice OCR, and recipe rescue for independent grocers.",
    url: siteUrl,
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body
        suppressHydrationWarning
        className="flex min-h-full flex-col bg-slate-950 text-slate-100"
      >
        <RoleProvider session={session}>
          <OfflineSyncProvider>{children}</OfflineSyncProvider>
        </RoleProvider>
      </body>
    </html>
  );
}
