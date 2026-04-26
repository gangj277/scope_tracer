import Link from "next/link";
import { ShieldAlert, ShieldCheck, ArrowRight } from "lucide-react";
import { ReplayAllButton } from "@/components/replay-all-button";
import { StatusBadge } from "@/components/status-badge";
import { getReplayData } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function ReplayPage() {
  const replay = await getReplayData();
  const latest = replay.sessions[0];

  const redTeamRows = replay.rows.filter((r) => r.case_type === "red_team");
  const baselineSuccess = redTeamRows.filter((r) => r.baseline_attack_success === true).length;
  const enforceSuccess = redTeamRows.filter((r) => r.enforce_attack_success === true).length;
  const blockedDelta = baselineSuccess - enforceSuccess;
  const totalBlocks = replay.rows.reduce((acc, r) => acc + (r.enforce_blocked_tool_calls ?? 0), 0);
  const totalEgressBlocked = replay.rows.reduce((acc, r) => acc + (r.enforce_sensitive_egress_count ?? 0), 0);

  return (
    <main className="shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Replay · Observe vs Enforce</p>
          <h1>Same attacks, two policy modes</h1>
          <p className="lead">Run the seeded red-team cases twice — once with logging only, once with ScopeTrace enforcement. Compare attack success rates to prove the policy works without breaking benign tasks.</p>
        </div>
        <ReplayAllButton />
      </header>

      <section className="panel" style={{ padding: 0, marginBottom: 18 }}>
        <div className="hero-grid" style={{ borderRadius: 10, border: 0 }}>
          <div className="hero-tile bad">
            <p className="label">Without ScopeTrace</p>
            <span className="value">{baselineSuccess}</span>
            <span className="sub">attacks succeeded out of {redTeamRows.length} red-team cases</span>
          </div>
          <div className="hero-arrow"><ArrowRight size={22} /></div>
          <div className="hero-tile good">
            <p className="label">With ScopeTrace</p>
            <span className="value">{enforceSuccess}</span>
            <span className="sub">{blockedDelta > 0 ? `${blockedDelta} attacks blocked` : "no change"} · {totalBlocks} tool calls denied</span>
          </div>
        </div>
      </section>

      <section className="metric-grid">
        <Metric label="Cases replayed" value={String(redTeamRows.length)} sub="red-team only" />
        <Metric label="Attack delta" value={`-${blockedDelta}`} sub="prevented breaches" />
        <Metric label="Tool calls blocked" value={String(totalBlocks)} sub="under enforce" />
        <Metric label="Egress prevented" value={String(totalEgressBlocked)} sub="sensitive output" />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Per-case proof</h2>
            <p>Each row shows whether the same attack succeeded with logging only vs with enforcement.</p>
          </div>
          {latest ? (
            <span className="muted mono" style={{ fontSize: 11 }}>session {latest.id.slice(0, 14)}…</span>
          ) : null}
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Case</th>
                <th>Type</th>
                <th>Observe</th>
                <th></th>
                <th>Enforce</th>
                <th>Blocks</th>
                <th>Egress</th>
              </tr>
            </thead>
            <tbody>
              {replay.rows.length ? replay.rows.map((row) => {
                const wasBreach = row.baseline_attack_success === true;
                const stillBreach = row.enforce_attack_success === true;
                const blocked = wasBreach && !stillBreach;
                return (
                  <tr key={row.case_id}>
                    <td>
                      <Link className="row-link" href={`/cases/${row.case_id}`}>{row.case_id}</Link>
                      <span className="cell-sub">{row.title}</span>
                    </td>
                    <td><StatusBadge tone={row.case_type === "red_team" ? "bad" : "good"}>{row.case_type}</StatusBadge></td>
                    <td><StatusBadge tone={wasBreach ? "bad" : "good"}>{wasBreach ? "breached" : "held"}</StatusBadge></td>
                    <td style={{ textAlign: "center", color: blocked ? "var(--good)" : "var(--muted)" }}>
                      {blocked ? <ArrowRight size={14} /> : "·"}
                    </td>
                    <td><StatusBadge tone={stillBreach ? "bad" : "good"}>{stillBreach ? "breached" : "held"}</StatusBadge></td>
                    <td className="mono">{row.enforce_blocked_tool_calls ?? 0}</td>
                    <td className="mono">{row.enforce_sensitive_egress_count ?? 0}</td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={7}><div className="empty">No replay sessions yet — click &ldquo;Replay red-team suite&rdquo; above.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {!latest ? (
        <p className="muted" style={{ marginTop: 14, fontSize: 12, textAlign: "center" }}>
          A replay session runs every selected case twice (observe + enforce) and stores both runs as a paired session.
        </p>
      ) : null}
    </main>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="metric">
      <div className="metric-body">
        <p className="metric-label">{label}</p>
        <strong className="metric-value">{value}</strong>
        <span className="metric-sub">{sub}</span>
      </div>
    </div>
  );
}
