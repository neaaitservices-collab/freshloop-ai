import type { Metadata } from "next";
import type { Session } from "next-auth";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { RoleProvider } from "@/components/auth/RoleProvider";
import { RefreshOnBrowserHistory } from "@/components/auth/RefreshOnBrowserHistory";
import { OfflineSyncProvider } from "@/components/offline/OfflineSyncProvider";
import { AuthError, getSessionUser } from "@/lib/auth/session";
import { decidePageAccess, FRESH_PATH_HEADER } from "@/lib/auth/pageAccess";
import type { AuthSessionUser } from "@/lib/auth/staffSnapshot";
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
};

function sessionForClient(
  session: Session | null,
  fresh: AuthSessionUser | null
): Session | null {
  if (!fresh || !session?.user) return null;
  return {
    ...session,
    user: {
      ...session.user,
      id: fresh.id,
      name: fresh.name,
      email: fresh.email,
      role: fresh.role,
      position: fresh.position,
      hourlyRate: fresh.hourlyRate,
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let fresh: AuthSessionUser | null = null;
  try {
    fresh = await getSessionUser();
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }

  const headerList = await headers();
  const pathname = headerList.get(FRESH_PATH_HEADER) ?? "";
  if (pathname) {
    const decision = decidePageAccess(pathname, fresh);
    if (decision.action === "redirect") {
      redirect(decision.location);
    }
  }

  const session = sessionForClient(await auth(), fresh);
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
          <RefreshOnBrowserHistory />
          <OfflineSyncProvider>{children}</OfflineSyncProvider>
        </RoleProvider>
      </body>
    </html>
  );
}
