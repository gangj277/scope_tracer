import type {
  AgentProfileSpec,
  EvidencePackCategory,
  HardGateRule,
  ToolCategory,
  ToolRegistryRow
} from "@/lib/types";

const DEFAULT_POLICY_VERSION = "v1";

type ProposedHardGateSet = {
  agentProfileId: string;
  policyVersion: string;
  rules: HardGateRule[];
  semanticRoutingMap: Record<string, EvidencePackCategory[]>;
  reviewPacket: {
    summary: string;
    criticalRules: number;
    toolCoverage: Array<{ tool: string; category: ToolCategory; risk: string; defaultRouting: EvidencePackCategory[] }>;
  };
};

export function buildHardGateProposalSet(input: {
  spec: AgentProfileSpec;
  toolRegistry?: Map<string, ToolRegistryRow>;
  policyVersion?: string;
}): ProposedHardGateSet {
  const policyVersion = input.policyVersion ?? DEFAULT_POLICY_VERSION;
  const enrichedTools = input.spec.tools.map((tool) => {
    const registry = input.toolRegistry?.get(tool.name);
    const category = tool.category ?? classifyToolCategory(tool.name, registry);
    const risk = tool.riskLevel ?? registry?.risk_level ?? riskForCategory(category);
    const sideEffect = tool.sideEffect ?? registry?.side_effect ?? (category === "write" || category === "memory");
    const externalEgress = tool.externalEgress ?? registry?.external_egress ?? (category === "egress");
    return { ...tool, category, risk, sideEffect, externalEgress };
  });

  const rules: HardGateRule[] = [
    makeRule({
      spec: input.spec,
      policyVersion,
      ruleCode: "HG_UNTRUSTED_PRIVILEGED_RETRIEVAL",
      category: "privileged_retrieval",
      severity: "critical",
      condition: { family: "untrusted_privileged_retrieval", source_trust: "external" },
      action: "block",
      rationale: "External or lower-trust content cannot authorize restricted retrieval tools.",
      safeAlternative: "Use customer-visible tickets and public KB sources."
    }),
    makeRule({
      spec: input.spec,
      policyVersion,
      ruleCode: "HG_SENSITIVE_EXTERNAL_EGRESS",
      category: "sensitive_egress",
      severity: "critical",
      condition: { family: "sensitive_external_egress", data_classes: ["internal", "restricted", "pii"] },
      action: "block",
      rationale: "Internal, restricted, or PII context cannot flow to external recipients.",
      safeAlternative: "Rewrite from public or customer-confidential approved sources only."
    }),
    makeRule({
      spec: input.spec,
      policyVersion,
      ruleCode: "HG_EXTERNAL_SIDE_EFFECT",
      category: "unauthorized_action",
      severity: "high",
      condition: { family: "external_side_effect", source_trust: "external" },
      action: "block",
      rationale: "External content cannot authorize state mutation, sends, posts, or durable changes.",
      safeAlternative: "Return a draft or ask for an internal approval workflow."
    }),
    makeRule({
      spec: input.spec,
      policyVersion,
      ruleCode: "HG_MEMORY_WRITE_FROM_EXTERNAL",
      category: "memory_poisoning",
      severity: "high",
      condition: { family: "memory_write_from_external" },
      action: "block",
      rationale: "Customer-controlled instructions must not become persistent agent memory.",
      safeAlternative: "Treat the content as case-local context only."
    }),
    makeRule({
      spec: input.spec,
      policyVersion,
      ruleCode: "HG_CRM_FIELD_ALLOWLIST",
      category: "unauthorized_action",
      severity: "high",
      condition: { family: "crm_field_allowlist", allowed_fields: ["follow_up_required"] },
      action: "block",
      rationale: "Tool availability does not imply permission for arbitrary CRM payload fields.",
      safeAlternative: "Only update follow_up_required or route approval fields to Sales."
    }),
    makeRule({
      spec: input.spec,
      policyVersion,
      ruleCode: "HG_CUSTOMER_SCOPE_MATCH",
      category: "authority_confusion",
      severity: "critical",
      condition: { family: "customer_scope_match" },
      action: "block",
      rationale: "Tool arguments must stay inside the current customer or tenant scope.",
      safeAlternative: "Ask for authorization or narrow the tool call to the manifest customer scope."
    })
  ];

  for (const tool of enrichedTools.filter((tool) => tool.risk === "low" && !tool.sideEffect && !tool.externalEgress)) {
    rules.push(
      makeRule({
        spec: input.spec,
        policyVersion,
        ruleCode: `HG_ALLOW_${tool.name.toUpperCase()}`,
        category: "benign_allow",
        severity: "low",
        condition: { family: "low_risk_manifest_allow", tool: tool.name },
        action: "allow",
        rationale: `${tool.name} is a low-risk read tool when it stays within the intent manifest.`,
        safeAlternative: null
      })
    );
  }

  const semanticRoutingMap = Object.fromEntries(
    enrichedTools.map((tool) => [tool.name, defaultCategoriesForTool(tool.name, tool.category, tool.externalEgress)])
  );

  return {
    agentProfileId: input.spec.agentProfileId,
    policyVersion,
    rules,
    semanticRoutingMap,
    reviewPacket: {
      summary: `Proposed ${rules.length} hard gate rules for ${input.spec.agentName}. Rules remain inactive until approved.`,
      criticalRules: rules.filter((rule) => rule.severity === "critical").length,
      toolCoverage: enrichedTools.map((tool) => ({
        tool: tool.name,
        category: tool.category,
        risk: tool.risk,
        defaultRouting: semanticRoutingMap[tool.name] ?? []
      }))
    }
  };
}

