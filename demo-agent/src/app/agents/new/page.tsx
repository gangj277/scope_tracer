import Link from "next/link";
import { ArrowLeft, ArrowRight, Cog, Database, Shield, ShieldCheck, AlertCircle, Sparkles } from "lucide-react";
import { StatusBadge, toneForDataClass, toneForSeverity } from "@/components/status-badge";
import { getToolRegistry, getHardGateRules } from "@/lib/repository";
import { buildDemoAgentProfileSpec, classifyToolCategory } from "@/lib/scope/hard-gate-architect";
import { InitButton } from "./init-button";

export const dynamic = "force-dynamic";

export default async function RegisterAgentPage() {
  const [toolRegistry, rules] = await Promise.all([
    getToolRegistry(),
    getHardGateRules("agent_profile_support_vulnerable"),
  ]);
  const spec = buildDemoAgentProfileSpec(toolRegistry);
  const initialized = rules.length > 0;
  const proposed = rules.filter((r) => r.status === "proposed").length;
  const approved = rules.filter((r) => r.status === "approved").length;
  const rejected = rules.filter((r) => r.status === "rejected").length;

  return (
    <main className="shell">
      <Link className="back-link" href="/"><ArrowLeft size={14} /> Home</Link>
      <header className="page-header">
        <div>
          <p className="eyebrow">Agent onboarding · Step 1</p>
          <h1>Register agent &amp; initialize ScopeTrace</h1>
          <p className="lead">
            ScopeTrace reads the registered agent profile — its tools, data sources, and authority scopes — and drafts an initial hard-gate policy. You then review, approve, and the policy becomes the runtime decision input.
          </p>
        </div>
        <div className="summary-strip">
          <StatusBadge tone={initialized ? "good" : "warn"}>
            {initialized ? "ScopeTrace initialized" : "Not initialized"}
          </StatusBadge>
          {initialized ? (
            <>
              <StatusBadge tone="warn">{proposed} proposed</StatusBadge>
              <StatusBadge tone="good">{approved} approved</StatusBadge>
              {rejected ? <StatusBadge tone="bad">{rejected} rejected</StatusBadge> : null}
            </>
          ) : null}
        </div>
      </header>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2><Cog size={14} /> Registered agent profile</h2>
            <p>Read from the agent registry. The hard-gate architect will derive its initial proposal from this surface.</p>
          </div>
          <span className="badge tone-info mono">{spec.agentProfileId}</span>
        </div>
        <div className="panel-body">
          <div className="kv-grid">
            <KV label="Agent name">{spec.agentName}</KV>
            <KV label="Role">{spec.agentRole}</KV>
            <KV label="Workflows">
              <div className="chip-row">{spec.workflows.map((w) => <StatusBadge key={w} tone="info">{w}</StatusBadge>)}</div>
            </KV>
            <KV label="Recipients">
              <div className="chip-row">{spec.recipients.map((r) => <StatusBadge key={r} tone={r === "external_customer" ? "warn" : "info"}>{r}</StatusBadge>)}</div>
            </KV>
          </div>
        </div>
      </section>

      <section className="two-col section-gap">
        <div className="panel">
          <div className="panel-heading">
            <h2><Cog size={14} /> Tools ({spec.tools.length})</h2>
            <p>Categorised by side-effect surface. High-risk tools are routed through hard gates by default.</p>
          </div>
          <div className="table-wrap">
            <table className="data-table compact">
              <thead><tr><th>Tool</th><th>Category</th><th>Risk</th><th>Effects</th></tr></thead>
              <tbody>
                {spec.tools.map((t) => {
                  const reg = toolRegistry.get(t.name);
                  const cat = t.category ?? classifyToolCategory(t.name, reg);
                  return (
                    <tr key={t.name}>
                      <td className="mono">{t.name}</td>
                      <td><StatusBadge tone={cat === "egress" || cat === "write" ? "warn" : "info"}>{cat}</StatusBadge></td>
                      <td><StatusBadge tone={toneForSeverity(t.riskLevel ?? "low")}>{t.riskLevel ?? "low"}</StatusBadge></td>
                      <td>
                        <div className="chip-row">
                          {t.sideEffect ? <StatusBadge tone="warn">side-effect</StatusBadge> : null}
                          {t.externalEgress ? <StatusBadge tone="bad">external egress</StatusBadge> : null}
                          {!t.sideEffect && !t.externalEgress ? <span className="muted">read-only</span> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h2><Database size={14} /> Data sources ({spec.dataSources.length})</h2>
            <p>Trust + data class + authority scope determine which combinations create scope-violation risk.</p>
          </div>
          <div className="table-wrap">
            <table className="data-table compact">
              <thead><tr><th>Source</th><th>Trust</th><th>Data</th><th>Authority</th></tr></thead>
              <tbody>
                {spec.dataSources.map((s) => (
                  <tr key={s.sourceTable}>
                    <td className="mono">{s.sourceTable}</td>
                    <td><StatusBadge tone={s.sourceTrust === "external" ? "warn" : "info"}>{s.sourceTrust}</StatusBadge></td>
                    <td><StatusBadge tone={toneForDataClass(s.dataClass)}>{s.dataClass}</StatusBadge></td>
                    <td className="muted-strong">{s.authorityScope}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="panel section-gap">
        <div className="panel-heading">
          <div>
            <h2><Shield size={14} /> ScopeTrace policy state</h2>
            <p>{initialized
              ? "The hard-gate architect has already produced an initial proposal. Review and approve to activate runtime enforcement."
              : "No hard-gate rules exist for this agent yet. Initialize ScopeTrace to draft the first proposal from the profile above."}</p>
          </div>
        </div>
        <div className="panel-body">
          {initialized ? (
            <>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 8, background: "rgba(57,211,159,.06)" }}>
                <ShieldCheck size={18} style={{ color: "var(--good)", marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <strong style={{ display: "block", marginBottom: 4 }}>{rules.length} rules drafted · {approved} approved</strong>
                  <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                    Approved rules are active in <span className="mono">/api/scope/decision</span>.
                    {proposed > 0 ? <> {proposed} rules still need your review.</> : null}
                  </p>
                </div>
              </div>
              <div className="btn-row" style={{ marginTop: 16 }}>
                <Link className="btn btn-accent" href="/scope">
                  Review hard-gate rules <ArrowRight size={14} />
                </Link>
                <InitButton label="Re-initialize" mode="reinit" />
              </div>
              <p className="field-help" style={{ marginTop: 10 }}>
                Re-initializing drafts another proposal set. Existing rules are kept.
              </p>
            </>
          ) : (
            <>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", border: "1px solid rgba(244,201,93,.35)", borderRadius: 8, background: "rgba(244,201,93,.06)" }}>
                <AlertCircle size={18} style={{ color: "var(--warn)", marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <strong style={{ display: "block", marginBottom: 4 }}>ScopeTrace has no policy for this agent yet.</strong>
                  <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                    Initialization runs the hard-gate architect against the profile above and produces a proposed rule set covering authority confusion, privileged retrieval, sensitive egress, side-effect mutations, and memory poisoning.
                  </p>
                </div>
              </div>
              <div className="btn-row" style={{ marginTop: 16 }}>
                <InitButton label="Initialize ScopeTrace policy" mode="init" />
                <Link className="btn" href="/cases">Skip · browse cases</Link>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="panel section-gap">
        <div className="panel-heading">
          <div>
            <h2><Sparkles size={14} /> Run a red-team campaign</h2>
            <p>Generate attack strategies from a red-team goal and run specialist attackers in parallel against this agent. Each finding flows back as an evidence pack you can approve as a new ScopeTrace precedent.</p>
          </div>
        </div>
        <div className="panel-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 14 }}>
            <Stage n={1} label="Goal" body="Describe the unsafe behaviour to elicit." />
            <Stage n={2} label="Plan" body="Planner produces 1–6 strategies tied to A1–A4 attack families." />
            <Stage n={3} label="Parallel run" body="5–10 turn specialist attackers run against the agent." />
            <Stage n={4} label="Evidence" body="Findings become EvidencePacks pending review in Scope." />
          </div>
          {!initialized ? (
            <p className="field-help" style={{ marginBottom: 12 }}>
              You can run a campaign before initializing — it captures a baseline. Initializing first lets you compare observe vs enforce.
            </p>
          ) : null}
          <div className="btn-row">
            <Link className="btn btn-primary" href="/campaign">
              <Sparkles size={14} /> Start red-team campaign <ArrowRight size={14} />
            </Link>
            <Link className="btn" href="/replay">Replay observe vs enforce</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function Stage({ n, label, body }: { n: number; label: string; body: string }) {
  return (
    <div style={{ padding: 12, border: "1px solid var(--line)", borderRadius: 8, background: "var(--background-elev)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: "50%", border: "1px solid var(--line)", background: "var(--panel-strong)", fontSize: 11, fontWeight: 600, color: "var(--accent)" }}>{n}</span>
        <strong style={{ fontSize: 13 }}>{label}</strong>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>{body}</p>
    </div>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="field-label">{label}</span>
      <div style={{ fontSize: 13, color: "var(--muted-strong)" }}>{children}</div>
    </div>
  );
}
