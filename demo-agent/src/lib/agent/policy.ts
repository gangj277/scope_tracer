import type { HardGateRule, IntentManifest, RunMode, SourceRecord, ToolRegistryRow } from "@/lib/types";

export type PolicyInput = {
  mode: RunMode;
  toolName: string;
  args: Record<string, unknown>;
  manifest: IntentManifest | null;
  toolMeta?: ToolRegistryRow;
  primarySource?: SourceRecord | null;
  targetSources?: SourceRecord[];
  previousToolNames: string[];
};

export type PolicyResult = {
  allowed: boolean;
  decision: "allowed" | "blocked" | "observed" | "warned";
  reason: string;
  findingCodes: string[];
  hardGateDecision?: "allow" | "block" | "needs_semantic";
};

export type HardGateEvaluation = {
  decision: "allow" | "block" | "needs_semantic";
  reason: string;
  findingCodes: string[];
  matchedRuleCodes: string[];
  safeAlternative?: string | null;
};

const PRIVILEGED_RETRIEVAL_TOOLS = new Set(["search_contracts", "search_internal_docs", "search_private_slack"]);
const SIDE_EFFECT_TOOLS = new Set(["send_email", "post_slack", "update_crm", "write_agent_memory"]);

export function evaluateToolPolicy(input: PolicyInput & { hardGateRules?: HardGateRule[] }): PolicyResult {
  const hardGate = evaluateHardGate(input);
  if (hardGate.decision === "block") {
    const reason = `${hardGate.reason} Tool=${input.toolName}; mode=${input.mode}.`;
    if (input.mode === "enforce") {
      return {
        allowed: false,
        decision: "blocked",
        reason,
        findingCodes: hardGate.findingCodes,
        hardGateDecision: "block"
      };
    }
    return {
      allowed: true,
      decision: "observed",
      reason,
      findingCodes: hardGate.findingCodes,
      hardGateDecision: "block"
    };
  }

  if (hardGate.decision === "needs_semantic") {
    return {
      allowed: true,
      decision: "warned",
      reason: hardGate.reason,
      findingCodes: [],
      hardGateDecision: "needs_semantic"
    };
  }

  return {
    allowed: true,
    decision: "allowed",
    reason: hardGate.reason,
    findingCodes: [],
    hardGateDecision: "allow"
  };
}

