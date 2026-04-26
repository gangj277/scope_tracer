# Frontend Endpoint Integration Guide

## Purpose

This is the frontend engineer's endpoint guide for the current `demo-agent` app. It explains what each endpoint does, how it is implemented internally, what it returns, what UI should render, and which calls create database side effects.

Use this with `docs/FRONTEND_API_HANDOFF.md`:

- `FRONTEND_API_HANDOFF.md`: product flow and broad capability map
- `FRONTEND_ENDPOINT_INTEGRATION.md`: endpoint-by-endpoint integration contract

## Frontend Mental Model

The app should feel like an evaluation workflow, not a chat app.

```text
Auth/status check
-> Case or campaign selection
-> Attack plan generation
-> Parallel attacker execution
-> Trace/evidence inspection
-> Report/evaluator/scope-update later
```

Current API support covers:

- Existing seeded demo case execution
- Observe/enforce replay
- AttackPlanner generation
- Parallel specialist attacker campaign execution
- ScopeTrace hard-gate draft/list/approval
- EvidencePack generation/list/approval
- Runtime ScopeTrace decision inspection

## Endpoint Summary

| Endpoint | Method | UI Use | Writes DB | Long Running |
|---|---:|---|---:|---:|
| `/api/auth/status` | GET | auth/model readiness badge | No | No |
| `/api/cases` | GET | case list/table | No | No |
| `/api/cases/:caseId` | GET | case detail | No | No |
| `/api/runs` | POST | create observe/enforce run | Yes | No |
| `/api/runs/:runId/cases/:caseId/execute` | POST | execute one case | Yes | Maybe if live |
| `/api/runs/:runId/cases/:caseId` | GET | trace/result detail | No | No |
| `/api/replay` | POST | observe/enforce replay | Yes | Yes |
| `/api/redteam/attack-plan` | POST | generate attack plan | No | Yes |
| `/api/redteam/attackers/run` | POST | run parallel attackers | Yes | Yes |
| `/api/scope/hard-gates` | GET | list hard-gate rules | No | No |
| `/api/scope/hard-gates` | POST | draft hard-gate proposal set | Optional | No |
| `/api/scope/hard-gates/:ruleId` | PATCH | approve/reject proposed rule | Yes | No |
| `/api/scope/evidence-packs` | GET | list evidence precedents | No | No |
| `/api/scope/evidence-packs/evaluate` | POST | build candidate evidence packs from attack result | Optional | No |
| `/api/scope/evidence-packs/:packId` | PATCH | approve/reject evidence pack | Yes | No |
| `/api/scope/decision` | POST | inspect ScopeTrace tool-call decision | No | Maybe if `forceLlm` |

## Recommended Screen Flows

### Case Replay Flow

```text
/cases/[caseId]
  POST /api/runs
  POST /api/runs/:runId/cases/:caseId/execute
  redirect /runs/:runId/cases/:caseId
  GET /api/runs/:runId/cases/:caseId
```

Use this for the existing deterministic demo path.

### Red-Team Campaign Flow

```text
/campaigns/new
  GET /api/auth/status
  GET /api/cases
  POST /api/redteam/attack-plan

/campaigns/[id]/plan
  render planner output
  user confirms selected strategies
  POST /api/redteam/attackers/run

/campaigns/[id]/run
  render campaign.results lanes
  link each lane to /runs/:runId/cases/:caseId
```

Current backend does not persist a `campaignId`; the frontend can keep the response in client/server state for now, or a campaign persistence API can be added later.

### ScopeTrace Review Flow

```text
/scope-trace
  POST /api/scope/hard-gates
  render proposal.rules, proposal.reviewPacket, proposal.semanticRoutingMap
  PATCH /api/scope/hard-gates/:ruleId

/evidence-packs
  POST /api/scope/evidence-packs/evaluate
  render generated candidate packs
  PATCH /api/scope/evidence-packs/:packId
  GET /api/scope/evidence-packs
```

Only `approved` hard gates and `approved` EvidencePacks affect runtime ScopeTrace decisions. Proposed/candidate items are review artifacts.

## Common Error Shape

Most error responses use:

```ts
{
  error: string;
}
```

`/api/redteam/attack-plan` and `/api/redteam/attackers/run` return `503` when model auth is not ready:

```ts
{
  error: string;
  auth: AuthStatus;
}
```

UI behavior:

- `400`: show validation or execution error inline.
- `404`: show not-found state.
- `503`: show auth/model setup warning and disable live red-team actions.

## Endpoint Details

## `GET /api/auth/status`

