import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { RunControls } from "@/components/run-controls";
import { StatusBadge, toneForDataClass } from "@/components/status-badge";
import { getCaseDetails } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function CasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const details = await getCaseDetails(caseId);
  if (!details) notFound();

  return (
    <main className="shell">
      <Link className="back-link" href="/cases"><ArrowLeft size={14} /> Cases</Link>
      <header className="page-header">
        <div>
          <p className="eyebrow">{details.scenario.customer_name ?? details.scenario.customer_id} · {details.scenario.case_type}</p>
          <h1>{details.scenario.title}</h1>
          <p className="lead">{details.scenario.user_task}</p>
        </div>
        <RunControls caseId={details.scenario.id} />
      </header>

      <section className="two-col">
        <div className="panel">
          <div className="panel-heading"><h2>Intent manifest</h2></div>
          {details.manifest ? (
            <div className="panel-body">
              <div className="kv-grid">
                <ManifestBlock label="Allowed tools" items={details.manifest.allowed_tools} tone="good" />
                <ManifestBlock label="Blocked tools" items={details.manifest.blocked_tools} tone="bad" />
                <ManifestBlock label="Allowed sources" items={details.manifest.allowed_sources} tone="good" />
                <ManifestBlock label="Blocked sources" items={details.manifest.blocked_sources} tone="warn" />
                <ManifestBlock label="Blocked output classes" items={details.manifest.blocked_output_data_classes} tone="bad" />
                <div>
                  <span className="field-label">Recipient</span>
                  <StatusBadge tone={details.manifest.external_recipient ? "warn" : "info"}>
                    {details.manifest.external_recipient ? "external_customer" : "internal_user"}
                  </StatusBadge>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty">No intent manifest for this case.</div>
          )}
        </div>

        <div className="panel">
          <div className="panel-heading"><h2>Expected policy surface</h2></div>
          <div className="panel-body">
            <div style={{ display: "grid", gap: 14 }}>
              <ManifestBlock label="Findings" items={details.scenario.expected_findings} tone="bad" />
              <ManifestBlock label="Forbidden tools" items={details.scenario.expected_forbidden_tools} tone="warn" />
              <ManifestBlock label="Forbidden output classes" items={details.scenario.expected_forbidden_data_classes ?? []} tone="bad" />
            </div>
          </div>
        </div>
      </section>

      <section className="panel section-gap">
        <div className="panel-heading"><h2>Seed records</h2><p>Attack source, sensitive target, and safe alternative records seeded for this case.</p></div>
        <div className="table-wrap">
          <table className="data-table compact">
            <thead>
              <tr>
                <th>Role</th>
                <th>Source</th>
                <th>Label</th>
                <th>Trust</th>
                <th>Data class</th>
                <th>Egress</th>
              </tr>
            </thead>
            <tbody>
              {details.seedRecords.length ? details.seedRecords.map((record) => (
                <tr key={`${record.role_in_case}-${record.source_table}-${record.source_id}`}>
                  <td>{record.role_in_case ?? "—"}</td>
                  <td className="mono">{record.source_table}:{record.source_id}</td>
                  <td>{record.label ?? "—"}</td>
                  <td><StatusBadge tone={record.source_trust === "external" ? "warn" : "info"}>{record.source_trust ?? "—"}</StatusBadge></td>
                  <td><StatusBadge tone={toneForDataClass(record.data_class)}>{record.data_class ?? "—"}</StatusBadge></td>
                  <td className="mono muted-strong">{record.egress_policy ?? "—"}</td>
                </tr>
              )) : (
                <tr><td colSpan={6}><div className="empty">No seed records.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {details.latestResults.length ? (
        <section className="panel section-gap">
          <div className="panel-heading"><h2>Recent runs</h2></div>
          <div className="table-wrap">
            <table className="data-table compact">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Mode</th>
                  <th>Attack</th>
                  <th>Blocks</th>
                  <th>Egress</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {details.latestResults.map((r) => (
                  <tr key={r.run_id}>
                    <td><Link className="row-link" href={`/runs/${r.run_id}/cases/${details.scenario.id}`}>{r.run_id.slice(0, 12)}…</Link></td>
                    <td><StatusBadge tone="info">{r.mode}</StatusBadge></td>
                    <td><StatusBadge tone={r.attack_success ? "bad" : "good"}>{r.attack_success ? "success" : "stopped"}</StatusBadge></td>
                    <td className="mono">{r.blocked_tool_calls}</td>
                    <td className="mono">{r.sensitive_egress_count}</td>
                    <td className="muted">{new Date(r.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function ManifestBlock({ label, items, tone }: { label: string; items: string[]; tone: "good" | "warn" | "bad" | "info" }) {
  return (
    <div>
      <span className="field-label">{label}</span>
      <div className="chip-row">
        {items.length ? items.map((item) => <StatusBadge key={item} tone={tone}>{item}</StatusBadge>) : <span className="muted">none</span>}
      </div>
    </div>
  );
}
