import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TopNav } from "@/components/top-nav";
import { getAuthStatus } from "@/lib/openai/client";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ScopeTrace",
  description: "Enterprise AX agent red-team workflow",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuthStatus().catch(() => ({ loggedIn: false, provider: "none", model: "n/a" } as const));
  const label = auth.loggedIn ? `${auth.provider} · ${auth.model}` : "auth not ready";
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body>
        <TopNav authLabel={label} authOk={auth.loggedIn} />
        {children}
      </body>
    </html>
  );
}