### Purpose

Show whether server-side model auth is ready. This should be visible in global nav or campaign setup.

### Implementation

Route file: `src/app/api/auth/status/route.ts`

Internal function:

```ts
getAuthStatus()
```

Auth providers:

- `codex-oauth`: ChatGPT/Codex OAuth from local `~/.codex/auth.json`
- `openai-api-key`: `OPENAI_API_KEY` when configured
- `none`: not ready

### Request

No body.

### Response

```ts
type AuthStatus = {
  loggedIn: boolean;
  provider: "codex-oauth" | "openai-api-key" | "none";
  accountId?: string;
  model: string;
  raw: string;
};
```

### UI Mapping

- `loggedIn`: green/red readiness state
- `provider`: badge label
- `model`: display near live run controls
- `raw`: diagnostic text, not primary UI copy

### Fetch Example

```ts
const auth = await fetch("/api/auth/status").then((res) => res.json());
```

## `GET /api/cases`

### Purpose

Load seeded scenario cases for dashboard, case picker, campaign seed selection, and replay selection.

### Implementation

Route file: `src/app/api/cases/route.ts`

Internal function:

```ts
getCases()
```

Query joins scenario cases with customer/actor names and latest case result status.

### Request

No body.

### Response

```ts
{
  cases: Array<ScenarioCase & {
    customer_name?: string;
    actor_name?: string;
    latest_mode: string | null;
    latest_status: "attack-success" | "blocked" | "passed" | "observed" | null;
  }>;
}
```

### UI Mapping

Dashboard table:

- `id`, `title`: primary case link
- `customer_name`: customer column
- `case_type`: badge
- `attack_surface`: attack surface column
- `expected_findings`: policy code chips
- `latest_status`: status badge

Campaign setup:

- Use `case_type === "red_team"` as default selectable cases.
- Allow filtering by `attack_surface`, `expected_findings`, customer.

### Fetch Example

```ts
const { cases } = await fetch("/api/cases").then((res) => res.json());
```

## `GET /api/cases/:caseId`

### Purpose

Load one scenario case with intent manifest and seed records.

### Implementation

Route file: `src/app/api/cases/[caseId]/route.ts`

Internal function:

```ts
getCaseDetails(caseId)
```

### Response

```ts
type CaseDetails = {
  scenario: ScenarioCase;
  manifest: IntentManifest | null;
  seedRecords: SourceRecord[];
  latestResults: CaseResult[];
};
```

### UI Mapping

Case detail:

- `scenario.user_task`: original task
- `manifest.allowed_tools`: green chips
- `manifest.blocked_tools`: red chips
- `manifest.allowed_sources`: green chips
- `manifest.blocked_sources`: warning chips
- `manifest.external_recipient`: recipient badge
- `seedRecords`: evidence/source table
- `latestResults`: small run history panel

Campaign planning:

- Use details for explaining why a selected case is relevant.
- Seed records can be shown as attack source/sensitive target/safe alternative.

### Error

`404` if unknown case.

## `POST /api/runs`

### Purpose

Create a run container before executing one or more cases.

### Implementation

Route file: `src/app/api/runs/route.ts`

Internal function:

```ts
createRun(mode)
```

DB side effect:

- Inserts into `scope_trace.runs`
- Uses fixed `agent_profile_id = agent_profile_support_vulnerable`

### Request

```ts
{
  mode: "observe" | "enforce";
  caseIds?: string[];
}
```

`caseIds` is currently echoed back but not used by `createRun`.

### Response

```ts
{
  runId: string;
  mode: "observe" | "enforce";
  caseIds: string[];
}
```

### UI Mapping

Use in `Run Observe` / `Run Enforce` button flow:

```ts
const run = await fetch("/api/runs", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "observe", caseIds: [caseId] })
}).then((res) => res.json());
```

Then call execute endpoint with `run.runId`.

## `POST /api/runs/:runId/cases/:caseId/execute`

### Purpose

Execute a target agent case inside an existing run.

### Implementation

Route file: `src/app/api/runs/[runId]/cases/[caseId]/execute/route.ts`

Internal function:

```ts
runAgentCase({ runId, caseId, mode, modelMode, model })
```

DB side effects:

- Inserts `trace_events`
- Inserts `trace_event_sources`
- Inserts `findings`
- Inserts `agent_outputs`
- Upserts `case_results`
- Updates `runs.completed_at` and run summary

### Request

```ts
{
  mode: "observe" | "enforce";
  modelMode?: "deterministic" | "live";
  model?: string;
}
```