export function evaluateHardGate(input: PolicyInput & { hardGateRules?: HardGateRule[] }): HardGateEvaluation {
  const findings = new Set<string>();
  const matchedRuleCodes = new Set<string>();
  const manifest = input.manifest;
  const toolMeta = input.toolMeta;
  const sourceTrust = input.primarySource?.source_trust;
  const targetDataClasses = new Set((input.targetSources ?? []).map((source) => source.data_class).filter(Boolean));
  const toolBlockedByManifest = Boolean(manifest?.blocked_tools.includes(input.toolName));
  const externalCaused = sourceTrust === "external" || Boolean(input.targetSources?.some((source) => source.source_trust === "external"));
  const patch = input.args.patch;
  const safeCrmFollowUpPatch =
    input.toolName === "update_crm" &&
    patch &&
    typeof patch === "object" &&
    !Array.isArray(patch) &&
    Object.keys(patch).length > 0 &&
    Object.keys(patch).every((key) => key === "follow_up_required") &&
    Boolean(manifest?.allowed_tools.includes("update_crm"));

  if (toolBlockedByManifest && PRIVILEGED_RETRIEVAL_TOOLS.has(input.toolName)) {
    findings.add("P0_UNTRUSTED_PRIVILEGED_RETRIEVAL");
    matchedRuleCodes.add("HG_UNTRUSTED_PRIVILEGED_RETRIEVAL");
  }

  if (externalCaused && PRIVILEGED_RETRIEVAL_TOOLS.has(input.toolName)) {
    findings.add("P0_UNTRUSTED_PRIVILEGED_RETRIEVAL");
    matchedRuleCodes.add("HG_UNTRUSTED_PRIVILEGED_RETRIEVAL");
  }

  if (externalCaused && (toolMeta?.side_effect || SIDE_EFFECT_TOOLS.has(input.toolName)) && !safeCrmFollowUpPatch) {
    findings.add(input.toolName === "write_agent_memory" ? "P5_MEMORY_POISONING" : "P2_EXTERNAL_STATE_MUTATION");
    matchedRuleCodes.add(input.toolName === "write_agent_memory" ? "HG_MEMORY_WRITE_FROM_EXTERNAL" : "HG_EXTERNAL_SIDE_EFFECT");
  }

  if (input.toolName === "write_agent_memory") {
    findings.add("P5_MEMORY_POISONING");
    matchedRuleCodes.add("HG_MEMORY_WRITE_FROM_EXTERNAL");
  }

  if (input.toolName === "update_crm" && patch && typeof patch === "object" && !Array.isArray(patch)) {
    const illegalFields = Object.keys(patch).filter((key) => key !== "follow_up_required");
    if (illegalFields.length) {
      findings.add("P2_EXTERNAL_STATE_MUTATION");
      matchedRuleCodes.add("HG_CRM_FIELD_ALLOWLIST");
    }
  }

  const hadRestrictedRetrieval = input.previousToolNames.some((name) => PRIVILEGED_RETRIEVAL_TOOLS.has(name));
  if (hadRestrictedRetrieval && (input.toolName === "draft_customer_email" || input.toolName === "send_email")) {
    findings.add("P6_RISKY_TOOL_SEQUENCE");
    matchedRuleCodes.add("HG_SENSITIVE_EXTERNAL_EGRESS");
  }

  if ([...targetDataClasses].some((dataClass) => dataClass === "internal" || dataClass === "restricted" || dataClass === "pii")) {
    if (toolBlockedByManifest || (externalCaused && PRIVILEGED_RETRIEVAL_TOOLS.has(input.toolName))) {
      findings.add("P0_UNTRUSTED_PRIVILEGED_RETRIEVAL");
      matchedRuleCodes.add("HG_UNTRUSTED_PRIVILEGED_RETRIEVAL");
    }
  }

  const customerScopeViolation = violatesCustomerScope(input.args, manifest?.customer_scope ?? []);
  if (customerScopeViolation) {
    findings.add("P0_UNTRUSTED_PRIVILEGED_RETRIEVAL");
    matchedRuleCodes.add("HG_CUSTOMER_SCOPE_MATCH");
  }

  if (findings.size > 0) {
    return {
      decision: "block",
      reason: `Hard gate findings: ${[...findings].join(", ")}.`,
      findingCodes: [...findings],
      matchedRuleCodes: [...matchedRuleCodes]
    };
  }

  if (isLowRiskManifestAllowed(input)) {
    return {
      decision: "allow",
      reason: "Approved hard gate allow: low-risk tool is within the intent manifest.",
      findingCodes: [],
      matchedRuleCodes: ["HG_LOW_RISK_MANIFEST_ALLOW"]
    };
  }

  if (requiresSemanticDecision(input)) {
    return {
      decision: "needs_semantic",
      reason: "Hard gate found no violation, but this tool call needs semantic scope review.",
      findingCodes: [],
      matchedRuleCodes: []
    };
  }

  return {
    decision: "allow",
    reason: "Tool call is within the intent manifest.",
    findingCodes: [],
    matchedRuleCodes: []
  };
}

function isLowRiskManifestAllowed(input: PolicyInput) {
  return (
    input.toolMeta?.risk_level === "low" &&
    !input.toolMeta.side_effect &&
    !input.toolMeta.external_egress &&
    Boolean(input.manifest?.allowed_tools.includes(input.toolName))
  );
}

function requiresSemanticDecision(input: PolicyInput) {
  if (!input.manifest?.allowed_tools.includes(input.toolName)) return false;
  if (input.toolName === "search_crm") return true;
  if (input.toolMeta?.default_policy === "approval_required") return true;
  if (input.toolMeta?.risk_level === "medium" || input.toolMeta?.risk_level === "high" || input.toolMeta?.risk_level === "critical") {
    return input.toolName !== "update_crm";
  }
  return false;
}

function violatesCustomerScope(args: Record<string, unknown>, customerScope: string[]) {
  if (!customerScope.length) return false;
  const customerId = args.customer_id;
  return typeof customerId === "string" && customerId.length > 0 && !customerScope.includes(customerId);
}
