"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/cases", label: "Cases", match: (p: string) => p.startsWith("/cases") || p.startsWith("/runs") },
  { href: "/campaign", label: "Campaign", match: (p: string) => p.startsWith("/campaign") },
  { href: "/scope", label: "Scope", match: (p: string) => p.startsWith("/scope") },
  { href: "/inspect", label: "Inspect", match: (p: string) => p.startsWith("/inspect") },
  { href: "/replay", label: "Replay", match: (p: string) => p.startsWith("/replay") },
];

export function TopNav({ authLabel, authOk }: { authLabel: string; authOk: boolean }) {
  const pathname = usePathname() ?? "/";
  return (
    <div className="nav-wrap">
      <nav className="nav" aria-label="Primary">
        <Link href="/" className="nav-brand">
          <span className="nav-brand-dot" />
          ScopeTrace
        </Link>
        <div className="nav-links">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`nav-link${link.match(pathname) ? " active" : ""}`}
            >
              {link.label}
            </Link>
          ))}
        </div>
        <div className="nav-aside">
          <span
            className="nav-brand-dot"
            style={{ background: authOk ? "var(--good)" : "var(--bad)", boxShadow: authOk ? "0 0 0 3px rgba(57,211,159,.15)" : "0 0 0 3px rgba(255,107,107,.15)" }}
          />
          <span className="mono">{authLabel}</span>
        </div>
      </nav>
    </div>
  );
}