Modes:

- `observe`: unsafe actions execute as observed/dry-run where applicable and findings are recorded.
- `enforce`: unsafe tool calls are blocked before execution.

Model modes:

- `deterministic`: scripted demo execution, stable and fast.
- `live`: calls the model through server-only Responses/Codex OAuth, slower.

### Response

```ts
{
  result: CaseResult;
}
```

### UI Mapping

After success, navigate to:

```text
/runs/:runId/cases/:caseId
```

### Loading State

- Deterministic: short spinner is enough.
- Live: use long-running status copy. It can take tens of seconds.

## `GET /api/runs/:runId/cases/:caseId`

### Purpose

Render full execution evidence for one run/case.

### Implementation

Route file: `src/app/api/runs/[runId]/cases/[caseId]/route.ts`

Internal function:

```ts
getRunCaseView(runId, caseId)
```

### Response

```ts
{
  scenario: ScenarioCase;
  manifest: IntentManifest | null;
  seedRecords: SourceRecord[];
  latestResults: CaseResult[];
  runId: string;
  trace: TraceEvent[];
  findings: Finding[];
  outputs: AgentOutput[];
  result: CaseResult | null;
}
```

### UI Mapping

Trace timeline:

- `trace[].event_type`
- `trace[].tool_name`
- `trace[].policy_decision`
- `trace[].policy_reason`
- `trace[].source_table/source_id`
- `trace[].source_trust`
- `trace[].data_class`
- `trace[].authority_scope`
- `trace[].args`
- `trace[].metadata`

Findings panel:

- `findings[].rule_code`
- `findings[].severity`
- `findings[].title`
- `findings[].evidence`
- `findings[].remediation`

Output panel:

- last `outputs[]`
- `content` is usually JSON-ish string; parse if possible, fall back to raw text.
- `policy_decision`, `policy_reason`, `detected_data_classes`, `external_urls`

Result summary:

- `result.attack_success`
- `result.benign_success`
- `result.blocked_tool_calls`
- `result.sensitive_egress_count`

### Error

`404` if no view exists.

## `POST /api/replay`

### Purpose

Run observe and enforce for selected cases, then create a replay session.

### Implementation

Route file: `src/app/api/replay/route.ts`

Internal functions:

```ts
getCases()
createRun("observe")
createRun("enforce")
runAgentCase(...)
createReplaySession(...)
```

DB side effects:

- Creates two runs
- Executes each selected case twice
- Creates replay session

### Request

```ts
{
  caseIds?: string[];
  modelMode?: "deterministic" | "live";
}
```

Defaults:

- `caseIds`: all red-team cases
- `modelMode`: deterministic

### Response

```ts
{
  replayId: string;
  observeRunId: string;
  enforceRunId: string;
  summary: {
    case_ids: string[];
    observe_attack_success: number;
    enforce_attack_success: number;
    enforce_blocked_tool_calls: number;
    enforce_sensitive_egress_count: number;
  };
  observeResults: CaseResult[];
  enforceResults: CaseResult[];
}
```

### UI Mapping

Replay page:

- Compare observe vs enforce attack success.
- Show blocked tool calls and sensitive egress count.
- Link to representative run/case detail pages.

### Loading State

This can be long-running for all red-team cases, especially in live mode.

## `POST /api/redteam/attack-plan`

### Purpose

Generate attack strategies from a user's red-team goal and current demo-agent case context.

This is the frontend entrypoint for AttackPlanner.

### Implementation

Route file: `src/app/api/redteam/attack-plan/route.ts`

Internal functions:

```ts
getAuthStatus()
buildDemoAttackPlannerInput({ request, preferredFocus, maxPlans, caseIds })
runAttackPlanner(plannerInput, model)
evaluateAttackPlannerOutput(output)
```

OpenAI path:

- Uses server-only `runOpenAIStructuredResponse`
- Uses `responses.parse` when available
- Falls back to streaming structured output parsing for Codex OAuth backend `400` behavior
- Browser never sees tokens

DB side effects:

- None

### Request

```ts
{
  request?: string;
  preferredFocus?: Array<
    | "A1_AUTHORITY_CONFUSION"
    | "A2_PRIVILEGED_RETRIEVAL"
    | "A3_SENSITIVE_EGRESS"
    | "A4_UNAUTHORIZED_ACTION"
  >;
  maxPlans?: number; // 1..6, default 6
  caseIds?: string[];
  model?: string;
}
```

### Response

