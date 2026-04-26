"use client";

import { useEffect, useState } from "react";
import { Layers, Shield, RefreshCw, Beaker } from "lucide-react";
import { StatusBadge, toneForOutcome, toneForSeverity, toneForStatus } from "@/components/status-badge";

type HardGateRule = {
  id?: string;
  rule_code: string;
  category: string;
  action: "allow" | "block" | "semantic_review";
  severity: string;
  rationale: string;
  safe_alternative: string | null;
  status: "proposed" | "approved" | "rejected";
  condition: Record<string, unknown>;
};

type ProposalResponse = {
  proposal: {
    rules: HardGateRule[];
    semanticRoutingMap: Record<string, string[]>;
    reviewPacket: { summary: string; criticalRules: number; toolCoverage: Array<{ tool: string; category: string; risk: string; defaultRouting: string[] }> };
  };
};

type EvidencePack = {
  id?: string;
  category: string;
  outcome: string;
  precedent_status: "candidate" | "approved" | "rejected";
  confidence: number;
  evaluator_summary: string;
  rejection_reason: string | null;
  case_id: string;
  run_id: string;
  decision_subject: Record<string, unknown>;
  source_context: Record<string, unknown>;
  trace_evidence: Record<string, unknown>;
  recommended_hard_gate: Record<string, unknown> | null;
};

type Tab = "hard-gates" | "evidence";

export function ScopePanels() {
  const [tab, setTab] = useState<Tab>("hard-gates");
  return (
    <>
      <div className="tabs">
        <button className={`tab${tab === "hard-gates" ? " active" : ""}`} onClick={() => setTab("hard-gates")} type="button">Hard gates</button>
        <button className={`tab${tab === "evidence" ? " active" : ""}`} onClick={() => setTab("evidence")} type="button">Evidence packs</button>
      </div>
      {tab === "hard-gates" ? <HardGates /> : <EvidencePacks />}
    </>
  );
}

/* ─────────────────────────── Hard Gates ─────────────────────────── */

