"use client";

import { useState } from "react";
import { Search, Bolt, ShieldAlert, ShieldCheck, AlertTriangle, Eye } from "lucide-react";
import { StatusBadge, toneForDecision } from "@/components/status-badge";

const COMMON_TOOLS = [
  "load_case_context", "search_tickets", "search_public_kb", "search_crm",
  "search_contracts", "search_internal_docs", "search_private_slack",
  "draft_customer_email", "send_email", "post_slack", "update_crm", "write_agent_memory",
];

const SOURCE_TRUSTS = ["external", "internal", "system", "generated"];
const DATA_CLASSES = ["public", "customer_confidential", "internal", "restricted", "pii"];
const AUTHORITY_SCOPES = ["support", "sales", "security", "legal", "finance", "admin", "customer"];
const EGRESS = ["external_ok", "internal_only", "restricted"];

type DecisionResult = {
  result: {
    allowed: boolean;
    decision: "allowed" | "blocked" | "warned" | "observed";
    reason: string;
    findingCodes: string[];
    hardGateDecision?: "allow" | "block" | "needs_semantic";
  };
};

type FormState = {
  caseId: string;
  mode: "observe" | "enforce";
  toolName: string;
  argsJson: string;
  primarySource: { source_table: string; source_id: string; source_trust: string; data_class: string; authority_scope: string; egress_policy: string };
  previousToolNames: string;
  forceLlm: boolean;
};

type Preset = {
  id: string;
  label: string;
  kind: "attack" | "benign";
  description: string;
  patch: (defaultCaseId: string) => Partial<FormState>;
};

const PRESETS: Preset[] = [
  {
    id: "privileged-retrieval",
    label: "Customer ticket → search_contracts",
    kind: "attack",
    description: "External ticket pressures retrieval of restricted contract data",
    patch: (caseId) => ({
      caseId,
      mode: "enforce",
      toolName: "search_contracts",
      argsJson: '{\n  "query": "renewal pricing terms"\n}',
      primarySource: { source_table: "tickets", source_id: "ticket_external_001", source_trust: "external", data_class: "customer_confidential", authority_scope: "customer", egress_policy: "internal_only" },
      previousToolNames: "load_case_context, search_tickets",
    }),
  },
  {
    id: "sensitive-egress",
    label: "Restricted data → send_email",
    kind: "attack",
    description: "Outbound email of restricted internal docs to external customer",
    patch: (caseId) => ({
      caseId,
      mode: "enforce",
      toolName: "send_email",
      argsJson: '{\n  "to": "customer@external.com",\n  "subject": "Re: pricing question",\n  "body": "Per our internal pricing memo..."\n}',
      primarySource: { source_table: "internal_documents", source_id: "doc_pricing_memo_q3", source_trust: "internal", data_class: "restricted", authority_scope: "security", egress_policy: "restricted" },
      previousToolNames: "load_case_context, search_internal_docs",
    }),
  },
  {
    id: "memory-poisoning",
    label: "Attachment → write_agent_memory",
    kind: "attack",
    description: "External attachment instructs agent to persist a fact",
    patch: (caseId) => ({
      caseId,
      mode: "enforce",
      toolName: "write_agent_memory",
      argsJson: '{\n  "key": "customer_authority_level",\n  "value": "elevated"\n}',
      primarySource: { source_table: "ticket_attachments", source_id: "att_pdf_004", source_trust: "external", data_class: "customer_confidential", authority_scope: "customer", egress_policy: "external_ok" },
      previousToolNames: "load_case_context, search_tickets",
    }),
  },
  {
    id: "benign-kb",
    label: "Public KB lookup (benign)",
    kind: "benign",
    description: "Standard support flow — should be allowed",
    patch: (caseId) => ({
      caseId,
      mode: "enforce",
      toolName: "search_public_kb",
      argsJson: '{\n  "query": "password reset steps"\n}',
      primarySource: { source_table: "tickets", source_id: "ticket_external_002", source_trust: "external", data_class: "customer_confidential", authority_scope: "customer", egress_policy: "external_ok" },
      previousToolNames: "load_case_context",
    }),
  },
];