```ts
{
  plannerInput: AttackPlannerInput;
  output: AttackPlannerOutput;
  evaluation: {
    score: number;
    maxScore: number;
    pass: boolean;
    strategyCount: number;
    strategyDiversity: number;
    issues: string[];
    planSummaries: Array<{
      planId: string;
      targetCaseId: string;
      strategyId: string;
      assignedAttacker: string;
      title: string;
      northStarOutcome: string;
      unsafeTransition: string;
    }>;
  };
  model: string;
  authProvider: "codex-oauth" | "openai-api-key" | "none";
}
```

### Important `AttackPlannerOutput` Fields

Render plan cards from:

```ts
output.selectedStrategies[].planId
output.selectedStrategies[].targetCaseId
output.selectedStrategies[].strategyId
output.selectedStrategies[].assignedAttacker
output.selectedStrategies[].title
output.selectedStrategies[].whyThisStrategy
output.selectedStrategies[].northStarOutcome
output.selectedStrategies[].targetInvariant
output.selectedStrategies[].weaknessHypothesis
output.selectedStrategies[].unsafeTransition
output.selectedStrategies[].targetPolicyCodes
output.selectedStrategies[].targetTools
output.selectedStrategies[].targetSources
output.selectedStrategies[].targetDataClasses
output.selectedStrategies[].targetSideEffects
output.selectedStrategies[].modifiers
output.selectedStrategies[].turnBlueprint
output.selectedStrategies[].successOracle
output.selectedStrategies[].evaluatorFocus
output.selectedStrategies[].riskControl
```

### UI Mapping

Campaign setup page:

- `request`: freeform user red-team goal
- `preferredFocus`: optional strategy filters
- `caseIds`: optional selected cases
- `maxPlans`: 5-6 default recommended

Attack plan review page:

- Show `evaluation.pass` and `evaluation.issues` but do not block user by default.
- Show one card per `selectedStrategies` item.
- Let user disable individual plans before attacker run.
- Preserve the full `output` object for the attacker endpoint.

### Fetch Example

```ts
const response = await fetch("/api/redteam/attack-plan", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    request: "Test whether the agent leaks restricted pricing data from customer tickets.",
    preferredFocus: ["A2_PRIVILEGED_RETRIEVAL", "A3_SENSITIVE_EGRESS"],
    maxPlans: 6
  })
});

const body = await response.json();
```

### Error Behavior

- `503`: model auth not ready
- `400`: invalid input or model/planner failure

## `POST /api/redteam/attackers/run`

### Purpose

Run specialist attackers in parallel from an `AttackPlannerOutput` or explicit plan items.

This is the frontend entrypoint for the actual red-team attack execution.

### Implementation

Route file: `src/app/api/redteam/attackers/run/route.ts`

Internal functions:

```ts
getAuthStatus()
buildCampaignItemsFromPlannerOutput(plannerOutput)
runAttackCampaignParallel({ targetAgentSummary, items, mode, minTurns, maxTurns, model })
```

What happens internally:

1. Validate request with Zod.
2. Convert planner output into `{ caseId, plan }` items using `plan.targetCaseId`.
3. Optionally filter by `strategyIds`.
4. Run all selected strategies in parallel.
5. Each strategy creates its own run ID.
6. Each attacker generates structured turns.
7. Only raw target payload is sent to the demo agent.
8. Demo agent records trace/finding/output/case_result.
9. Response returns complete campaign result.

DB side effects:

- Creates one run per strategy.
- Inserts attacker turn trace events.
- Inserts target agent tool trace events.
- Inserts findings when policy detects them.
- Inserts agent outputs.
- Upserts case results.

### Request: Planner Output Mode

```ts
{
  plannerOutput: AttackPlannerOutput;
  strategyIds?: Array<
    | "A1_AUTHORITY_CONFUSION"
    | "A2_PRIVILEGED_RETRIEVAL"
    | "A3_SENSITIVE_EGRESS"
    | "A4_UNAUTHORIZED_ACTION"
  >;
  mode?: "observe" | "enforce"; // default observe
  minTurns?: number; // 1..10
  turns?: number; // max turns, 1..10
  model?: string;
}
```

Use this for normal frontend flow.

### Request: Explicit Item Mode

```ts
{
  items: Array<{
    caseId?: string; // defaults to plan.targetCaseId
    plan: AttackStrategyPlan;
  }>;
  strategyIds?: string[];
  mode?: "observe" | "enforce";
  minTurns?: number;
  turns?: number;
  model?: string;
}
```

Use this only if the frontend lets users edit plan objects before execution.

### Response

