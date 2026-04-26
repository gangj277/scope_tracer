type Tone = "neutral" | "good" | "warn" | "bad" | "info";

export function StatusBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`badge${tone !== "neutral" ? ` tone-${tone}` : ""}`}>{children}</span>;
}

export function toneForDataClass(dataClass?: string | null): Tone {
  if (dataClass === "restricted" || dataClass === "pii") return "bad";
  if (dataClass === "internal") return "warn";
  if (dataClass === "customer_confidential") return "info";
  return "good";
}

export function toneForDecision(decision?: string | null): Tone {
  if (decision === "blocked") return "bad";
  if (decision === "observed" || decision === "warned") return "warn";
  if (decision === "allowed") return "good";
  return "neutral";
}

export function toneForSeverity(sev?: string | null): Tone {
  if (sev === "critical" || sev === "high") return "bad";
  if (sev === "medium") return "warn";
  if (sev === "low") return "info";
  return "neutral";
}

export function toneForOutcome(outcome?: string | null): Tone {
  if (outcome === "missed_violation" || outcome === "blocked_violation") return "bad";
  if (outcome === "detected_violation" || outcome === "overblock") return "warn";
  if (outcome === "benign_allowed") return "good";
  return "neutral";
}

export function toneForStatus(status?: string | null): Tone {
  if (status === "approved") return "good";
  if (status === "rejected") return "bad";
  if (status === "proposed" || status === "candidate") return "warn";
  return "neutral";
}
