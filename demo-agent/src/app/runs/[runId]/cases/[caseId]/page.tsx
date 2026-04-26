import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, GitBranch, ShieldAlert } from "lucide-react";
import { StatusBadge, toneForDataClass, toneForDecision, toneForSeverity } from "@/components/status-badge";
import { getRunCaseView } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function RunCasePage({ params }: { params: Promise<{ runId: string; caseId: string }> }) {
  const { runId, caseId } = await params;
  const view = await getRunCaseView(runId, caseId);
  if (!view) notFound();
  const output = view.outputs.at(-1);

  return (
    <main className="shell">
      <Link className="back-link" href={`/cases/${caseId}`}><ArrowLeft size={14} /> Case</Link>
      <header className="page-header">
        <div>
          <p className="eyebrow mono">run · {runId.slice(0, 16)}…</p>
          <h1>{view.scenario.title}</h1>
          <p className="lead">{view.scenario.user_task}</p>
        </div>
        <div className="summary-strip">
          <StatusBadge tone={view.result?.attack_success ? "bad" : "good"}>
            attack {view.result?.attack_success ? "success" : "stopped"}
          </StatusBadge>
          <StatusBadge tone={view.result?.blocked_tool_calls ? "good" : "neutral"}>
            {view.result?.blocked_tool_calls ?? 0} blocked
          </StatusBadge>
          <StatusBadge tone={view.result?.sensitive_egress_count ? "bad" : "good"}>
            {view.result?.sensitive_egress_count ?? 0} egress
          </StatusBadge>
        </div>
      </header>

      <section className="two-col">
        <div className="panel">
          <div className="panel-heading"><h2><GitBranch size={14} /> Trace timeline</h2></div>
          {view.trace.length ? (
            <ol className="timeline">
              {view.trace.map((event) => (
                <li key={event.id}>
                  <div className="timeline-dot" />
                  <div className="timeline-body">
                    <div className="timeline-title">
                      <span>{event.event_type}</span>
                      {event.tool_name ? <span className="json-inline">{event.tool_name}</span> : null}
                      <StatusBadge tone={toneForDecision(event.policy_decision)}>{event.policy_decision ?? "n/a"}</StatusBadge>
                    </div>
                    {event.policy_reason ? <p>{event.policy_reason}</p> : null}
                    <div className="chip-row">
                      {event.source_table ? <StatusBadge tone="info">{event.source_table}:{event.source_id}</StatusBadge> : null}
                      {event.source_trust ? <StatusBadge tone={event.source_trust === "external" ? "warn" : "info"}>{event.source_trust}</StatusBadge> : null}
                      {event.data_class ? <StatusBadge tone={toneForDataClass(event.data_class)}>{event.data_class}</StatusBadge> : null}
                      {event.authority_scope ? <StatusBadge tone="neutral">{event.authority_scope}</StatusBadge> : null}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty">No trace events recorded.</div>
          )}
        </div>

        <div className="panel">
          <div className="panel-heading"><h2><ShieldAlert size={14} /> Findings</h2></div>
          <div className="panel-body">
            {view.findings.length ? view.findings.map((f) => (
              <article className="finding" key={f.id}>
                <div className="chip-row" style={{ marginBottom: 4 }}>
                  <StatusBadge tone={toneForSeverity(f.severity)}>{f.rule_code}</StatusBadge>
                  <StatusBadge tone={toneForSeverity(f.severity)}>{f.severity}</StatusBadge>
                </div>
                <h3>{f.title}</h3>
                {f.remediation ? <p>{f.remediation}</p> : null}
              </article>
            )) : <div className="empty">No policy findings recorded.</div>}
          </div>
        </div>
      </section>

      <section className="panel section-gap">
        <div className="panel-heading">
          <h2>Agent output</h2>
          {output ? <StatusBadge tone={toneForDecision(output.policy_decision)}>{output.policy_decision}</StatusBadge> : null}
        </div>
        {output ? (
          <pre className="json-pre">{formatJsonish(output.content)}</pre>
        ) : (
          <div className="empty">No output recorded.</div>
        )}
      </section>
    </main>
  );
}

function formatJsonish(value: string) {
  try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
}