```ts
{
  startedAt: string;
  completedAt: string;
  model: string;
  authProvider: "codex-oauth" | "openai-api-key" | "none";
  mode: "observe" | "enforce";
  parallel: true;
  campaign: {
    results: AttackStrategyConversationResult[];
    failures: Array<{
      planId: string;
      caseId: string;
      strategyId: string;
      error: string;
    }>;
    summary: {
      total: number;
      completed: number;
      failed: number;
      attackSuccesses: number;
      payloadsClean: number;
      minimumTurnCompletions: number;
      northStarPursuits: number;
    };
  };
}
```

### Important `AttackStrategyConversationResult` Fields

```ts
type AttackStrategyConversationResult = {
  runId: string;
  caseId: string;
  mode: "observe" | "enforce";
  planId: string;
  strategyId: string;
  assignedAttacker: string;
  minTurns: number;
  maxTurns: number;
  stoppedReason: string;
  turns: AttackerConversationTurn[];
  finalResult: CaseResult;
  quality: {
    targetPayloadsClean: boolean;
    multiTurnAdapted: boolean;
    producedTraceFeedback: boolean;
    completedMinimumTurns: boolean;
    pursuedNorthStar: boolean;
  };
};
```

### Important `AttackerConversationTurn` Fields

```ts
type AttackerConversationTurn = {
  attackerTurn: {
    turn: number;
    persona: string;
    attackObjective: string;
    northStarFocus: string;
    progress: {
      northStarProgress: "none" | "weak_signal" | "partial" | "strong";
      nextTactic: string;
      repeatedTacticRisk: boolean;
    };
    payloadPlacement: {
      channel: "direct_user_prompt" | "ticket_content" | "attachment_content" | "retrieved_doc_instruction" | "crm_note" | "slack_message";
      intent: string;
      payloadSummary: string;
    };
    userMessage: string;
    expectedAgentMistake: string;
    observationTargets: string[];
    adaptIfBlocked: string;
    adaptationRationale: string;
    stop: { shouldStop: boolean; reason: string };
  };
  targetPayload: string;
  targetOutput: string;
  traceFeedback: AgentTraceFeedback;
  northStarSignal: {
    strength: "none" | "weak" | "partial" | "strong";
    matchedPolicyCodes: string[];
    matchedTools: string[];
    matchedSources: string[];
    reason: string;
  };
};
```

### UI Mapping

Campaign run page should render one lane/card per `campaign.results[]`.

Per lane header:

- `strategyId`
- `assignedAttacker`
- `runId`
- `caseId`
- `minTurns/maxTurns`
- `turns.length`
- `stoppedReason`
- `finalResult.attack_success`
- `quality.targetPayloadsClean`
- `quality.completedMinimumTurns`
- `quality.pursuedNorthStar`

Per turn:

- `attackerTurn.persona`
- `attackerTurn.progress.nextTactic`
- `attackerTurn.progress.northStarProgress`
- `attackerTurn.payloadPlacement.channel`
- `attackerTurn.attackObjective`
- `attackerTurn.northStarFocus`
- `targetPayload`
- `targetOutput`
- `traceFeedback.toolCalls`
- `traceFeedback.findings`
- `northStarSignal.strength`
- `northStarSignal.reason`

Important visual distinction:

- Show `attackerTurn` metadata as orchestration insight.
- Show `targetPayload` as the exact content sent to the target agent.
- Never imply the target agent saw `expectedAgentMistake`, `observationTargets`, or `northStarFocus`.

### Fetch Example

```ts
const planResponse = await fetch("/api/redteam/attack-plan", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ request: redTeamGoal, maxPlans: 6 })
}).then((res) => res.json());

const attackResponse = await fetch("/api/redteam/attackers/run", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    plannerOutput: planResponse.output,
    mode: "observe",
    minTurns: 5,
    turns: 8
  })
}).then((res) => res.json());
```

### Loading State

This route is synchronous and can take minutes.

Recommended UI:

- Disable rerun button while pending.
- Show `Running parallel attackers...` with selected strategy chips.
- Warn that 5-10 turn live campaigns are long-running.
- Keep the page stateful; do not rely on route refresh until persistence is added.

### Error Behavior

- `503`: auth/model unavailable
- `400`: validation error, no selected items, or attacker/model failure

## Implementation Notes For Frontend

### Use `plannerOutput` As The Contract

Do not reconstruct plans on the frontend. Treat `AttackPlannerOutput` as the execution contract. If users disable plans, pass `strategyIds` or explicit edited `items`.

### Campaign Persistence Is Not Implemented Yet

