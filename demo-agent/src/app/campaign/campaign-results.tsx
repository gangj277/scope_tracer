"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ShieldAlert, ShieldCheck, AlertTriangle, ArrowRight, Beaker, FastForward, ChevronDown, ChevronUp, Activity, Zap } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";

type StrategyId =
  | "A1_AUTHORITY_CONFUSION"
  | "A2_PRIVILEGED_RETRIEVAL"
  | "A3_SENSITIVE_EGRESS"
  | "A4_UNAUTHORIZED_ACTION";

type SignalStrength = "none" | "weak" | "weak_signal" | "partial" | "strong";

export type CampaignTurn = {
  attackerTurn: {
    turn: number;
    persona: string;
    attackObjective: string;
    progress: { northStarProgress: string; nextTactic: string; repeatedTacticRisk: boolean };
    payloadPlacement: { channel: string; intent: string; payloadSummary: string };
  };
  targetPayload: string;
  targetOutput: string;
  northStarSignal: {
    strength: SignalStrength;
    matchedPolicyCodes: string[];
    matchedTools: string[];
    matchedSources: string[];
    reason: string;
  };
};

export type CampaignLane = {
  runId: string;
  caseId: string;
  mode: string;
  planId: string;
  strategyId: StrategyId;
  assignedAttacker: string;
  minTurns: number;
  maxTurns: number;
  stoppedReason: string;
  turns: CampaignTurn[];
  finalResult: {
    attack_success: boolean;
    benign_success?: boolean;
    findings?: string[];
    tool_path?: string[];
    blocked_tools?: string[];
    blocked_tool_calls?: number;
    sensitive_egress_count?: number;
  };
  quality: {
    targetPayloadsClean: boolean;
    completedMinimumTurns: boolean;
    pursuedNorthStar: boolean;
  };
};

export type CampaignResponse = {
  startedAt: string;
  completedAt: string;
  campaign: {
    results: CampaignLane[];
    failures: Array<{ planId: string; caseId: string; strategyId: string; error: string }>;
    summary: { total: number; completed: number; failed: number; attackSuccesses: number };
  };
};

const STRATEGY_LABEL: Record<StrategyId, string> = {
  A1_AUTHORITY_CONFUSION: "Authority confusion",
  A2_PRIVILEGED_RETRIEVAL: "Privileged retrieval",
  A3_SENSITIVE_EGRESS: "Sensitive egress",
  A4_UNAUTHORIZED_ACTION: "Unauthorized action",
};

const STRENGTH_VALUES: Record<SignalStrength, number> = {
  none: 0,
  weak: 1,
  weak_signal: 1,
  partial: 2,
  strong: 3,
};

const TURN_INTERVAL_MS = 650;

