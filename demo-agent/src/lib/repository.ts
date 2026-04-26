import "server-only";

import { dbOne, dbQuery } from "@/lib/db";
import { makeId } from "@/lib/ids";
import type {
  AgentOutput,
  CaseDetails,
  CaseResult,
  EvidencePack,
  EvidencePackCategory,
  Finding,
  HardGateRule,
  IntentManifest,
  PolicyDecision,
  PrecedentStatus,
  RetrievalChunk,
  RunMode,
  ScenarioCase,
  SourceRecord,
  SourceTrust,
  ToolRegistryRow,
  TraceEvent
} from "@/lib/types";

const SOURCE_TABLES = new Set([
  "customer_contacts",
  "crm_accounts",
  "crm_notes",
  "contracts",
  "tickets",
  "ticket_attachments",
  "support_kb_articles",
  "internal_documents",
  "slack_messages",
  "agent_memories"
]);

type DashboardSummary = {
  totalCases: number;
  redTeamCases: number;
  benignControls: number;
  positiveControls: number;
  latestObserveAttackSuccess: number;
  latestEnforceBlockedCalls: number;
  latestEnforceAttackSuccess: number;
};

export async function getDashboardData() {
  const cases = await getCases();
  const summaryRow = await dbOne<{
    total_cases: string;
    red_team_cases: string;
    benign_controls: string;
    positive_controls: string;
    latest_observe_attack_success: string | null;
    latest_enforce_blocked_calls: string | null;
    latest_enforce_attack_success: string | null;
  }>(`
    WITH latest_observe AS (
      SELECT cr.*
      FROM scope_trace.case_results cr
      JOIN scope_trace.runs r ON r.id = cr.run_id
      WHERE r.mode IN ('observe', 'baseline')
    ), latest_enforce AS (
      SELECT cr.*
      FROM scope_trace.case_results cr
      JOIN scope_trace.runs r ON r.id = cr.run_id
      WHERE r.mode IN ('enforce', 'patched')
    )
    SELECT
      (SELECT count(*) FROM scope_trace.scenario_cases) AS total_cases,
      (SELECT count(*) FROM scope_trace.scenario_cases WHERE case_type = 'red_team') AS red_team_cases,
      (SELECT count(*) FROM scope_trace.scenario_cases WHERE case_type = 'benign') AS benign_controls,
      (SELECT count(*) FROM scope_trace.scenario_cases WHERE case_type = 'positive_control') AS positive_controls,
      (SELECT count(*) FROM latest_observe WHERE attack_success) AS latest_observe_attack_success,
      (SELECT coalesce(sum(blocked_tool_calls), 0) FROM latest_enforce) AS latest_enforce_blocked_calls,
      (SELECT count(*) FROM latest_enforce WHERE attack_success) AS latest_enforce_attack_success
  `);

  const summary: DashboardSummary = {
    totalCases: Number(summaryRow?.total_cases ?? 0),
    redTeamCases: Number(summaryRow?.red_team_cases ?? 0),
    benignControls: Number(summaryRow?.benign_controls ?? 0),
    positiveControls: Number(summaryRow?.positive_controls ?? 0),
    latestObserveAttackSuccess: Number(summaryRow?.latest_observe_attack_success ?? 0),
    latestEnforceBlockedCalls: Number(summaryRow?.latest_enforce_blocked_calls ?? 0),
    latestEnforceAttackSuccess: Number(summaryRow?.latest_enforce_attack_success ?? 0)
  };

  return { summary, cases };
}

export async function getCases() {
  const result = await dbQuery<ScenarioCase & { latest_mode: string | null; latest_status: string | null }>(`
    WITH latest AS (
      SELECT DISTINCT ON (cr.case_id)
        cr.case_id,
        r.mode::text AS latest_mode,
        CASE
          WHEN cr.attack_success THEN 'attack-success'
          WHEN cr.blocked_tool_calls > 0 THEN 'blocked'
          WHEN cr.benign_success THEN 'passed'
          ELSE 'observed'
        END AS latest_status
      FROM scope_trace.case_results cr
      JOIN scope_trace.runs r ON r.id = cr.run_id
      ORDER BY cr.case_id, cr.created_at DESC
    )
    SELECT
      sc.*,
      c.name AS customer_name,
      a.name AS actor_name,
      latest.latest_mode,
      latest.latest_status
    FROM scope_trace.scenario_cases sc
    JOIN scope_trace.customers c ON c.id = sc.customer_id
    JOIN scope_trace.actors a ON a.id = sc.actor_id
    LEFT JOIN latest ON latest.case_id = sc.id
    ORDER BY
      CASE sc.case_type WHEN 'red_team' THEN 0 WHEN 'benign' THEN 1 ELSE 2 END,
      sc.id
  `);
  return result.rows;
}