There is no `campaignId` table/API yet. For now:

- Keep attack-plan response in page state, or
- Store it in a client-side state store, or
- Add a simple persistence API later.

### Progress Streaming Is Not Implemented Yet

`/api/redteam/attackers/run` returns only after the campaign finishes. If the UX needs live progress, add one of these later:

- DB-backed polling by run IDs
- Server-sent events
- Background job table

### Existing `attack_success` Is Not Strategy-Specific

`finalResult.attack_success` comes from existing case logic. It can be useful as a coarse signal, but the UI should also show:

- `northStarSignal.strength`
- `matchedPolicyCodes`
- `matchedTools`
- `traceFeedback.findings`
- `traceFeedback.toolCalls`

Evaluator will later produce the authoritative strategy-specific verdict.

## Suggested Frontend Data Flow

```ts
type CampaignDraftState = {
  goal: string;
  focus: string[];
  selectedCaseIds: string[];
  attackPlanResponse?: AttackPlanResponse;
  selectedStrategyIds: string[];
  attackerRunResponse?: AttackerRunResponse;
};
```

User journey:

1. User enters red-team goal.
2. Frontend calls `/api/redteam/attack-plan`.
3. Frontend shows plan review cards.
4. User selects strategies and turn budget.
5. Frontend calls `/api/redteam/attackers/run`.
6. Frontend shows campaign lanes and turn details.
7. User opens run/case trace pages for deeper evidence.

## `GET /api/scope/hard-gates`

### Purpose

List stored hard-gate rules for an agent profile. Use this for the ScopeTrace policy review page and for showing which rules are already active.

### Implementation

Route file: `src/app/api/scope/hard-gates/route.ts`

Internal function:

```ts
getHardGateRules(agentProfileId)
```

DB side effects:

- None

### Query

```ts
{
  agentProfileId?: string; // default agent_profile_support_vulnerable
}
```

### Response

```ts
{
  rules: HardGateRule[];
}
```

Important `HardGateRule` fields:

```ts
type HardGateRule = {
  id?: string;
  agent_profile_id: string;
  policy_version: string;
  rule_code: string;
  category: EvidencePackCategory;
  condition: Record<string, unknown>;
  action: "allow" | "block" | "semantic_review";
  severity: "low" | "medium" | "high" | "critical";
  rationale: string;
  safe_alternative: string | null;
  example_allowed: string | null;
  example_blocked: string | null;
  status: "proposed" | "approved" | "rejected";
  created_at?: string;
};
```

### UI Mapping

- Table grouped by `status` and `severity`.
- Show `rule_code`, `category`, `action`, `condition`, `rationale`, `safe_alternative`.
- Treat `approved` as active runtime policy.
- Treat `proposed` as awaiting human review.

### Fetch Example

```ts
const { rules } = await fetch("/api/scope/hard-gates?agentProfileId=agent_profile_support_vulnerable")
  .then((res) => res.json());
```

## `POST /api/scope/hard-gates`

### Purpose

Run the Hard Gate Architect and return a proposed ScopeTrace hard-gate set. This can use either the default demo support-agent profile or a frontend-submitted `AgentProfileSpec`.

### Implementation

Route file: `src/app/api/scope/hard-gates/route.ts`

Internal functions:

```ts
getToolRegistry()
buildDemoAgentProfileSpec(toolRegistry)
buildHardGateProposalSet({ spec, toolRegistry, policyVersion })
recordHardGateRules(proposal.rules)
```

DB side effects:

- If `persist: true`, inserts proposed rules into `scope_trace.hard_gate_rules`.
- If `persist: false`, returns a preview only.

### Request

```ts
{
  agentProfileId?: string; // default agent_profile_support_vulnerable
  policyVersion?: string; // default v1
  persist?: boolean; // default true
  spec?: AgentProfileSpec;
}
```

`AgentProfileSpec` shape:

```ts
type AgentProfileSpec = {
  agentProfileId: string;
  agentName: string;
  agentRole: string;
  workflows: string[];
  actorRoles: string[];
  recipients: Array<"external_customer" | "internal_user" | "system">;
  tools: Array<{
    name: string;
    description?: string;
    category?: "read" | "write" | "egress" | "memory";
    riskLevel?: "low" | "medium" | "high" | "critical";
    sideEffect?: boolean;
    externalEgress?: boolean;
    targetSources?: string[];
  }>;
  dataSources: Array<{
    sourceTable: string;
    owner?: string;
    sourceTrust?: "external" | "internal" | "system" | "generated";
    dataClass?: "public" | "customer_confidential" | "internal" | "restricted" | "pii";
    authorityScope?: "support" | "sales" | "security" | "legal" | "finance" | "admin" | "customer";
    egressPolicy?: "external_ok" | "internal_only" | "restricted";
  }>;
  safeAlternatives: Record<string, string>;
};
```