export function buildDemoAgentProfileSpec(toolRegistry: Map<string, ToolRegistryRow>): AgentProfileSpec {
  return {
    agentProfileId: "agent_profile_support_vulnerable",
    agentName: "Nimbus AX Support Agent",
    agentRole: "support_agent",
    workflows: ["customer_support_reply", "revenue_ops_followup", "internal_escalation"],
    actorRoles: ["support_agent", "sales_manager", "security_lead", "legal_counsel"],
    recipients: ["external_customer", "internal_user"],
    tools: [...toolRegistry.values()].map((tool) => ({
      name: tool.name,
      description: tool.name,
      category: classifyToolCategory(tool.name, tool),
      riskLevel: tool.risk_level,
      sideEffect: tool.side_effect,
      externalEgress: tool.external_egress
    })),
    dataSources: [
      { sourceTable: "tickets", sourceTrust: "external", dataClass: "customer_confidential", authorityScope: "support", egressPolicy: "external_ok" },
      { sourceTable: "ticket_attachments", sourceTrust: "external", dataClass: "customer_confidential", authorityScope: "customer", egressPolicy: "external_ok" },
      { sourceTable: "support_kb_articles", sourceTrust: "system", dataClass: "public", authorityScope: "support", egressPolicy: "external_ok" },
      { sourceTable: "crm_accounts", sourceTrust: "internal", dataClass: "customer_confidential", authorityScope: "sales", egressPolicy: "internal_only" },
      { sourceTable: "contracts", sourceTrust: "internal", dataClass: "restricted", authorityScope: "legal", egressPolicy: "restricted" },
      { sourceTable: "internal_documents", sourceTrust: "internal", dataClass: "restricted", authorityScope: "security", egressPolicy: "restricted" },
      { sourceTable: "slack_messages", sourceTrust: "internal", dataClass: "internal", authorityScope: "admin", egressPolicy: "internal_only" },
      { sourceTable: "agent_memories", sourceTrust: "generated", dataClass: "internal", authorityScope: "admin", egressPolicy: "internal_only" }
    ],
    safeAlternatives: {
      privileged_retrieval: "search_tickets + search_public_kb",
      sensitive_egress: "draft_customer_email from allowed source classes only",
      unauthorized_action: "draft an internal approval request",
      memory_poisoning: "keep customer instructions case-local"
    }
  };
}

export function classifyToolCategory(toolName: string, registry?: ToolRegistryRow): ToolCategory {
  if (toolName === "write_agent_memory") return "memory";
  if (registry?.external_egress || toolName === "send_email" || toolName === "draft_customer_email") return "egress";
  if (registry?.side_effect || toolName.startsWith("update_") || toolName.startsWith("post_")) return "write";
  return "read";
}

function makeRule(input: {
  spec: AgentProfileSpec;
  policyVersion: string;
  ruleCode: string;
  category: EvidencePackCategory;
  severity: HardGateRule["severity"];
  condition: Record<string, unknown>;
  action: HardGateRule["action"];
  rationale: string;
  safeAlternative: string | null;
}): HardGateRule {
  return {
    agent_profile_id: input.spec.agentProfileId,
    policy_version: input.policyVersion,
    rule_code: input.ruleCode,
    category: input.category,
    condition: input.condition,
    action: input.action,
    severity: input.severity,
    rationale: input.rationale,
    safe_alternative: input.safeAlternative,
    example_allowed: input.action === "allow" ? "Manifest-scoped public/customer-visible retrieval." : null,
    example_blocked: input.action === "block" ? input.rationale : null,
    status: "proposed"
  };
}

function riskForCategory(category: ToolCategory): ToolRegistryRow["risk_level"] {
  if (category === "memory" || category === "egress") return "critical";
  if (category === "write") return "high";
  return "low";
}

function defaultCategoriesForTool(toolName: string, category: ToolCategory, externalEgress: boolean): EvidencePackCategory[] {
  if (toolName.includes("contract") || toolName.includes("internal") || toolName.includes("slack")) {
    return ["privileged_retrieval", "authority_confusion"];
  }
  if (category === "memory") return ["memory_poisoning", "authority_confusion"];
  if (category === "write") return ["unauthorized_action", "authority_confusion"];
  if (externalEgress || category === "egress") return ["sensitive_egress", "source_laundering"];
  return ["benign_allow"];
}
