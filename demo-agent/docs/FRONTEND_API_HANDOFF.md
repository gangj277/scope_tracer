# Frontend API Handoff

## Purpose

This is the frontend handoff for the current `demo-agent` app. Build the UI as an enterprise AX-agent red-team workflow, not as a generic chat app.

Primary user journey:

```text
Check model/auth readiness
-> inspect seeded demo cases
-> run observe/enforce traces or replay
-> generate an attack plan from a red-team goal
-> run specialist attackers in parallel
-> review traces, findings, evidence packs, and ScopeTrace updates
-> approve/reject ScopeTrace precedents and hard gates
```

Detailed endpoint contracts live in [FRONTEND_ENDPOINT_INTEGRATION.md](FRONTEND_ENDPOINT_INTEGRATION.md).
ScopeTrace-specific source doc: [SCOPE_TRACE_API.md](../../SCOPE_TRACE_API.md).

## Current Product State

Implemented UI pages:

| Route | Purpose | Data source |
|---|---|---|
| `/` | Dashboard with auth status, metrics, case table | `getDashboardData()`, `getAuthStatus()` |
| `/cases/[caseId]` | Scenario detail, manifest, seed records, run controls | `getCaseDetails(caseId)` |
| `/runs/[runId]/cases/[caseId]` | Trace timeline, findings, final output, result summary | `getRunCaseView(runId, caseId)` |
| `/replay` | Observe vs enforce replay comparison | `getReplayData()` |

Implemented API surfaces:

| Area | Endpoints | Frontend use |
|---|---|---|
| Auth | `GET /api/auth/status` | Global readiness badge; disable live model actions when unavailable |
| Cases | `GET /api/cases`, `GET /api/cases/:caseId` | Dashboard, case picker, case detail |
| Runs | `POST /api/runs`, `POST /api/runs/:runId/cases/:caseId/execute`, `GET /api/runs/:runId/cases/:caseId` | Observe/enforce execution and trace view |
| Replay | `POST /api/replay` | Before/after proof for selected cases |
| Attack planning | `POST /api/redteam/attack-plan` | Convert user red-team goal into 1-6 structured strategies |
| Attack execution | `POST /api/redteam/attackers/run` | Run 5-10 turn specialist attackers in parallel |
| ScopeTrace hard gates | `GET /api/scope/hard-gates`, `POST /api/scope/hard-gates`, `PATCH /api/scope/hard-gates/:ruleId` | Draft, list, approve/reject hard gate rules |
| Evidence packs | `GET /api/scope/evidence-packs`, `POST /api/scope/evidence-packs/evaluate`, `PATCH /api/scope/evidence-packs/:packId` | Convert attack results into reusable precedents; approve/reject them |
| Runtime decision | `POST /api/scope/decision` | Inspect how ScopeTrace would decide a proposed tool call |

Not implemented yet:

- Generic agent registration persistence and pages
- Campaign persistence with `campaignId`
- Streaming/progress API for long attacker campaigns
- Final LLM-as-judge report endpoint/page
- ScopeTrace rule editing UI beyond status approval/rejection

## Frontend Experience To Build

### 1. Readiness And Case Exploration

Use:

- `GET /api/auth/status`
- `GET /api/cases`
- `GET /api/cases/:caseId`

UI should show:

- Model/auth readiness
- Case table with `case_type`, `attack_surface`, `expected_findings`, `latest_status`
- Case detail with `user_task`, intent manifest, seed records, and prior run results

### 2. Baseline Trace And Replay

Use:

- `POST /api/runs`
- `POST /api/runs/:runId/cases/:caseId/execute`
- `GET /api/runs/:runId/cases/:caseId`
- `POST /api/replay`

UI should support:

- Run Observe
- Run Enforce
- Replay Both
- Trace timeline: user task, attacker turn, tool call, policy decision, source labels, final output
- Findings panel and result summary

Important behavior:

- `deterministic` mode is stable for demos.
- `live` mode calls the model server-side and can take longer.
- Secrets, OAuth files, and `DATABASE_URL` must never be rendered.

### 3. Attack Planning

Use:

- `POST /api/redteam/attack-plan`

Request fields:

- `request`: freeform red-team goal
- `preferredFocus`: optional subset of `A1_AUTHORITY_CONFUSION`, `A2_PRIVILEGED_RETRIEVAL`, `A3_SENSITIVE_EGRESS`, `A4_UNAUTHORIZED_ACTION`
- `caseIds`: optional selected demo cases
- `maxPlans`: `1..6`

UI should render:

- `evaluation.pass`, `evaluation.score`, `evaluation.issues`
- One plan card per `output.selectedStrategies[]`
- `targetCaseId`, `strategyId`, `assignedAttacker`, `title`
- `whyThisStrategy`, `northStarOutcome`, `unsafeTransition`, `targetPolicyCodes`
- `turnBlueprint`, `successOracle`, `riskControl.maxTurns`

UX note:

- The plan is not persisted yet. Keep the full `AttackPlannerOutput` in page/server state and pass it to the attacker endpoint.

### 4. Parallel Attacker Run

Use:

- `POST /api/redteam/attackers/run`

Normal request:

```ts
{
  plannerOutput: AttackPlannerOutput;
  mode?: "observe" | "enforce";
  minTurns?: number; // recommended 5
  turns?: number; // recommended 8-10
  strategyIds?: AttackStrategyId[];
  model?: string;
}
```

UI should render one lane per `campaign.results[]`:

- `strategyId`, `assignedAttacker`, `caseId`, `runId`
- `turns.length`, `minTurns`, `maxTurns`, `stoppedReason`
- `quality.targetPayloadsClean`, `quality.completedMinimumTurns`, `quality.pursuedNorthStar`
- Each turn's `attackerTurn.progress`, `payloadPlacement.channel`, `targetPayload`, `targetOutput`, `traceFeedback`, `northStarSignal`

Critical UX rule:

- Show `attackerTurn` metadata as orchestration insight.
- Show `targetPayload` separately as the exact payload sent to the target agent.
- Do not imply the target agent saw `northStarFocus`, `expectedAgentMistake`, or evaluator metadata.

Caveat:

- This endpoint is synchronous and may take minutes for 5-10 turn live campaigns. Add a strong pending state. Streaming/polling can be added later.

### 5. ScopeTrace Hard Gate Draft And Approval

Use:

- `POST /api/scope/hard-gates`
- `GET /api/scope/hard-gates?agentProfileId=...`
- `PATCH /api/scope/hard-gates/:ruleId`

UI should support:

- Draft hard gates from default demo profile or submitted `AgentProfileSpec`
- Show `proposal.reviewPacket.summary`
- Show `proposal.reviewPacket.toolCoverage[]`
- Show `proposal.semanticRoutingMap`
- Rule table with `rule_code`, `category`, `severity`, `action`, `status`, `rationale`, `safe_alternative`, `condition`
- Approve/reject each rule via `PATCH`

Important runtime semantics:

- `POST /api/scope/hard-gates` creates `status = proposed` rules.
- Only `approved` hard gates are eligible during runtime ScopeTrace decisions.
- There is no edit endpoint yet; if editing is needed, frontend should treat it as future scope.

### 6. Evidence Pack Evaluation And Approval

Use:

- `POST /api/scope/evidence-packs/evaluate`
- `GET /api/scope/evidence-packs?agentProfileId=...&category=...&status=...&limit=...`
- `PATCH /api/scope/evidence-packs/:packId`

UI should support:

- Convert one attack strategy result into candidate EvidencePacks
- Show `category`, `outcome`, `confidence`, `precedent_status`
- Show `decision_subject`, `source_context`, `trace_evidence`
- Show `evaluator_summary`, `rejection_reason`, `safe_alternative`, `recommended_hard_gate`
- Approve/reject packs via `PATCH`

Important runtime semantics:

- Approved EvidencePacks become reusable precedents for semantic ScopeTrace decisions.
- Candidate/rejected EvidencePacks should be visible in review UI but should not be presented as active policy.
- Current evaluator is deterministic evidence-pack construction. Full LLM-as-judge report remains future work.

### 7. Runtime Scope Decision Inspector

Use:

- `POST /api/scope/decision`

UI should support a developer/debug panel for proposed tool calls:

- `caseId`, `mode`, `toolName`, `args`
- optional `primarySource`, `targetSources`, `previousToolNames`
- optional `forceLlm`

Render returned `result`:

- `allowed`
- `decision`: `allowed | blocked | warned | observed`
- `reason`
- `findingCodes`
- `hardGateDecision`: `allow | block | needs_semantic` when present

Decision flow:

```text
approved hard gate
-> category router
-> approved EvidencePack precedent injection
-> deterministic or LLM semantic decision
```

## Core Types To Model In Frontend

```ts
type AttackStrategyId =
  | "A1_AUTHORITY_CONFUSION"
  | "A2_PRIVILEGED_RETRIEVAL"
  | "A3_SENSITIVE_EGRESS"
  | "A4_UNAUTHORIZED_ACTION";

type DataClass = "public" | "customer_confidential" | "internal" | "restricted" | "pii";
type SourceTrust = "external" | "internal" | "system" | "generated";
type AuthorityScope = "support" | "sales" | "security" | "legal" | "finance" | "admin" | "customer";
type EgressPolicy = "external_ok" | "internal_only" | "restricted";
type PolicyDecision = "allowed" | "blocked" | "warned" | "observed";

type EvidencePackCategory =
  | "authority_confusion"
  | "privileged_retrieval"
  | "sensitive_egress"
  | "unauthorized_action"
  | "memory_poisoning"
  | "source_laundering"
  | "overblocking"
  | "benign_allow"
  | "inconclusive";

type EvidencePackOutcome =
  | "blocked_violation"
  | "detected_violation"
  | "missed_violation"
  | "overblock"
  | "benign_allowed"
  | "inconclusive";
```

## Recommended Frontend Build Order

1. Keep current dashboard/case/run/replay screens stable.
2. Add campaign setup and attack plan review using `/api/redteam/attack-plan`.
3. Add parallel attacker run page using `/api/redteam/attackers/run`.
4. Add ScopeTrace hard-gate review page using `/api/scope/hard-gates`.
5. Add EvidencePack review page using `/api/scope/evidence-packs*`.
6. Add runtime decision inspector using `/api/scope/decision`.
7. Add persisted campaigns, progress polling, final report, and generic agent registration later.

Reason: planner/attacker/ScopeTrace APIs now exist, while campaign persistence and report generation are still the missing product layer.

## Security And Product Constraints

- Browser never receives OAuth tokens, API keys, `DATABASE_URL`, or local auth files.
- Target agent receives only raw attacker payload, not attacker metadata.
- Demo side effects are dry-run only where applicable.
- `live` model paths are long-running; UI must handle pending and failure states.
- Strategy success should not rely only on `case_results.attack_success`; use attacker `northStarSignal`, findings, and EvidencePacks.
- Approved hard gates and approved EvidencePacks are active ScopeTrace inputs; proposed/candidate items are review artifacts.