export async function getCaseDetails(caseId: string): Promise<CaseDetails | null> {
  const scenario = await dbOne<ScenarioCase>(`
    SELECT sc.*, c.name AS customer_name, a.name AS actor_name
    FROM scope_trace.scenario_cases sc
    JOIN scope_trace.customers c ON c.id = sc.customer_id
    JOIN scope_trace.actors a ON a.id = sc.actor_id
    WHERE sc.id = $1
  `, [caseId]);
  if (!scenario) return null;

  const manifest = await dbOne<IntentManifest>("SELECT * FROM scope_trace.intent_manifests WHERE case_id = $1", [caseId]);
  const seedRecords = await getSeedRecords(caseId);
  const latestResults = await getLatestCaseResults(caseId);
  return { scenario, manifest, seedRecords, latestResults };
}

export async function getSeedRecords(caseId: string) {
  const links = await dbQuery<{ source_table: string; source_id: string; role_in_case: string }>(
    "SELECT source_table, source_id, role_in_case FROM scope_trace.scenario_seed_records WHERE case_id = $1 ORDER BY role_in_case, source_table",
    [caseId]
  );
  const records: SourceRecord[] = [];
  for (const link of links.rows) {
    const source = await getSourceRecord(link.source_table, link.source_id);
    records.push({ ...source, case_id: caseId, role_in_case: link.role_in_case });
  }
  return records;
}

export async function getLatestCaseResults(caseId: string) {
  const result = await dbQuery<CaseResult>(`
    SELECT cr.*
    FROM scope_trace.case_results cr
    JOIN scope_trace.runs r ON r.id = cr.run_id
    WHERE cr.case_id = $1
    ORDER BY cr.created_at DESC
    LIMIT 8
  `, [caseId]);
  return result.rows;
}

export async function getRunCaseView(runId: string, caseId: string) {
  const details = await getCaseDetails(caseId);
  if (!details) return null;
  const trace = await dbQuery<TraceEvent>(
    "SELECT * FROM scope_trace.trace_events WHERE run_id = $1 AND case_id = $2 ORDER BY created_at ASC",
    [runId, caseId]
  );
  const findings = await dbQuery<Finding>(
    "SELECT * FROM scope_trace.findings WHERE run_id = $1 AND case_id = $2 ORDER BY created_at ASC",
    [runId, caseId]
  );
  const outputs = await dbQuery<AgentOutput>(
    "SELECT * FROM scope_trace.agent_outputs WHERE run_id = $1 AND case_id = $2 ORDER BY created_at ASC",
    [runId, caseId]
  );
  const result = await dbOne<CaseResult>(
    "SELECT * FROM scope_trace.case_results WHERE run_id = $1 AND case_id = $2",
    [runId, caseId]
  );
  return { ...details, runId, trace: trace.rows, findings: findings.rows, outputs: outputs.rows, result };
}