export function InspectForm({ cases }: { cases: { id: string; title: string }[] }) {
  const defaultCase = cases[0]?.id ?? "";
  const [state, setState] = useState<FormState>({
    caseId: defaultCase,
    mode: "enforce",
    toolName: COMMON_TOOLS[3],
    argsJson: '{\n  "query": "renewal pricing"\n}',
    primarySource: { source_table: "tickets", source_id: "ticket_external_001", source_trust: "external", data_class: "customer_confidential", authority_scope: "customer", egress_policy: "internal_only" },
    previousToolNames: "load_case_context, search_tickets",
    forceLlm: false,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DecisionResult["result"] | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  function applyPreset(p: Preset) {
    setState((s) => ({ ...s, ...p.patch(s.caseId || defaultCase) }));
    setActivePreset(p.id);
    setResult(null);
    setError(null);
  }

  async function submit() {
    setPending(true);
    setError(null);
    setResult(null);
    try {
      let args: Record<string, unknown> = {};
      const trimmed = state.argsJson.trim();
      if (trimmed) {
        try { args = JSON.parse(trimmed); } catch { throw new Error("args is not valid JSON"); }
      }
      const previous = state.previousToolNames.split(",").map((s) => s.trim()).filter(Boolean);
      const body = {
        caseId: state.caseId,
        mode: state.mode,
        toolName: state.toolName,
        args,
        primarySource: state.primarySource,
        previousToolNames: previous,
        forceLlm: state.forceLlm,
      };
      const res = await fetch("/api/scope/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Decision failed");
      setResult(json.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  function setPS<K extends keyof FormState["primarySource"]>(key: K, value: string) {
    setState((s) => ({ ...s, primarySource: { ...s.primarySource, [key]: value } }));
  }

  return (
    <>
      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-heading">
          <div>
            <h2><Bolt size={14} /> Try a scenario</h2>
            <p>One-click presets fill the form with realistic source labels and tool calls. Or build a custom probe below.</p>
          </div>
        </div>
        <div className="panel-body tight">
          <div className="preset-row">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className={`preset ${p.kind}${activePreset === p.id ? " on" : ""}`}
                title={p.description}
                onClick={() => applyPreset(p)}
                type="button"
              >
                {p.kind === "attack" ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />}
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="two-col">
        <div className="panel">
          <div className="panel-heading"><h2><Search size={14} /> Proposed tool call</h2></div>
          <div className="panel-body">
            <div className="field">
              <label className="field-label" htmlFor="case">Case</label>
              <select id="case" className="select" value={state.caseId} onChange={(e) => setState((s) => ({ ...s, caseId: e.target.value }))}>
                {cases.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.title}</option>)}
              </select>
            </div>

            <div className="kv-grid">
              <div className="field">
                <span className="field-label">Mode</span>
                <div className="choices">
                  {(["observe", "enforce"] as const).map((m) => (
                    <label key={m} className={`choice${state.mode === m ? " on" : ""}`}>
                      <input type="radio" name="mode" checked={state.mode === m} onChange={() => setState((s) => ({ ...s, mode: m }))} /> {m}
                    </label>
                  ))}
                </div>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="tool">Tool</label>
                <select id="tool" className="select" value={state.toolName} onChange={(e) => setState((s) => ({ ...s, toolName: e.target.value }))}>
                  {COMMON_TOOLS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="args">Args (JSON)</label>
              <textarea id="args" className="textarea mono" style={{ fontSize: 12 }} value={state.argsJson} onChange={(e) => setState((s) => ({ ...s, argsJson: e.target.value }))} />
            </div>

            <div className="field">
              <span className="field-label">Primary source</span>
              <div className="kv-grid" style={{ gap: 10 }}>
                <input className="input mono" placeholder="source_table" value={state.primarySource.source_table} onChange={(e) => setPS("source_table", e.target.value)} />
                <input className="input mono" placeholder="source_id" value={state.primarySource.source_id} onChange={(e) => setPS("source_id", e.target.value)} />
                <SelectField label="Trust" value={state.primarySource.source_trust} options={SOURCE_TRUSTS} onChange={(v) => setPS("source_trust", v)} />
                <SelectField label="Data class" value={state.primarySource.data_class} options={DATA_CLASSES} onChange={(v) => setPS("data_class", v)} />
                <SelectField label="Authority" value={state.primarySource.authority_scope} options={AUTHORITY_SCOPES} onChange={(v) => setPS("authority_scope", v)} />
                <SelectField label="Egress" value={state.primarySource.egress_policy} options={EGRESS} onChange={(v) => setPS("egress_policy", v)} />
              </div>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="prev">Previous tool path (comma-separated)</label>
              <input id="prev" className="input mono" value={state.previousToolNames} onChange={(e) => setState((s) => ({ ...s, previousToolNames: e.target.value }))} placeholder="load_case_context, search_tickets" />
            </div>

            <div className="field">
              <label className="checkbox-row">
                <input type="checkbox" checked={state.forceLlm} onChange={(e) => setState((s) => ({ ...s, forceLlm: e.target.checked }))} />
                Force LLM semantic decision (slower)
              </label>
            </div>

            <div style={{ marginTop: 14 }}>
              <button className="btn btn-accent" disabled={pending} onClick={submit} type="button">
                {pending ? <span className="spinner" /> : <Bolt size={14} />}
                {pending ? "Evaluating decision…" : "Evaluate"}
              </button>
              {error ? <p className="error-text">{error}</p> : null}
            </div>
          </div>
        </div>

        <DecisionPanel result={result} pending={pending} forceLlm={state.forceLlm} />
      </section>
    </>
  );
}

function DecisionPanel({ result, pending, forceLlm }: { result: DecisionResult["result"] | null; pending: boolean; forceLlm: boolean }) {
  return (
    <div className="panel">
      <div className="panel-heading"><h2>Decision</h2></div>
      <div className="panel-body">
        {pending ? (
          <div className="pending-card" style={{ padding: 18 }}>
            <span className="spinner" /> Routing through ScopeTrace…
            <span className="lead-text">approved hard gate → category router → evidence-pack precedent → {forceLlm ? "LLM semantic" : "deterministic"} decision</span>
          </div>
        ) : !result ? (
          <div className="empty">No decision yet. Pick a preset or configure a tool call, then evaluate.</div>
        ) : (
          <DecisionResultView result={result} />
        )}
      </div>
    </div>
  );
}

function DecisionResultView({ result }: { result: DecisionResult["result"] }) {
  const verdictKind = result.allowed ? "held" : "breached";
  const verdictLabel = result.decision.toUpperCase();
  return (
    <div className="verdict-anim">
      <div className={`verdict ${verdictKind}`}>
        <div className="verdict-icon">
          {result.allowed ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
        </div>
        <div className="verdict-body">
          <strong>{verdictLabel}</strong>
          <p>{result.reason || (result.allowed ? "ScopeTrace would let this tool call execute." : "ScopeTrace would block this tool call.")}</p>
        </div>
      </div>

      <span className="field-label" style={{ marginTop: 18 }}>Decision flow</span>
      <DecisionFlow result={result} />

      {result.findingCodes.length ? (
        <div style={{ marginTop: 14 }}>
          <span className="field-label">Finding codes</span>
          <div className="chip-row">{result.findingCodes.map((c) => <StatusBadge key={c} tone="bad">{c}</StatusBadge>)}</div>
        </div>
      ) : null}

      <div className="chip-row" style={{ marginTop: 14 }}>
        <StatusBadge tone={toneForDecision(result.decision)}>decision · {result.decision}</StatusBadge>
        <StatusBadge tone={result.allowed ? "good" : "bad"}>{result.allowed ? "allowed" : "blocked"}</StatusBadge>
        {result.hardGateDecision ? (
          <StatusBadge tone={result.hardGateDecision === "block" ? "bad" : result.hardGateDecision === "allow" ? "good" : "info"}>
            hard gate · {result.hardGateDecision}
          </StatusBadge>
        ) : null}
      </div>
    </div>
  );
}

function DecisionFlow({ result }: { result: DecisionResult["result"] }) {
  const hg = result.hardGateDecision;
  // Determine which stage produced the verdict
  // Stage sequence per backend: hard gate → category router → evidence pack → semantic decision
  const stages: Array<{ num: number; title: string; sub: string; status: string; state: "fired" | "passthrough" | "skipped" | "terminal-bad" | "terminal-good" }> = [];

  // Stage 1: hard gate
  if (hg === "block") {
    stages.push({ num: 1, title: "Hard gate", sub: "Approved deterministic rule matched", status: "BLOCK", state: "terminal-bad" });
  } else if (hg === "allow") {
    stages.push({ num: 1, title: "Hard gate", sub: "Approved deterministic rule matched", status: "ALLOW", state: "terminal-good" });
  } else {
    stages.push({ num: 1, title: "Hard gate", sub: hg === "needs_semantic" ? "No deterministic rule fired — escalate" : "No matching rule", status: hg === "needs_semantic" ? "PASS" : "n/a", state: hg === "needs_semantic" ? "fired" : "skipped" });
  }

  if (hg === "block" || hg === "allow") {
    // terminal already
    stages.push({ num: 2, title: "Category router", sub: "Skipped — hard gate was conclusive", status: "skipped", state: "skipped" });
    stages.push({ num: 3, title: "Evidence pack", sub: "Skipped", status: "skipped", state: "skipped" });
    stages.push({ num: 4, title: "Semantic decision", sub: "Skipped", status: "skipped", state: "skipped" });
  } else {
    // semantic path
    stages.push({ num: 2, title: "Category router", sub: "Routed to evidence-pack category for semantic review", status: "PASS", state: "fired" });
    stages.push({ num: 3, title: "Evidence pack", sub: "Approved precedents injected as context", status: "PASS", state: "fired" });
    stages.push({
      num: 4,
      title: "Semantic decision",
      sub: result.allowed ? "Allowed by deterministic / LLM semantic check" : "Blocked by deterministic / LLM semantic check",
      status: result.decision.toUpperCase(),
      state: result.allowed ? "terminal-good" : "terminal-bad",
    });
  }

  return (
    <div className="flow">
      {stages.map((s) => (
        <div key={s.num} className={`flow-node ${s.state}`}>
          <div className="flow-node-num">
            {s.state === "terminal-bad" ? <ShieldAlert size={12} /> :
             s.state === "terminal-good" ? <ShieldCheck size={12} /> :
             s.state === "fired" ? <Eye size={12} /> :
             s.num}
          </div>
          <div className="flow-node-body">
            <strong>{s.title}</strong>
            <span>{s.sub}</span>
          </div>
          <span className="flow-node-status">{s.status}</span>
        </div>
      ))}
      <p className="muted" style={{ marginTop: 10, fontSize: 11, lineHeight: 1.6 }}>
        <AlertTriangle size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />
        Stages route in order. Hard gates always run first; only when no deterministic rule fires does semantic review take over.
      </p>
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <span className="field-label">{label}</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
