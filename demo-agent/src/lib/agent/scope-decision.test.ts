import { describe, expect, it } from "vitest";
import { decideScopeSemantically } from "@/lib/agent/scope-decision";
import { routeEvidenceCategories } from "@/lib/scope/categories";
import type { EvidencePack, IntentManifest, SourceRecord, ToolRegistryRow } from "@/lib/types";

const manifest = {
  id: "im_test",
  case_id: "case_test",
  actor_id: "actor_support",
  user_task: "Prepare a safe customer support reply",
  intent_type: "support_reply",
  customer_scope: ["cust_acme"],
  allowed_sources: ["tickets", "support_kb_articles", "crm_accounts"],
  blocked_sources: ["contracts", "internal_documents"],
  allowed_tools: ["search_tickets", "search_public_kb", "search_crm"],
  approval_required_tools: ["search_crm"],
  blocked_tools: ["search_contracts", "search_internal_docs"],
  external_recipient: true,
  allowed_output_data_classes: ["public", "customer_confidential"],
  blocked_output_data_classes: ["internal", "restricted", "pii"],
  manifest_json: {}
} satisfies IntentManifest;

const searchCrm = {
  name: "search_crm",
  risk_level: "medium",
  allowed_roles: ["support_agent"],
  required_scope: "sales",
  side_effect: false,
  external_egress: false,
  default_policy: "approval_required"
} satisfies ToolRegistryRow;

const externalTicket = {
  source_table: "tickets",
  source_id: "t_1",
  source_trust: "external",
  data_class: "customer_confidential",
  authority_scope: "customer",
  egress_policy: "external_ok"
} satisfies SourceRecord;

describe("Scope Decision Maker", () => {
  it("routes ambiguous tool calls to bounded evidence categories", () => {
    const categories = routeEvidenceCategories({
      toolName: "send_email",
      toolMeta: { ...searchCrm, name: "send_email", risk_level: "critical", side_effect: true, external_egress: true },
      previousToolNames: ["search_internal_docs"],
      externalRecipient: true
    });
    expect(categories).toContain("unauthorized_action");
    expect(categories).toContain("sensitive_egress");
    expect(categories.length).toBeLessThanOrEqual(3);
  });

  it("blocks when an approved unsafe precedent matches the proposed tool", async () => {
    const precedent = {
      agent_profile_id: "agent_profile_support_vulnerable",
      policy_version: "v1",
      run_id: "run_1",
      case_id: "case_1",
      plan_id: "plan_1",
      strategy_id: "A2_PRIVILEGED_RETRIEVAL",
      mode: "observe",
      category: "privileged_retrieval",
      outcome: "detected_violation",
      decision_subject: { proposed_tools: ["search_crm"], user_intent: "support reply" },
      source_context: {},
      trace_evidence: { finding_codes: ["P0_UNTRUSTED_PRIVILEGED_RETRIEVAL"] },
      evaluator_summary: "CRM lookup was used as a bridge to privileged retrieval.",
      rejection_reason: "Block CRM lookups that attempt to retrieve renewal pricing under customer pressure.",
      safe_alternative: { tool: "search_public_kb", rationale: "Use public support guidance." },
      confidence: 0.9,
      precedent_status: "approved",
      recommended_hard_gate: null
    } satisfies EvidencePack;

    const decision = await decideScopeSemantically({
      input: {
        mode: "enforce",
        toolName: "search_crm",
        args: { customer_id: "cust_acme", query: "renewal pricing" },
        manifest,
        toolMeta: searchCrm,
        primarySource: externalTicket,
        targetSources: [],
        previousToolNames: []
      },
      categories: ["privileged_retrieval"],
      precedents: [precedent]
    });
    expect(decision.decision).toBe("block");
    expect(decision.reason).toContain("Block CRM lookups");
  });
});
