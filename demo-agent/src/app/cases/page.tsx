import Link from "next/link";
import { Activity, Database, ShieldAlert, ShieldCheck, ArrowRight } from "lucide-react";
import { getDashboardData } from "@/lib/repository";
import { StatusBadge } from "@/components/status-badge";

export const dynamic = "force-dynamic";

export default async function CasesPage() {
  const { summary, cases } = await getDashboardData();

  return (
    <main className="shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Cases</p>
          <h1>Scenario cases</h1>
          <p className="lead">
            Seeded enterprise scenarios with attack surfaces, expected findings, and the latest baseline status. Open a case to inspect its intent manifest, seed records, and run observe / enforce traces.
          </p>
        </div>
        <Link className="btn btn-accent" href="/campaign">
          Run red-team campaign <ArrowRight size={14} />
        </Link>
      </header>

      <section className="metric-grid">
        <Metric icon={<Database size={16} />} label="Cases" value={summary.totalCases} sub={`${summary.redTeamCases} red-team`} />
        <Metric icon={<ShieldAlert size={16} />} label="Observe attack success" value={summary.latestObserveAttackSuccess} sub="latest evidence" />
        <Metric icon={<ShieldCheck size={16} />} label="Enforce blocks" value={summary.latestEnforceBlockedCalls} sub="blocked tool calls" />
        <Metric icon={<Activity size={16} />} label="Control coverage" value={summary.benignControls + summary.positiveControls} sub="benign + positive" />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>All cases</h2>
            <p>External input → privileged retrieval → side-effect tool → output egress, tracked as replayable evidence.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Case</th>
                <th>Customer</th>
                <th>Type</th>
                <th>Surface</th>
                <th>Expected findings</th>
                <th>Latest</th>
              </tr>
            </thead>
            <tbody>
              {cases.length ? cases.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link className="row-link" href={`/cases/${item.id}`}>{item.id}</Link>
                    <span className="cell-sub">{item.title}</span>
                  </td>
                  <td>{item.customer_name ?? "—"}</td>
                  <td>
                    <StatusBadge tone={item.case_type === "red_team" ? "bad" : item.case_type === "positive_control" ? "info" : "good"}>
                      {item.case_type}
                    </StatusBadge>
                  </td>
                  <td className="muted-strong">{item.attack_surface}</td>
                  <td className="code-list">
                    {item.expected_findings.length ? (
                      <span className="muted-strong">{item.expected_findings.join(", ")}</span>
                    ) : <span className="muted">none</span>}
                  </td>
                  <td>
                    <StatusBadge tone={item.latest_status === "blocked" ? "good" : item.latest_status === "attack-success" ? "bad" : "neutral"}>
                      {item.latest_status ?? "not run"}
                    </StatusBadge>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={6}><div className="empty">No cases seeded yet.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Metric({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number; sub: string }) {
  return (
    <div className="metric">
      <div className="metric-icon">{icon}</div>
      <div className="metric-body">
        <p className="metric-label">{label}</p>
        <strong className="metric-value">{value}</strong>
        <span className="metric-sub">{sub}</span>
      </div>
    </div>
  );
}