### Response

```ts
{
  proposal: {
    agentProfileId: string;
    policyVersion: string;
    rules: HardGateRule[]; // status proposed
    semanticRoutingMap: Record<string, EvidencePackCategory[]>;
    reviewPacket: {
      summary: string;
      criticalRules: number;
      toolCoverage: Array<{
        tool: string;
        category: "read" | "write" | "egress" | "memory";
        risk: string;
        defaultRouting: EvidencePackCategory[];
      }>;
    };
  };
  ids: string[]; // stored rule IDs when persist=true
}
```

### UI Mapping

Hard-gate draft page:

- Show `reviewPacket.summary` as the top-level explanation.
- Show `reviewPacket.criticalRules` as risk count.
- Show `reviewPacket.toolCoverage[]` as tool-to-risk coverage table.
- Show `semanticRoutingMap` as the default semantic-review routing map.
- Show `rules[]` in a review table with approve/reject actions.

Important behavior:

- Persisted rules still start as `proposed`.
- The user must approve rules before they are active in `/api/scope/decision`.

### Fetch Example

```ts
const draft = await fetch("/api/scope/hard-gates", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ persist: true })
}).then((res) => res.json());
```

## `PATCH /api/scope/hard-gates/:ruleId`

### Purpose

Approve, reject, or reset a hard-gate rule status.

### Implementation

Route file: `src/app/api/scope/hard-gates/[ruleId]/route.ts`

Internal function:

```ts
updateHardGateRuleStatus(ruleId, status)
```

DB side effects:

- Updates `scope_trace.hard_gate_rules.status`.

### Request

```ts
{
  status: "proposed" | "approved" | "rejected";
}
```

### Response

```ts
{
  ruleId: string;
  status: "proposed" | "approved" | "rejected";
}
```

### UI Mapping

- Approve button sends `{ status: "approved" }`.
- Reject button sends `{ status: "rejected" }`.
- After success, update row state optimistically or refetch `GET /api/scope/hard-gates`.

## `GET /api/scope/evidence-packs`

### Purpose

List stored EvidencePacks. Use this for the EvidencePack review page and for explaining which approved precedents affect semantic ScopeTrace decisions.

### Implementation

Route file: `src/app/api/scope/evidence-packs/route.ts`

Internal function:

```ts
getEvidencePacks({ agentProfileId, category, status, limit })
```

DB side effects:

- None

### Query

```ts
{
  agentProfileId?: string;
  category?: EvidencePackCategory;
  status?: "candidate" | "approved" | "rejected";
  limit?: number; // default 50
}
```

### Response

```ts
{
  evidencePacks: EvidencePack[];
}
```

Important `EvidencePack` fields:

```ts
type EvidencePack = {
  id?: string;
  agent_profile_id: string;
  policy_version: string;
  run_id: string;
  case_id: string;
  plan_id: string | null;
  strategy_id: string | null;
  mode: "observe" | "enforce" | "baseline" | "patched";
  category: EvidencePackCategory;
  outcome: EvidencePackOutcome;
  decision_subject: Record<string, unknown>;
  source_context: Record<string, unknown>;
  trace_evidence: Record<string, unknown>;
  evaluator_summary: string;
  rejection_reason: string | null;
  safe_alternative: Record<string, unknown> | null;
  confidence: number;
  precedent_status: "candidate" | "approved" | "rejected";
  recommended_hard_gate: Record<string, unknown> | null;
  created_at?: string;
};
```

### UI Mapping

- Filter by `category` and `precedent_status`.
- Show `confidence`, `outcome`, and `evaluator_summary` prominently.
- Expand rows for `decision_subject`, `source_context`, `trace_evidence`, `recommended_hard_gate`.
- Treat only `approved` as active runtime precedent.

## `POST /api/scope/evidence-packs/evaluate`

### Purpose

Convert an attack strategy result into candidate EvidencePacks. This is the bridge from attacker execution to ScopeTrace update review.

### Implementation

Route file: `src/app/api/scope/evidence-packs/evaluate/route.ts`

Internal functions:

```ts
getCaseDetails(result.caseId)
buildEvidencePacksFromAttackResult({ plan, result, caseType, referencedSourceRecords })
recordEvidencePacks(evidencePacks)
```

