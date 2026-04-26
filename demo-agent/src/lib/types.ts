export type RunMode = "observe" | "enforce";
export type StoredRunMode = RunMode | "baseline" | "patched";
export type ModelMode = "deterministic" | "live";

export type DataClass = "public" | "customer_confidential" | "internal" | "restricted" | "pii";
export type SourceTrust = "external" | "internal" | "system" | "generated";
export type AuthorityScope = "support" | "sales" | "security" | "legal" | "finance" | "admin" | "customer";
export type EgressPolicy = "external_ok" | "internal_only" | "restricted";
export type PolicyDecision = "allowed" | "blocked" | "warned" | "observed";

export type EvidencePackCategory =
  | "authority_confusion"
  | "privileged_retrieval"
  | "sensitive_egress"
  | "unauthorized_action"
  | "memory_poisoning"
  | "source_laundering"
  | "overblocking"
  | "benign_allow"
  | "inconclusive";

export type EvidencePackOutcome =
  | "blocked_violation"
  | "detected_violation"
  | "missed_violation"
  | "overblock"
  | "benign_allowed"
  | "inconclusive";

export type PrecedentStatus = "candidate" | "approved" | "rejected";

export type HardGateAction = "allow" | "block" | "semantic_review";
export type HardGateStatus = "proposed" | "approved" | "rejected";
export type ToolCategory = "read" | "write" | "egress" | "memory";

export type AgentProfileSpec = {
  agentProfileId: string;
  agentName: string;
  agentRole: string;
  workflows: string[];
  actorRoles: string[];
  recipients: Array<"external_customer" | "internal_user" | "system">;
  tools: Array<{
    name: string;
    description?: string;
    category?: ToolCategory;
    riskLevel?: ToolRegistryRow["risk_level"];
    sideEffect?: boolean;
    externalEgress?: boolean;
    targetSources?: string[];
  }>;
  dataSources: Array<{
    sourceTable: string;
    owner?: string;
    sourceTrust?: SourceTrust;
    dataClass?: DataClass;
    authorityScope?: AuthorityScope;
    egressPolicy?: EgressPolicy;
  }>;
  safeAlternatives: Record<string, string>;
};

export type HardGateRule = {
  id?: string;
  agent_profile_id: string;
  policy_version: string;
  rule_code: string;
  category: EvidencePackCategory;
  condition: Record<string, unknown>;
  action: HardGateAction;
  severity: "low" | "medium" | "high" | "critical";
  rationale: string;
  safe_alternative: string | null;
  example_allowed: string | null;
  example_blocked: string | null;
  status: HardGateStatus;
  created_at?: string;
};

export type EvidencePack = {
  id?: string;
  agent_profile_id: string;
  policy_version: string;
  run_id: string;
  case_id: string;
  plan_id: string | null;
  strategy_id: string | null;
  mode: StoredRunMode;
  category: EvidencePackCategory;
  outcome: EvidencePackOutcome;
  decision_subject: Record<string, unknown>;
  source_context: Record<string, unknown>;
  trace_evidence: Record<string, unknown>;
  evaluator_summary: string;
  rejection_reason: string | null;
  safe_alternative: Record<string, unknown> | null;
  confidence: number;
  precedent_status: PrecedentStatus;
  recommended_hard_gate: Record<string, unknown> | null;
  created_at?: string;
};

export type ScenarioCase = {
  id: string;
  case_type: "red_team" | "benign" | "positive_control";
  title: string;
  customer_id: string;
  customer_name?: string;
  user_task: string;
  actor_id: string;
  actor_name?: string;
  attack_surface: string;
  expected_findings: string[];
  expected_allowed_tools: string[];
  expected_forbidden_tools: string[];
  expected_forbidden_data_classes: DataClass[];
  success_criteria: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at?: string;
};

export type IntentManifest = {
  id: string;
  case_id: string;
  actor_id: string;
  user_task: string;
  intent_type: string;
  customer_scope: string[];
  allowed_sources: string[];
  blocked_sources: string[];
  allowed_tools: string[];
  approval_required_tools: string[];
  blocked_tools: string[];
  external_recipient: boolean;
  allowed_output_data_classes: DataClass[];
  blocked_output_data_classes: DataClass[];
  manifest_json: Record<string, unknown>;
};

export type SourceRecord = {
  case_id?: string;
  source_table: string;
  source_id: string;
  role_in_case?: string;
  label?: string;
  text?: string;
  source_trust?: SourceTrust;
  data_class?: DataClass;
  authority_scope?: AuthorityScope;
  egress_policy?: EgressPolicy;
  canary_token?: string | null;
  contains_attack?: boolean;
  attack_case_id?: string | null;
  metadata?: Record<string, unknown>;
};

export type RetrievalChunk = {
  id: string;
  source_table: string;
  source_id: string;
  customer_id: string | null;
  chunk_text: string;
  source_trust: SourceTrust;
  data_class: DataClass;
  authority_scope: AuthorityScope;
  egress_policy: EgressPolicy;
  canary_token: string | null;
  contains_attack: boolean;
  attack_case_id: string | null;
};

export type ToolRegistryRow = {
  name: string;
  risk_level: "low" | "medium" | "high" | "critical";
  allowed_roles: string[];
  required_scope: AuthorityScope;
  side_effect: boolean;
  external_egress: boolean;
  default_policy: "allow" | "approval_required" | "block";
};

export type ToolExecutionResult = {
  ok: boolean;
  summary: string;
  content: unknown;
  sources: SourceRecord[];
  policyDecision: PolicyDecision;
  policyReason: string;
  findingCodes: string[];
};

export type TraceEvent = {
  id: string;
  event_type: string;
  source_table: string | null;
  source_id: string | null;
  source_trust: SourceTrust | null;
  tool_name: string | null;
  args: Record<string, unknown>;
  data_class: DataClass | null;
  authority_scope: AuthorityScope | null;
  policy_decision: PolicyDecision | null;
  policy_reason: string | null;
  created_at: string;
  metadata?: Record<string, unknown>;
};

export type Finding = {
  id: string;
  rule_code: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  evidence: Record<string, unknown>;
  remediation: string;
  created_at: string;
};

export type AgentOutput = {
  id: string;
  content: string;
  recipient_type: "external_customer" | "internal_user" | "system";
  detected_data_classes: DataClass[];
  external_urls: string[];
  policy_decision: PolicyDecision;
  policy_reason: string;
  created_at: string;
};

export type CaseResult = {
  run_id: string;
  case_id: string;
  mode: StoredRunMode;
  attack_success: boolean;
  benign_success: boolean;
  blocked_tool_calls: number;
  sensitive_egress_count: number;
  finding_ids: string[];
  output_id: string | null;
  result_summary: Record<string, unknown>;
  created_at: string;
};

export type CaseDetails = {
  scenario: ScenarioCase;
  manifest: IntentManifest | null;
  seedRecords: SourceRecord[];
  latestResults: CaseResult[];
};
