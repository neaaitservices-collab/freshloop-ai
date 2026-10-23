import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { RoleProvider } from "@/components/auth/RoleProvider";
import { getPublicSiteUrl } from "@/lib/env/server";
import "./globals.css";

const siteUrl = getPublicSiteUrl();

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "FreshLoop AI • Yield Management & Recipe Rescue",
  description: "Cross-department yield management, invoice OCR, voice floor logging, and recipe rescue for independent grocers.",
  openGraph: {
    title: "FreshLoop AI • Yield Management & Recipe Rescue",
    description: "Cross-department yield management, invoice OCR, voice floor logging, and recipe rescue for independent grocers.",
    url: siteUrl,
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-slate-950 text-slate-100">
        <RoleProvider>{children}</RoleProvider>
      </body>
    </html>
  );
}