export function CampaignResults({
  runResponse,
  mode,
  onReplan,
}: {
  runResponse: CampaignResponse;
  mode: "observe" | "enforce";
  onReplan: () => void;
}) {
  const lanes = runResponse.campaign.results;
  const totalTurns = useMemo(() => lanes.reduce((acc, l) => acc + l.turns.length, 0), [lanes]);
  const [progress, setProgress] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (progress >= totalTurns) return;
    const t = setTimeout(() => setProgress((p) => p + 1), TURN_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [progress, totalTurns]);

  const isStreaming = progress < totalTurns;

  // After streaming completes, auto-collapse "held" lanes so breaches stand out
  useEffect(() => {
    if (isStreaming) return;
    setCollapsed(new Set(lanes.filter((l) => !l.finalResult.attack_success).map((l) => l.runId)));
  }, [isStreaming, lanes]);

  function toggleLane(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const breached = lanes.filter((l) => l.finalResult.attack_success).length;
  const held = lanes.length - breached;
  const wallSec = Math.round((new Date(runResponse.completedAt).getTime() - new Date(runResponse.startedAt).getTime()) / 1000);

  return (
    <>
      <Overview lanes={lanes} mode={mode} wallSec={wallSec} streaming={isStreaming} progress={progress} totalTurns={totalTurns} onSkip={() => setProgress(totalTurns)} />

      {runResponse.campaign.failures.length ? (
        <section className="panel section-gap">
          <div className="panel-heading"><h2><AlertTriangle size={14} /> Failures</h2></div>
          <div className="panel-body">
            {runResponse.campaign.failures.map((f) => (
              <p key={f.planId} className="muted-strong" style={{ margin: "4px 0", fontSize: 13 }}>
                <span className="mono">{f.strategyId}</span> · {f.caseId} → {f.error}
              </p>
            ))}
          </div>
        </section>
      ) : null}

      <div className="lane-grid section-gap">
        {lanes.map((lane, idx) => {
          const visibleTurns = visibleTurnsForLane(lane, idx, lanes, progress);
          const laneStreaming = visibleTurns < lane.turns.length;
          const laneCollapsed = collapsed.has(lane.runId);
          return (
            <LaneCard
              key={lane.runId}
              lane={lane}
              visibleTurns={visibleTurns}
              streaming={laneStreaming}
              collapsed={laneCollapsed}
              onToggle={() => toggleLane(lane.runId)}
            />
          );
        })}
      </div>

      <div className="btn-row section-gap">
        <button className="btn" onClick={onReplan} type="button">← Re-plan</button>
        <Link className="btn btn-accent" href="/scope">
          <Beaker size={14} /> Convert to evidence packs <ArrowRight size={14} />
        </Link>
      </div>

      <p className="muted" style={{ marginTop: 14, fontSize: 12, textAlign: "center" }}>
        {breached > 0
          ? `${breached} of ${lanes.length} attackers breached the agent's authority boundary. Approve evidence packs in /scope to make these precedents active.`
          : `All ${lanes.length} attackers held. Run again with different strategies or in observe mode to surface latent gaps.`}
      </p>
    </>
  );
}

/* ─────────────────────────── Overview ─────────────────────────── */

function Overview({
  lanes, mode, wallSec, streaming, progress, totalTurns, onSkip,
}: {
  lanes: CampaignLane[]; mode: string; wallSec: number; streaming: boolean; progress: number; totalTurns: number; onSkip: () => void;
}) {
  const breached = lanes.filter((l) => l.finalResult.attack_success).length;
  const held = lanes.length - breached;
  const ratio = lanes.length ? (breached / lanes.length) * 100 : 0;
  const allFindings = lanes.flatMap((l) => l.finalResult.findings ?? []);
  const findingCounts = aggregateFindings(allFindings);

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>
            {streaming ? <span className="live-pulse" /> : null}
            {streaming ? "Campaign in flight" : "Campaign verdict"}
          </h2>
          <p>
            {streaming
              ? `Specialist attackers running in ${mode}. ${progress} / ${totalTurns} turns streamed.`
              : `${lanes.length} parallel attackers · ${mode} mode · ${wallSec}s wall time.`}
          </p>
        </div>
        {streaming ? (
          <button className="btn btn-sm" onClick={onSkip} type="button">
            <FastForward size={12} /> Reveal all
          </button>
        ) : null}
      </div>

      <div className="panel-body">
        {streaming ? (
          <div className="progress-track" style={{ marginBottom: 14 }}>
            <div className="progress-fill" style={{ width: `${totalTurns ? (progress / totalTurns) * 100 : 0}%` }} />
          </div>
        ) : null}

        <div className="hero-grid" style={{ marginBottom: findingCounts.total ? 14 : 0 }}>
          <div className="hero-tile bad">
            <p className="label">Breached</p>
            <span className="value">{breached}</span>
            <span className="sub">{lanes.length ? `${Math.round(ratio)}% of attackers reached north-star` : "no attackers"}</span>
          </div>
          <div className="hero-arrow"><ArrowRight size={22} /></div>
          <div className="hero-tile good">
            <p className="label">Held</p>
            <span className="value">{held}</span>
            <span className="sub">authority boundary preserved</span>
          </div>
        </div>

        {findingCounts.total ? (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span className="field-label" style={{ marginBottom: 0 }}>Finding severity ({findingCounts.total})</span>
              <div className="chip-row">
                {findingCounts.crit ? <StatusBadge tone="bad">crit · {findingCounts.crit}</StatusBadge> : null}
                {findingCounts.high ? <StatusBadge tone="bad">high · {findingCounts.high}</StatusBadge> : null}
                {findingCounts.med ? <StatusBadge tone="warn">med · {findingCounts.med}</StatusBadge> : null}
                {findingCounts.low ? <StatusBadge tone="info">low · {findingCounts.low}</StatusBadge> : null}
              </div>
            </div>
            <div className="severity-bar">
              {findingCounts.crit ? <span className="crit" style={{ width: `${(findingCounts.crit/findingCounts.total)*100}%` }} /> : null}
              {findingCounts.high ? <span className="high" style={{ width: `${(findingCounts.high/findingCounts.total)*100}%` }} /> : null}
              {findingCounts.med  ? <span className="med"  style={{ width: `${(findingCounts.med/findingCounts.total)*100}%` }} /> : null}
              {findingCounts.low  ? <span className="low"  style={{ width: `${(findingCounts.low/findingCounts.total)*100}%` }} /> : null}
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: 16 }}>
          <span className="field-label">Attack family outcome</span>
          <StrategyHeatmap lanes={lanes} streaming={streaming} progress={progress} />
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Strategy heatmap ─────────────────────────── */

function StrategyHeatmap({ lanes, streaming, progress }: { lanes: CampaignLane[]; streaming: boolean; progress: number }) {
  const strategies: StrategyId[] = ["A1_AUTHORITY_CONFUSION", "A2_PRIVILEGED_RETRIEVAL", "A3_SENSITIVE_EGRESS", "A4_UNAUTHORIZED_ACTION"];
  const caseIds = Array.from(new Set(lanes.map((l) => l.caseId)));
  const map = new Map<string, CampaignLane>();
  lanes.forEach((l) => map.set(`${l.strategyId}|${l.caseId}`, l));

  return (
    <div className="heatmap" style={{ marginTop: 6 }}>
      <div className="heatmap-row" style={{ marginBottom: 2 }}>
        <div className="heatmap-row-label" style={{ visibility: "hidden" }}>strategy</div>
        <div className="heatmap-cells" style={{ gridTemplateColumns: `repeat(${Math.max(caseIds.length, 1)}, 1fr)` }}>
          {caseIds.length ? caseIds.map((c) => (
            <div key={c} className="muted" style={{ fontSize: 10, fontFamily: "var(--font-geist-mono)", textAlign: "center", padding: "2px 0" }}>{c}</div>
          )) : <div className="muted" style={{ fontSize: 10 }}>no cases</div>}
        </div>
      </div>
      {strategies.map((s) => (
        <div key={s} className="heatmap-row">
          <div className="heatmap-row-label">{s.replace(/_/g, " ")}</div>
          <div className="heatmap-cells" style={{ gridTemplateColumns: `repeat(${Math.max(caseIds.length, 1)}, 1fr)` }}>
            {caseIds.map((c) => {
              const lane = map.get(`${s}|${c}`);
              const idx = lane ? lanes.indexOf(lane) : -1;
              const visible = lane ? visibleTurnsForLane(lane, idx, lanes, progress) : 0;
              const allShown = lane ? visible >= lane.turns.length : false;
              const cls = !lane ? "empty"
                : !allShown ? "empty"
                : lane.finalResult.attack_success ? "breached"
                : laneHasPartial(lane) ? "partial"
                : "held";
              const symbol = !lane ? "·" : !allShown ? (streaming ? "…" : "·") : cls === "breached" ? "✗" : cls === "held" ? "✓" : "~";
              return <div key={c} className={`heatmap-cell ${cls}`} title={lane ? `${s} on ${c}: ${cls}` : `${s} on ${c}: not run`}>{symbol}</div>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────── Lane card ─────────────────────────── */

function LaneCard({ lane, visibleTurns, streaming, collapsed, onToggle }: { lane: CampaignLane; visibleTurns: number; streaming: boolean; collapsed: boolean; onToggle: () => void }) {
  const turns = lane.turns.slice(0, visibleTurns);
  const verdict = streaming ? "pending" : lane.finalResult.attack_success ? "breached" : laneHasPartial(lane) ? "partial" : "held";
  const headline = deriveHeadline(lane, streaming, visibleTurns);
  const toolPath = lane.finalResult.tool_path ?? [];
  const blockedTools = new Set(lane.finalResult.blocked_tools ?? []);
  const signalValues = turns.map((t) => STRENGTH_VALUES[t.northStarSignal.strength] ?? 0);

  return (
    <article className={`lane${collapsed ? " collapsed" : ""}`}>
      <div className="lane-head">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <span className="strategy">{lane.strategyId}</span>
          <span className="muted" style={{ fontSize: 10, fontFamily: "var(--font-geist-mono)" }}>
            {streaming ? <><span className="live-pulse" />{visibleTurns}/{lane.turns.length}</> : <>{lane.turns.length} turns</>}
          </span>
        </div>
        <h3>{lane.assignedAttacker}</h3>
        <div className="lane-meta">
          <span className="mono">{lane.caseId}</span>
          <span>·</span>
          <Link className="mono" href={`/runs/${lane.runId}/cases/${lane.caseId}`} target="_blank">run trace ↗</Link>
        </div>

        <div className={`verdict ${verdict} verdict-anim`} style={{ marginTop: 10 }} key={`${verdict}-${visibleTurns}`}>
          <div className="verdict-icon">
            {verdict === "breached" ? <ShieldAlert size={18} /> :
              verdict === "held" ? <ShieldCheck size={18} /> :
              verdict === "partial" ? <AlertTriangle size={18} /> :
              <Activity size={18} />}
          </div>
          <div className="verdict-body">
            <strong>
              {verdict === "breached" ? "Breached" :
                verdict === "held" ? "Held" :
                verdict === "partial" ? "Partial signal" :
                "Running"}
            </strong>
            <p>{headline}</p>
          </div>
        </div>

        {toolPath.length && !streaming ? (
          <>
            <span className="payload-label" style={{ marginTop: 12 }}>Tool path</span>
            <div className="tool-flow">
              {toolPath.map((tool, i) => (
                <span key={`${tool}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span className={`tool-step${blockedTools.has(tool) ? " blocked" : " allowed"}`}>{tool}</span>
                  {i < toolPath.length - 1 ? <span className="tool-arrow">→</span> : null}
                </span>
              ))}
            </div>
          </>
        ) : null}

        {signalValues.length ? (
          <>
            <span className="payload-label" style={{ marginTop: 8 }}>North-star signal</span>
            <SignalSparkline values={signalValues} />
          </>
        ) : null}

        <div className="chip-row" style={{ marginTop: 8 }}>
          <StatusBadge tone={lane.quality.completedMinimumTurns ? "good" : "warn"}>min turns {lane.quality.completedMinimumTurns ? "✓" : "✗"}</StatusBadge>
          <StatusBadge tone={lane.quality.targetPayloadsClean ? "good" : "warn"}>payload clean {lane.quality.targetPayloadsClean ? "✓" : "✗"}</StatusBadge>
          <StatusBadge tone={lane.quality.pursuedNorthStar ? "good" : "warn"}>NS pursuit {lane.quality.pursuedNorthStar ? "✓" : "✗"}</StatusBadge>
        </div>

        {!streaming ? (
          <button className="lane-toggle" onClick={onToggle} type="button">
            {collapsed ? <><ChevronDown size={11} style={{ verticalAlign: "-2px" }} /> Show {turns.length} turns</> : <><ChevronUp size={11} style={{ verticalAlign: "-2px" }} /> Hide turn detail</>}
          </button>
        ) : null}
      </div>

      <div className="lane-body">
        {turns.map((t, idx) => (
          <div key={idx} className="turn turn-anim">
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="turn-num">T{t.attackerTurn.turn}</span>
              <span className="muted-strong" style={{ fontSize: 12 }}>{t.attackerTurn.persona}</span>
              <StatusBadge tone={signalTone(t.northStarSignal.strength)}>NS {t.northStarSignal.strength}</StatusBadge>
              <StatusBadge tone="info">{t.attackerTurn.payloadPlacement.channel}</StatusBadge>
            </div>
            <p className="muted" style={{ margin: "4px 0 6px", fontSize: 11 }}>{t.attackerTurn.attackObjective}</p>
            <span className="payload-label">payload sent to target</span>
            <div className="payload-block attacker">{truncate(t.targetPayload, 600)}</div>
            <span className="payload-label">target output</span>
            <div className="payload-block target">{truncate(t.targetOutput, 600)}</div>
            {t.northStarSignal.matchedPolicyCodes.length ? (
              <div className="chip-row" style={{ marginTop: 6 }}>
                {t.northStarSignal.matchedPolicyCodes.map((c) => <StatusBadge key={c} tone="bad">{c}</StatusBadge>)}
              </div>
            ) : null}
          </div>
        ))}
        {streaming && turns.length < lane.turns.length ? (
          <div className="muted" style={{ padding: "8px 0", fontSize: 11, textAlign: "center" }}>
            <Zap size={12} style={{ verticalAlign: "-2px" }} /> next turn arriving…
          </div>
        ) : null}
      </div>
    </article>
  );
}

/* ─────────────────────────── Sparkline ─────────────────────────── */

function SignalSparkline({ values }: { values: number[] }) {
  const w = 200, h = 36, pad = 2;
  if (!values.length) return null;
  const max = 3;
  const stepX = values.length > 1 ? (w - pad * 2) / (values.length - 1) : (w - pad * 2);
  const points = values.map((v, i) => `${pad + i * stepX},${h - pad - (v / max) * (h - pad * 2)}`);
  const last = values[values.length - 1] ?? 0;
  const color = last >= 3 ? "#ff6b6b" : last >= 2 ? "#f4c95d" : last >= 1 ? "#6eb7ff" : "#8d97a6";
  const area = `M${pad},${h - pad} L${points.join(" L")} L${w - pad},${h - pad} Z`;
  const line = `M${points.join(" L")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="sparkline">
      <path d={area} fill={color} fillOpacity="0.16" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => (
        <circle key={i} cx={pad + i * stepX} cy={h - pad - (v / max) * (h - pad * 2)} r="1.8" fill={color} />
      ))}
      {[1, 2, 3].map((g) => (
        <line key={g} x1={0} x2={w} y1={h - pad - (g / max) * (h - pad * 2)} y2={h - pad - (g / max) * (h - pad * 2)} stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
      ))}
    </svg>
  );
}

/* ─────────────────────────── Helpers ─────────────────────────── */

function visibleTurnsForLane(lane: CampaignLane, _idx: number, _lanes: CampaignLane[], progress: number) {
  // All lanes reveal in parallel — same global pace, capped per lane
  return Math.min(lane.turns.length, progress);
}

function laneHasPartial(lane: CampaignLane) {
  return lane.turns.some((t) => t.northStarSignal.strength === "partial" || t.northStarSignal.strength === "strong");
}

function deriveHeadline(lane: CampaignLane, streaming: boolean, visible: number): string {
  if (streaming) {
    const t = lane.turns[visible - 1];
    if (!t) return `Initialising ${STRATEGY_LABEL[lane.strategyId]}…`;
    return `T${t.attackerTurn.turn} · ${t.attackerTurn.payloadPlacement.channel} · NS ${t.northStarSignal.strength}`;
  }
  if (lane.finalResult.attack_success) {
    const winning = lane.turns.find((t) => t.northStarSignal.strength === "strong") ?? lane.turns[lane.turns.length - 1];
    const code = winning?.northStarSignal.matchedPolicyCodes[0];
    if (code) return `Turn ${winning.attackerTurn.turn} · ${winning.attackerTurn.payloadPlacement.channel} payload triggered ${code}`;
    return `Reached north-star outcome at turn ${winning?.attackerTurn.turn ?? lane.turns.length}`;
  }
  const partial = lane.turns.find((t) => t.northStarSignal.strength === "partial");
  if (partial) return `Partial signal at turn ${partial.attackerTurn.turn} but boundary held`;
  return `Held across ${lane.turns.length} turns — no scope violation`;
}

function aggregateFindings(codes: string[]) {
  // Without severity per code at runtime, infer from rule code prefix patterns
  // P0/P1/P2 → high, P3/P4/P5/P6 → medium, others → low
  let crit = 0, high = 0, med = 0, low = 0;
  for (const c of codes) {
    if (/^P0_|CRITICAL/i.test(c)) crit++;
    else if (/^P[12]_|HIGH/i.test(c)) high++;
    else if (/^P[3456]_|MED/i.test(c)) med++;
    else low++;
  }
  return { crit, high, med, low, total: codes.length };
}

function signalTone(strength: string): "good" | "warn" | "bad" | "neutral" | "info" {
  if (strength === "strong") return "bad";
  if (strength === "partial") return "warn";
  if (strength === "weak" || strength === "weak_signal") return "info";
  return "neutral";
}

function truncate(s: string, max: number) {
  if (!s) return "(empty)";
  return s.length > max ? s.slice(0, max) + "…" : s;
}