export async function getReplayData() {
  const replay = await dbQuery<{
    id: string;
    baseline_run_id: string;
    patched_run_id: string;
    summary: Record<string, unknown>;
    created_at: string;
  }>("SELECT * FROM scope_trace.replay_sessions ORDER BY created_at DESC LIMIT 5");
  const rows = await dbQuery<{
    case_id: string;
    title: string;
    case_type: string;
    baseline_attack_success: boolean | null;
    enforce_attack_success: boolean | null;
    enforce_blocked_tool_calls: number | null;
    enforce_sensitive_egress_count: number | null;
  }>(`
    SELECT
      sc.id AS case_id,
      sc.title,
      sc.case_type,
      bool_or(CASE WHEN r.mode IN ('observe', 'baseline') THEN cr.attack_success END) AS baseline_attack_success,
      bool_or(CASE WHEN r.mode IN ('enforce', 'patched') THEN cr.attack_success END) AS enforce_attack_success,
      max(CASE WHEN r.mode IN ('enforce', 'patched') THEN cr.blocked_tool_calls END) AS enforce_blocked_tool_calls,
      max(CASE WHEN r.mode IN ('enforce', 'patched') THEN cr.sensitive_egress_count END) AS enforce_sensitive_egress_count
    FROM scope_trace.scenario_cases sc
    LEFT JOIN scope_trace.case_results cr ON cr.case_id = sc.id
    LEFT JOIN scope_trace.runs r ON r.id = cr.run_id
    GROUP BY sc.id, sc.title, sc.case_type
    ORDER BY CASE sc.case_type WHEN 'red_team' THEN 0 WHEN 'benign' THEN 1 ELSE 2 END, sc.id
  `);
  return { sessions: replay.rows, rows: rows.rows };
}

export async function createRun(mode: RunMode) {
  const runId = makeId(`run_${mode}`);
  await dbQuery(
    "INSERT INTO scope_trace.runs (id, agent_profile_id, mode, summary) VALUES ($1, 'agent_profile_support_vulnerable', $2, $3::jsonb)",
    [runId, mode, JSON.stringify({ source: "demo-agent-web", mode })]
  );
  return runId;
}

export async function createReplaySession(baselineRunId: string, enforceRunId: string, summary: Record<string, unknown>) {
  const replayId = makeId("replay_web");
  await dbQuery(
    "INSERT INTO scope_trace.replay_sessions (id, baseline_run_id, patched_run_id, summary) VALUES ($1, $2, $3, $4::jsonb)",
    [replayId, baselineRunId, enforceRunId, JSON.stringify(summary)]
  );
  return replayId;
}

export async function markRunCompleted(runId: string, summary: Record<string, unknown>) {
  await dbQuery("UPDATE scope_trace.runs SET completed_at = now(), summary = summary || $2::jsonb WHERE id = $1", [
    runId,
    JSON.stringify(summary)
  ]);
}

export async function getIntentManifest(caseId: string) {
  return dbOne<IntentManifest>("SELECT * FROM scope_trace.intent_manifests WHERE case_id = $1", [caseId]);
}

export async function getToolRegistry() {
  const result = await dbQuery<ToolRegistryRow>("SELECT name, risk_level, allowed_roles, required_scope, side_effect, external_egress, default_policy FROM scope_trace.tool_registry");
  return new Map(result.rows.map((row) => [row.name, row]));
}

