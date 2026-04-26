import Link from "next/link";
import { ArrowRight, Beaker, Database, Search, Shield, Sparkles, UserPlus } from "lucide-react";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="shell-narrow" style={{ paddingTop: 56 }}>
      <section style={{ textAlign: "center", marginBottom: 36 }}>
        <p className="eyebrow" style={{ marginBottom: 14 }}>ScopeTrace</p>
        <h1 style={{ fontSize: 38, fontWeight: 600, letterSpacing: "-0.02em", margin: "0 0 14px" }}>
          Red-team your enterprise AI agent.
        </h1>
        <p className="lead" style={{ margin: "0 auto", maxWidth: 580, color: "var(--muted-strong)", fontSize: 15, lineHeight: 1.6 }}>
          Prove whether untrusted external input can breach your agent&apos;s authority boundaries — then ship policy patches with replayable evidence.
        </p>
        <div className="btn-row" style={{ justifyContent: "center", marginTop: 26 }}>
          <Link className="btn btn-primary" href="/agents/new">
            <UserPlus size={14} /> Register an agent <ArrowRight size={14} />
          </Link>
          <Link className="btn" href="/cases">
            <Database size={14} /> Browse seeded cases
          </Link>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        <ActionCard href="/campaign" icon={<Sparkles size={16} />} title="Run a campaign" body="Convert a red-team goal into structured attack strategies and run specialist attackers in parallel." />
        <ActionCard href="/scope" icon={<Shield size={16} />} title="Review scope policy" body="Draft and approve hard-gate rules and evidence-pack precedents that drive runtime decisions." />
        <ActionCard href="/inspect" icon={<Search size={16} />} title="Inspect a decision" body="Probe how ScopeTrace would judge a proposed tool call — without executing it." />
        <ActionCard href="/replay" icon={<Beaker size={16} />} title="Replay observe vs enforce" body="Compare baseline attack success against guarded execution on the same seeded cases." />
      </section>
    </main>
  );
}

function ActionCard({ href, icon, title, body }: { href: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <Link href={href} className="panel" style={{ display: "block", padding: 18, textDecoration: "none", transition: "border-color 0.15s, transform 0.15s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: 6, background: "rgba(110,183,255,.10)", color: "var(--accent)" }}>{icon}</span>
        <strong style={{ fontSize: 14 }}>{title}</strong>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>{body}</p>
    </Link>
  );
}