function HardGates() {
  const [rules, setRules] = useState<HardGateRule[] | null>(null);
  const [proposal, setProposal] = useState<ProposalResponse["proposal"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scope/hard-gates?agentProfileId=agent_profile_support_vulnerable");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load hard gates");
      setRules(json.rules);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function draft() {
    setDrafting(true);
    setError(null);
    try {
      const res = await fetch("/api/scope/hard-gates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persist: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Draft failed");
      setProposal(json.proposal);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDrafting(false);
    }
  }

  async function patchStatus(rule: HardGateRule, status: "approved" | "rejected") {
    if (!rule.id) return;
    setPendingId(rule.id);
    try {
      const res = await fetch(`/api/scope/hard-gates/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      setRules((prev) => prev?.map((r) => r.id === rule.id ? { ...r, status } : r) ?? prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingId(null);
    }
  }

  useEffect(() => { load(); }, []);

  const approved = rules?.filter((r) => r.status === "approved").length ?? 0;
  const proposed = rules?.filter((r) => r.status === "proposed").length ?? 0;
  const rejected = rules?.filter((r) => r.status === "rejected").length ?? 0;

  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2><Shield size={14} /> Hard-gate rules</h2>
            <p>Approved rules become runtime ScopeTrace inputs. Proposed rules are awaiting review.</p>
          </div>
          <div className="btn-row">
            <button className="btn" disabled={loading} onClick={load} type="button">
              {loading ? <span className="spinner" /> : <RefreshCw size={14} />} Refresh
            </button>
            <button className="btn btn-accent" disabled={drafting} onClick={draft} type="button">
              {drafting ? <span className="spinner" /> : <Layers size={14} />} {drafting ? "Drafting…" : "Draft proposal"}
            </button>
          </div>
        </div>
        <div className="panel-body tight">
          <div className="chip-row">
            <StatusBadge tone="good">{approved} approved</StatusBadge>
            <StatusBadge tone="warn">{proposed} proposed</StatusBadge>
            <StatusBadge tone="bad">{rejected} rejected</StatusBadge>
          </div>
          {error ? <p className="error-text">{error}</p> : null}
        </div>
      </section>

      {proposal ? (
        <section className="panel section-gap">
          <div className="panel-heading"><h2>Latest proposal</h2></div>
          <div className="panel-body">
            <p className="muted-strong">{proposal.reviewPacket.summary}</p>
            <div className="chip-row" style={{ marginTop: 8 }}>
              <StatusBadge tone="bad">{proposal.reviewPacket.criticalRules} critical</StatusBadge>
              <StatusBadge tone="info">{proposal.reviewPacket.toolCoverage.length} tools mapped</StatusBadge>
            </div>
            <details style={{ marginTop: 12 }}>
              <summary className="muted-strong" style={{ cursor: "pointer", fontSize: 12 }}>Tool coverage ({proposal.reviewPacket.toolCoverage.length})</summary>
              <div className="table-wrap" style={{ marginTop: 10 }}>
                <table className="data-table compact">
                  <thead><tr><th>Tool</th><th>Category</th><th>Risk</th><th>Default routing</th></tr></thead>
                  <tbody>
                    {proposal.reviewPacket.toolCoverage.map((t) => (
                      <tr key={t.tool}>
                        <td className="mono">{t.tool}</td>
                        <td>{t.category}</td>
                        <td><StatusBadge tone={toneForSeverity(t.risk)}>{t.risk}</StatusBadge></td>
                        <td className="chip-row">{t.defaultRouting.map((c) => <StatusBadge key={c} tone="info">{c}</StatusBadge>)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </section>
      ) : null}

      <section className="panel section-gap">
        <div className="panel-heading"><h2>Rules</h2></div>
        <div className="panel-body flush">
          {!rules ? (
            <div className="empty"><span className="spinner" /> Loading rules…</div>
          ) : !rules.length ? (
            <div className="empty">No hard-gate rules yet. Draft a proposal to begin.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th>Rule</th>
                    <th>Category</th>
                    <th>Action</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Rationale</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr key={rule.id ?? rule.rule_code}>
                      <td className="mono">{rule.rule_code}</td>
                      <td>{rule.category}</td>
                      <td><StatusBadge tone={rule.action === "block" ? "bad" : rule.action === "allow" ? "good" : "info"}>{rule.action}</StatusBadge></td>
                      <td><StatusBadge tone={toneForSeverity(rule.severity)}>{rule.severity}</StatusBadge></td>
                      <td><StatusBadge tone={toneForStatus(rule.status)}>{rule.status}</StatusBadge></td>
                      <td className="muted-strong" style={{ maxWidth: 360 }}>{rule.rationale}{rule.safe_alternative ? <><br/><span className="muted">safe alt: {rule.safe_alternative}</span></> : null}</td>
                      <td className="row-actions">
                        {rule.status !== "approved" ? (
                          <button className="btn btn-sm btn-primary" disabled={pendingId === rule.id} onClick={() => patchStatus(rule, "approved")} type="button">Approve</button>
                        ) : null}
                        {rule.status !== "rejected" ? (
                          <button className="btn btn-sm btn-danger" disabled={pendingId === rule.id} onClick={() => patchStatus(rule, "rejected")} type="button">Reject</button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

/* ─────────────────────────── Evidence Packs ─────────────────────────── */

function EvidencePacks() {
  const [packs, setPacks] = useState<EvidencePack[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | "candidate" | "approved" | "rejected">("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ agentProfileId: "agent_profile_support_vulnerable", limit: "50" });
      if (statusFilter) params.set("status", statusFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      const res = await fetch(`/api/scope/evidence-packs?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load evidence packs");
      setPacks(json.evidencePacks);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function patchStatus(pack: EvidencePack, status: "approved" | "rejected") {
    if (!pack.id) return;
    setPendingId(pack.id);
    try {
      const res = await fetch(`/api/scope/evidence-packs/${pack.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      setPacks((prev) => prev?.map((p) => p.id === pack.id ? { ...p, precedent_status: status } : p) ?? prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingId(null);
    }
  }

  function toggleExpand(id?: string) {
    if (!id) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter, categoryFilter]);

  const approved = packs?.filter((p) => p.precedent_status === "approved").length ?? 0;
  const candidate = packs?.filter((p) => p.precedent_status === "candidate").length ?? 0;
  const rejected = packs?.filter((p) => p.precedent_status === "rejected").length ?? 0;

  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2><Beaker size={14} /> Evidence packs</h2>
            <p>Approved packs become semantic ScopeTrace precedents. Generate new packs from the campaign run page.</p>
          </div>
          <button className="btn" disabled={loading} onClick={load} type="button">
            {loading ? <span className="spinner" /> : <RefreshCw size={14} />} Refresh
          </button>
        </div>
        <div className="panel-body tight">
          <div className="chip-row" style={{ marginBottom: 12 }}>
            <StatusBadge tone="good">{approved} approved</StatusBadge>
            <StatusBadge tone="warn">{candidate} candidate</StatusBadge>
            <StatusBadge tone="bad">{rejected} rejected</StatusBadge>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <select className="select" style={{ maxWidth: 200 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
              <option value="">All statuses</option>
              <option value="candidate">Candidate</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <select className="select" style={{ maxWidth: 240 }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">All categories</option>
              {["authority_confusion","privileged_retrieval","sensitive_egress","unauthorized_action","memory_poisoning","source_laundering","overblocking","benign_allow","inconclusive"].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {error ? <p className="error-text">{error}</p> : null}
        </div>
      </section>

      <section className="panel section-gap">
        <div className="panel-body flush">
          {!packs ? (
            <div className="empty"><span className="spinner" /> Loading packs…</div>
          ) : !packs.length ? (
            <div className="empty">No evidence packs match your filter.</div>
          ) : (
            packs.map((pack) => {
              const isOpen = pack.id ? expanded.has(pack.id) : false;
              return (
                <article key={pack.id ?? pack.run_id} style={{ borderBottom: "1px solid var(--line-soft)", padding: "14px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="chip-row" style={{ marginBottom: 6 }}>
                        <StatusBadge tone="info">{pack.category}</StatusBadge>
                        <StatusBadge tone={toneForOutcome(pack.outcome)}>{pack.outcome}</StatusBadge>
                        <StatusBadge tone={toneForStatus(pack.precedent_status)}>{pack.precedent_status}</StatusBadge>
                        <StatusBadge tone={pack.confidence >= 0.75 ? "good" : pack.confidence >= 0.5 ? "warn" : "bad"}>
                          conf {pack.confidence.toFixed(2)}
                        </StatusBadge>
                      </div>
                      <p className="muted-strong" style={{ margin: 0, fontSize: 13 }}>{pack.evaluator_summary}</p>
                      <p className="muted" style={{ margin: "6px 0 0", fontSize: 12 }}>
                        <span className="mono">{pack.case_id}</span> · run <span className="mono">{pack.run_id.slice(0, 12)}…</span>
                        {pack.rejection_reason ? <> · {pack.rejection_reason}</> : null}
                      </p>
                    </div>
                    <div className="row-actions">
                      <button className="btn btn-sm" onClick={() => toggleExpand(pack.id)} type="button">{isOpen ? "Hide" : "Details"}</button>
                      {pack.precedent_status !== "approved" ? (
                        <button className="btn btn-sm btn-primary" disabled={pendingId === pack.id} onClick={() => patchStatus(pack, "approved")} type="button">Approve</button>
                      ) : null}
                      {pack.precedent_status !== "rejected" ? (
                        <button className="btn btn-sm btn-danger" disabled={pendingId === pack.id} onClick={() => patchStatus(pack, "rejected")} type="button">Reject</button>
                      ) : null}
                    </div>
                  </div>
                  {isOpen ? (
                    <div className="kv-grid" style={{ marginTop: 12 }}>
                      <JsonBlock label="Decision subject" data={pack.decision_subject} />
                      <JsonBlock label="Source context" data={pack.source_context} />
                      <JsonBlock label="Trace evidence" data={pack.trace_evidence} />
                      {pack.recommended_hard_gate ? <JsonBlock label="Recommended hard gate" data={pack.recommended_hard_gate} /> : null}
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </div>
      </section>
    </>
  );
}

function JsonBlock({ label, data }: { label: string; data: unknown }) {
  return (
    <div>
      <span className="field-label">{label}</span>
      <pre className="json-pre" style={{ borderRadius: 8, maxHeight: 260 }}>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