export async function getApprovedHardGateRules(agentProfileId = "agent_profile_support_vulnerable", policyVersion = "v1") {
  try {
    const result = await dbQuery<HardGateRule>(
      `SELECT *
       FROM scope_trace.hard_gate_rules
       WHERE agent_profile_id = $1 AND policy_version = $2 AND status = 'approved'
       ORDER BY severity DESC, rule_code`,
      [agentProfileId, policyVersion]
    );
    return result.rows;
  } catch (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
}

export async function getHardGateRules(agentProfileId = "agent_profile_support_vulnerable") {
  try {
    const result = await dbQuery<HardGateRule>(
      "SELECT * FROM scope_trace.hard_gate_rules WHERE agent_profile_id = $1 ORDER BY created_at DESC, rule_code",
      [agentProfileId]
    );
    return result.rows;
  } catch (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
}

export async function recordHardGateRules(rules: HardGateRule[]) {
  const ids: string[] = [];
  for (const rule of rules) {
    const id = rule.id ?? makeId("hgr");
    try {
      await dbQuery(
        `INSERT INTO scope_trace.hard_gate_rules
          (id, agent_profile_id, policy_version, rule_code, category, condition, action, severity, rationale, safe_alternative, example_allowed, example_blocked, status)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (agent_profile_id, policy_version, rule_code) DO UPDATE SET
           category = EXCLUDED.category,
           condition = EXCLUDED.condition,
           action = EXCLUDED.action,
           severity = EXCLUDED.severity,
           rationale = EXCLUDED.rationale,
           safe_alternative = EXCLUDED.safe_alternative,
           example_allowed = EXCLUDED.example_allowed,
           example_blocked = EXCLUDED.example_blocked,
           status = EXCLUDED.status`,
        [
          id,
          rule.agent_profile_id,
          rule.policy_version,
          rule.rule_code,
          rule.category,
          JSON.stringify(rule.condition),
          rule.action,
          rule.severity,
          rule.rationale,
          rule.safe_alternative,
          rule.example_allowed,
          rule.example_blocked,
          rule.status
        ]
      );
      ids.push(id);
    } catch (error) {
      if (isMissingRelationError(error)) return ids;
      throw error;
    }
  }
  return ids;
}

export async function updateHardGateRuleStatus(ruleId: string, status: HardGateRule["status"]) {
  await dbQuery("UPDATE scope_trace.hard_gate_rules SET status = $2 WHERE id = $1", [ruleId, status]);
}

export async function updateEvidencePackStatus(packId: string, status: PrecedentStatus) {
  await dbQuery("UPDATE scope_trace.evidence_packs SET precedent_status = $2 WHERE id = $1", [packId, status]);
}

export async function getApprovedEvidencePacks(input: {
  agentProfileId?: string;
  categories?: EvidencePackCategory[];
  limit?: number;
}) {
  try {
    const agentProfileId = input.agentProfileId ?? "agent_profile_support_vulnerable";
    const categories = input.categories?.length ? input.categories : null;
    const limit = input.limit ?? 8;
    const result = await dbQuery<EvidencePack>(
      `SELECT *
       FROM scope_trace.evidence_packs
       WHERE agent_profile_id = $1
         AND precedent_status = 'approved'
         AND ($2::text[] IS NULL OR category = ANY($2::text[]))
       ORDER BY confidence DESC, created_at DESC
       LIMIT $3`,
      [agentProfileId, categories, limit]
    );
    return result.rows;
  } catch (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
}

export async function getEvidencePacks(input: {
  agentProfileId?: string;
  category?: EvidencePackCategory;
  status?: PrecedentStatus;
  limit?: number;
} = {}) {
  try {
    const agentProfileId = input.agentProfileId ?? "agent_profile_support_vulnerable";
    const result = await dbQuery<EvidencePack>(
      `SELECT *
       FROM scope_trace.evidence_packs
       WHERE agent_profile_id = $1
         AND ($2::text IS NULL OR category = $2)
         AND ($3::text IS NULL OR precedent_status = $3)
       ORDER BY created_at DESC
       LIMIT $4`,
      [agentProfileId, input.category ?? null, input.status ?? null, input.limit ?? 50]
    );
    return result.rows;
  } catch (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
}

export async function recordEvidencePack(pack: EvidencePack) {
  const id = pack.id ?? makeId("evp");
  await dbQuery(
    `INSERT INTO scope_trace.evidence_packs
      (id, agent_profile_id, policy_version, run_id, case_id, plan_id, strategy_id, mode, category, outcome,
       decision_subject, source_context, trace_evidence, evaluator_summary, rejection_reason, safe_alternative,
       confidence, precedent_status, recommended_hard_gate)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15, $16::jsonb, $17, $18, $19::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [
      id,
      pack.agent_profile_id,
      pack.policy_version,
      pack.run_id,
      pack.case_id,
      pack.plan_id,
      pack.strategy_id,
      pack.mode,
      pack.category,
      pack.outcome,
      JSON.stringify(pack.decision_subject),
      JSON.stringify(pack.source_context),
      JSON.stringify(pack.trace_evidence),
      pack.evaluator_summary,
      pack.rejection_reason,
      pack.safe_alternative ? JSON.stringify(pack.safe_alternative) : null,
      pack.confidence,
      pack.precedent_status,
      pack.recommended_hard_gate ? JSON.stringify(pack.recommended_hard_gate) : null
    ]
  );
  return id;
}

export async function recordEvidencePacks(packs: EvidencePack[]) {
  const ids: string[] = [];
  for (const pack of packs) {
    try {
      ids.push(await recordEvidencePack(pack));
    } catch (error) {
      if (isMissingRelationError(error)) return ids;
      throw error;
    }
  }
  return ids;
}

export async function searchChunks(input: {
  sourceTables: string[];
  query: string;
  customerId?: string;
  limit?: number;
  dataClasses?: string[];
  authorityScope?: string;
}) {
  const limit = input.limit ?? 6;
  const terms = input.query
    .trim()
    .split(/\s+/)
    .map((term) => term.replace(/[^a-zA-Z0-9_#-]/g, ""))
    .filter((term) => term.length > 2)
    .slice(0, 8);
  const queryPatterns = terms.length ? terms.map((term) => `%${term}%`) : ["%%"];
  const params: unknown[] = [input.sourceTables, queryPatterns, limit];
  let where = "source_table = ANY($1) AND chunk_text ILIKE ANY($2::text[])";
  if (input.customerId) {
    params.push(input.customerId);
    where += ` AND (customer_id = $${params.length} OR customer_id IS NULL)`;
  }
  if (input.dataClasses?.length) {
    params.push(input.dataClasses);
    where += ` AND data_class = ANY($${params.length})`;
  }
  if (input.authorityScope) {
    params.push(input.authorityScope);
    where += ` AND authority_scope = $${params.length}`;
  }
  const result = await dbQuery<RetrievalChunk>(
    `SELECT * FROM scope_trace.retrieval_chunks WHERE ${where} ORDER BY contains_attack DESC, data_class DESC, id LIMIT $3`,
    params
  );
  return result.rows;
}

export async function getSourceRecord(sourceTable: string, sourceId: string): Promise<SourceRecord> {
  if (!SOURCE_TABLES.has(sourceTable)) {
    throw new Error(`Unsupported source table: ${sourceTable}`);
  }
  const idColumn = sourceTable === "crm_accounts" ? "customer_id" : "id";
  const row = await dbOne<Record<string, unknown>>(
    `SELECT to_jsonb(t.*) AS row FROM scope_trace.${sourceTable} t WHERE ${idColumn} = $1`,
    [sourceId]
  );
  const data = (row?.row ?? {}) as Record<string, unknown>;
  return normalizeSourceRecord(sourceTable, sourceId, data);
}

export async function recordTraceEvent(input: {
  runId: string;
  caseId: string;
  eventType: string;
  source?: SourceRecord | null;
  toolName?: string | null;
  args?: Record<string, unknown>;
  policyDecision?: PolicyDecision | null;
  policyReason?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const eventId = makeId("evt");
  await dbQuery(
    `INSERT INTO scope_trace.trace_events
      (id, run_id, case_id, event_type, source_table, source_id, source_trust, tool_name, args, data_class, authority_scope, policy_decision, policy_reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14::jsonb)`,
    [
      eventId,
      input.runId,
      input.caseId,
      input.eventType,
      input.source?.source_table ?? null,
      input.source?.source_id ?? null,
      input.source?.source_trust ?? null,
      input.toolName ?? null,
      JSON.stringify(input.args ?? {}),
      input.source?.data_class ?? null,
      input.source?.authority_scope ?? null,
      input.policyDecision ?? null,
      input.policyReason ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  );
  if (input.source) {
    await recordTraceEventSource(eventId, input.source, input.eventType === "tool_call_blocked" ? "policy_evidence" : "suspected_cause");
  }
  return eventId;
}

export async function recordTraceEventSource(eventId: string, source: SourceRecord, influenceType: string) {
  await dbQuery(
    "INSERT INTO scope_trace.trace_event_sources (id, event_id, source_table, source_id, influence_type, metadata) VALUES ($1, $2, $3, $4, $5, $6::jsonb)",
    [makeId("tes"), eventId, source.source_table, source.source_id, influenceType, JSON.stringify({ label: source.label ?? null })]
  );
}

export async function recordFinding(input: {
  runId: string;
  caseId: string;
  ruleCode: string;
  title: string;
  evidence: Record<string, unknown>;
  remediation: string;
}) {
  const rule = await dbOne<{ severity: Finding["severity"]; title: string }>("SELECT severity, title FROM scope_trace.policy_rules WHERE code = $1", [input.ruleCode]);
  const id = makeId(`finding_${input.ruleCode.toLowerCase()}`);
  await dbQuery(
    "INSERT INTO scope_trace.findings (id, run_id, case_id, rule_code, severity, title, evidence, remediation) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)",
    [id, input.runId, input.caseId, input.ruleCode, rule?.severity ?? "medium", input.title || rule?.title || input.ruleCode, JSON.stringify(input.evidence), input.remediation]
  );
  return id;
}

export async function getFindingRuleCodes(findingIds: string[]) {
  if (!findingIds.length) return [];
  const result = await dbQuery<{ rule_code: string }>(
    "SELECT DISTINCT rule_code FROM scope_trace.findings WHERE id = ANY($1) ORDER BY rule_code",
    [findingIds]
  );
  return result.rows.map((row) => row.rule_code);
}

export async function recordAgentOutput(input: {
  runId: string;
  caseId: string;
  recipientType: "external_customer" | "internal_user" | "system";
  recipientCustomerId?: string | null;
  content: string;
  referencedSourceRefs: Array<{ source_table: string; source_id: string }>;
  detectedDataClasses: string[];
  externalUrls: string[];
  policyDecision: PolicyDecision;
  policyReason: string;
}) {
  const id = makeId("out");
  await dbQuery(
    `INSERT INTO scope_trace.agent_outputs
      (id, run_id, case_id, recipient_type, recipient_customer_id, content, referenced_source_refs, detected_data_classes, external_urls, policy_decision, policy_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)`,
    [
      id,
      input.runId,
      input.caseId,
      input.recipientType,
      input.recipientCustomerId ?? null,
      input.content,
      JSON.stringify(input.referencedSourceRefs),
      input.detectedDataClasses,
      input.externalUrls,
      input.policyDecision,
      input.policyReason
    ]
  );
  return id;
}

export async function recordCaseResult(input: {
  runId: string;
  caseId: string;
  mode: RunMode;
  attackSuccess: boolean;
  benignSuccess: boolean;
  blockedToolCalls: number;
  sensitiveEgressCount: number;
  findingIds: string[];
  outputId: string;
  resultSummary: Record<string, unknown>;
}) {
  await dbQuery(
    `INSERT INTO scope_trace.case_results
      (run_id, case_id, mode, attack_success, benign_success, blocked_tool_calls, sensitive_egress_count, finding_ids, output_id, result_summary)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     ON CONFLICT (run_id, case_id) DO UPDATE SET
       attack_success = EXCLUDED.attack_success,
       benign_success = EXCLUDED.benign_success,
       blocked_tool_calls = EXCLUDED.blocked_tool_calls,
       sensitive_egress_count = EXCLUDED.sensitive_egress_count,
       finding_ids = EXCLUDED.finding_ids,
       output_id = EXCLUDED.output_id,
       result_summary = EXCLUDED.result_summary,
       created_at = now()`,
    [
      input.runId,
      input.caseId,
      input.mode,
      input.attackSuccess,
      input.benignSuccess,
      input.blockedToolCalls,
      input.sensitiveEgressCount,
      input.findingIds,
      input.outputId,
      JSON.stringify(input.resultSummary)
    ]
  );
}

function normalizeSourceRecord(sourceTable: string, sourceId: string, data: Record<string, unknown>): SourceRecord {
  const label =
    String(data.title ?? data.subject ?? data.filename ?? data.name ?? data.email ?? sourceId);
  const text =
    String(data.body ?? data.extracted_text ?? data.summary ?? data.content ?? data.email ?? label);
  return {
    source_table: sourceTable,
    source_id: sourceId,
    label,
    text,
    source_trust: data.source_trust as SourceTrust | undefined,
    data_class: data.data_class as SourceRecord["data_class"],
    authority_scope: data.authority_scope as SourceRecord["authority_scope"],
    egress_policy: data.egress_policy as SourceRecord["egress_policy"],
    canary_token: typeof data.canary_token === "string" ? data.canary_token : null,
    contains_attack: Boolean(data.contains_attack),
    attack_case_id: typeof data.attack_case_id === "string" ? data.attack_case_id : null,
    metadata: (data.metadata ?? {}) as Record<string, unknown>
  };
}

function isMissingRelationError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  const message = error instanceof Error ? error.message : String(error);
  return code === "42P01" || message.includes("does not exist");
}
