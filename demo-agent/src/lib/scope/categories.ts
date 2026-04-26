import type { EvidencePackCategory, SourceRecord, ToolRegistryRow } from "@/lib/types";

const PRIVILEGED_TOOLS = new Set(["search_contracts", "search_internal_docs", "search_private_slack"]);
const SIDE_EFFECT_TOOLS = new Set(["send_email", "post_slack", "update_crm"]);

export function categoryFromPolicyCodes(codes: string[]): EvidencePackCategory {
  const set = new Set(codes);
  if (set.has("P5_MEMORY_POISONING")) return "memory_poisoning";
  if (set.has("P2_EXTERNAL_STATE_MUTATION")) return "unauthorized_action";
  if (set.has("P1_SENSITIVE_EXTERNAL_OUTPUT") || set.has("P3_COVERT_EGRESS")) return "sensitive_egress";
  if (set.has("P4_SOURCE_LAUNDERING")) return "source_laundering";
  if (set.has("P0_UNTRUSTED_PRIVILEGED_RETRIEVAL") || set.has("P6_RISKY_TOOL_SEQUENCE")) {
    return "privileged_retrieval";
  }
  return "inconclusive";
}

export function routeEvidenceCategories(input: {
  toolName: string;
  toolMeta?: ToolRegistryRow;
  targetSources?: SourceRecord[];
  previousToolNames: string[];
  externalRecipient?: boolean;
  args?: Record<string, unknown>;
}): EvidencePackCategory[] {
  const categories: EvidencePackCategory[] = [];
  const targetDataClasses = new Set((input.targetSources ?? []).map((source) => source.data_class).filter(Boolean));
  const hasSensitiveTarget = ["internal", "restricted", "pii"].some((dataClass) => targetDataClasses.has(dataClass as never));

  if (PRIVILEGED_TOOLS.has(input.toolName)) categories.push("privileged_retrieval");
  if (input.toolName === "write_agent_memory") categories.push("memory_poisoning");
  if (SIDE_EFFECT_TOOLS.has(input.toolName) || input.toolMeta?.side_effect) categories.push("unauthorized_action");
  if (input.toolName === "draft_customer_email" || input.toolName === "send_email" || input.toolMeta?.external_egress) {
    categories.push("sensitive_egress");
  }
  if (input.externalRecipient && hasSensitiveTarget) categories.push("sensitive_egress");
  if (input.previousToolNames.some((name) => PRIVILEGED_TOOLS.has(name))) categories.push("sensitive_egress");
  if (looksLikeSourceLaundering(input.args)) categories.push("source_laundering");

  return [...new Set(categories)].slice(0, 3);
}

function looksLikeSourceLaundering(args?: Record<string, unknown>) {
  if (!args) return false;
  const text = JSON.stringify(args).toLowerCase();
  return text.includes("omit the source") || text.includes("hide source") || text.includes("do not mention");
}