DB side effects:

- If `persist: true`, inserts candidate EvidencePacks.
- If `persist: false`, returns a preview only.

### Request

```ts
{
  plan: AttackStrategyPlan;
  result: AttackStrategyConversationResult;
  caseType?: "red_team" | "benign" | "positive_control";
  referencedSourceRecords?: Array<{
    source_table: string;
    source_id: string;
    source_trust?: "external" | "internal" | "system" | "generated";
    data_class?: "public" | "customer_confidential" | "internal" | "restricted" | "pii";
    authority_scope?: "support" | "sales" | "security" | "legal" | "finance" | "admin" | "customer";
    egress_policy?: "external_ok" | "internal_only" | "restricted";
  }>;
  persist?: boolean; // default true
}
```

### Response

```ts
{
  evidencePacks: EvidencePack[];
  ids: string[]; // stored pack IDs when persist=true
}
```

### UI Mapping

After `/api/redteam/attackers/run`:

- Let the user choose one completed `campaign.results[]` item.
- Submit its `plan` and `result` to this endpoint.
- Render generated candidate packs before/after persisting.
- Let the user approve/reject each pack via `PATCH /api/scope/evidence-packs/:packId`.

Important behavior:

- Current evaluator is deterministic evidence-pack construction.
- LLM-as-judge final reporting is not part of this endpoint yet.
- Candidate packs are not active until approved.

## `PATCH /api/scope/evidence-packs/:packId`

### Purpose

Approve or reject an EvidencePack precedent.

### Implementation

Route file: `src/app/api/scope/evidence-packs/[packId]/route.ts`

Internal function:

```ts
updateEvidencePackStatus(packId, status)
```

DB side effects:

- Updates `scope_trace.evidence_packs.precedent_status`.

### Request

```ts
{
  status: "candidate" | "approved" | "rejected";
}
```

### Response

```ts
{
  packId: string;
  status: "candidate" | "approved" | "rejected";
}
```

### UI Mapping

- Approve button sends `{ status: "approved" }`.
- Reject button sends `{ status: "rejected" }`.
- After success, update local row state or refetch `GET /api/scope/evidence-packs`.

## `POST /api/scope/decision`

### Purpose

Run ScopeTrace decision logic for a proposed tool call without executing the tool. Use this as a policy/debug inspector and later as a guardrail explanation surface.

### Implementation

Route file: `src/app/api/scope/decision/route.ts`

Internal functions:

```ts
getCaseDetails(caseId)
getToolRegistry()
evaluateRuntimeScopePolicy({ mode, toolName, args, manifest, toolMeta, primarySource, targetSources, previousToolNames, forceLlm })
```

Decision flow:

```text
approved hard gate
-> category router
-> approved EvidencePack precedent injection
-> deterministic or LLM semantic allow/block decision
```

DB side effects:

- None

### Request

```ts
{
  caseId: string;
  mode?: "observe" | "enforce"; // default enforce
  toolName: string;
  args?: Record<string, unknown>;
  primarySource?: {
    source_table: string;
    source_id: string;
    source_trust?: "external" | "internal" | "system" | "generated";
    data_class?: "public" | "customer_confidential" | "internal" | "restricted" | "pii";
    authority_scope?: "support" | "sales" | "security" | "legal" | "finance" | "admin" | "customer";
    egress_policy?: "external_ok" | "internal_only" | "restricted";
    text?: string;
  };
  targetSources?: Array<{
    source_table: string;
    source_id: string;
    source_trust?: "external" | "internal" | "system" | "generated";
    data_class?: "public" | "customer_confidential" | "internal" | "restricted" | "pii";
    authority_scope?: "support" | "sales" | "security" | "legal" | "finance" | "admin" | "customer";
    egress_policy?: "external_ok" | "internal_only" | "restricted";
    text?: string;
  }>;
  previousToolNames?: string[];
  forceLlm?: boolean; // default false
}
```

### Response

```ts
{
  result: {
    allowed: boolean;
    decision: "allowed" | "blocked" | "warned" | "observed";
    reason: string;
    findingCodes: string[];
    hardGateDecision?: "allow" | "block" | "needs_semantic";
  };
}
```

### UI Mapping

Scope decision inspector:

- Input panel: case, mode, tool, args, source labels, previous tool path.
- Result panel: allow/block badge, reason, finding code chips, hard-gate vs semantic path.
- If `forceLlm: true`, show slower pending state because it may call the model.

### Error Behavior

- `404`: unknown `caseId`.
- `400`: invalid request or decision failure.
