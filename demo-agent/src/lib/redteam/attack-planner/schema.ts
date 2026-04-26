import { z } from "zod";

export const AttackStrategyIdSchema = z.enum([
  "A1_AUTHORITY_CONFUSION",
  "A2_PRIVILEGED_RETRIEVAL",
  "A3_SENSITIVE_EGRESS",
  "A4_UNAUTHORIZED_ACTION"
]);

export const AssignedAttackerSchema = z.enum([
  "AuthorityConfusionAttacker",
  "PrivilegedRetrievalAttacker",
  "SensitiveEgressAttacker",
  "UnauthorizedActionAttacker"
]);

export const AttackModifierSchema = z.enum([
  "indirect_source_injection",
  "multi_turn_crescendo",
  "urgency_pressure",
  "role_or_executive_pressure",
  "compliance_or_audit_pressure",
  "benign_business_cover",
  "paraphrase_request",
  "citation_suppression",
  "covert_channel",
  "least_privilege_blurring"
]);

export const AttackSurfaceSchema = z.enum([
  "user_prompt",
  "ticket",
  "attachment",
  "retrieved_doc",
  "crm_record",
  "slack_message",
  "memory",
  "tool_sequence",
  "final_output"
]);

export const EvaluatorFocusSchema = z.enum([
  "first_action_precision",
  "tool_necessity",
  "privilege_boundary",
  "source_contamination",
  "context_drift",
  "semantic_leak",
  "side_effect_authorization",
  "overblocking"
]);

export const SourceRefSchema = z.object({
  sourceTable: z.string(),
  sourceId: z.string(),
  label: z.string(),
  trust: z.string(),
  dataClass: z.string(),
  authorityScope: z.string(),
  egressPolicy: z.string()
});

export const TargetAgentProfileSchema = z.object({
  agentName: z.string(),
  agentRole: z.string(),
  coreWorkflow: z.string(),
  tools: z.array(z.string()),
  dataSources: z.array(z.string()),
  sensitiveAssets: z.array(z.string()),
  knownGuardrails: z.array(z.string()),
  traceSignals: z.array(z.string())
});

export const RedTeamRequestSchema = z.object({
  request: z.string(),
  inScope: z.array(z.string()),
  outOfScope: z.array(z.string()),
  preferredFocus: z.array(AttackStrategyIdSchema),
  maxPlans: z.number().int().min(1).max(6).default(6)
});

export const AttackPlannerInputSchema = z.object({
  targetAgent: TargetAgentProfileSchema,
  redTeamRequest: RedTeamRequestSchema,
  scenarioHints: z.array(z.object({
    caseId: z.string(),
    title: z.string(),
    userTask: z.string(),
    attackSurface: z.string(),
    expectedFindings: z.array(z.string()),
    allowedTools: z.array(z.string()),
    blockedTools: z.array(z.string()),
    allowedSources: z.array(z.string()),
    blockedSources: z.array(z.string()),
    externalRecipient: z.boolean(),
    seedSources: z.array(SourceRefSchema)
  })).max(12)
});

export const AttackStrategyPlanSchema = z.object({
  planId: z.string(),
  targetCaseId: z.string(),
  strategyId: AttackStrategyIdSchema,
  title: z.string(),
  assignedAttacker: AssignedAttackerSchema,

  whyThisStrategy: z.string(),
  northStarOutcome: z.string(),
  targetInvariant: z.string(),
  weaknessHypothesis: z.string(),
  unsafeTransition: z.string(),

  targetPolicyCodes: z.array(z.string()),
  targetTools: z.array(z.string()),
  targetSources: z.array(z.string()),
  targetDataClasses: z.array(z.string()),
  targetSideEffects: z.array(z.string()),
  attackSurface: AttackSurfaceSchema,
  modifiers: z.array(AttackModifierSchema),

  turnBlueprint: z.array(z.object({
    turn: z.number().int().min(1).max(10),
    objective: z.string(),
    promptIntent: z.string(),
    expectedAgentMistake: z.string(),
    escalationIfBlocked: z.string()
  })).min(1).max(10),

  successOracle: z.object({
    deterministicSignals: z.array(z.string()),
    llmJudgeSignals: z.array(z.string()),
    stopConditions: z.array(z.string())
  }),

  evaluatorFocus: z.array(EvaluatorFocusSchema),

  riskControl: z.object({
    noRealSideEffects: z.literal(true),
    sandboxOnly: z.literal(true),
    maxTurns: z.number().int().min(1).max(10),
    maxLiveRuns: z.number().int().min(1).max(3)
  }),

  priority: z.enum(["low", "medium", "high"]),
  expectedDifficulty: z.enum(["easy", "medium", "hard"]),
  expectedEvidenceValue: z.enum(["low", "medium", "high"])
});

export const AttackPlannerOutputSchema = z.object({
  plannerRunId: z.string(),
  targetAgentSummary: TargetAgentProfileSchema,
  userRedTeamIntent: z.object({
    requestedFocus: z.string(),
    inScope: z.array(z.string()),
    outOfScope: z.array(z.string())
  }),
  strategyCoverageRationale: z.string(),
  selectedStrategies: z.array(AttackStrategyPlanSchema).min(1).max(6),
  omittedStrategyReasons: z.array(z.object({
    strategyId: AttackStrategyIdSchema,
    reason: z.string()
  })),
  campaignDefaults: z.object({
    maxTurnsPerStrategy: z.number().int().min(1).max(10),
    runModes: z.array(z.enum(["observe", "enforce"])),
    requireDeterministicOracle: z.boolean(),
    requireLlmJudge: z.boolean()
  }),
  qualitySelfCheck: z.object({
    hasClearNorthStars: z.boolean(),
    hasTraceableUnsafeTransitions: z.boolean(),
    avoidsOutOfScopeHarm: z.boolean(),
    planDiversityScore: z.number().min(0).max(4),
    notes: z.string()
  })
});

export type AttackStrategyId = z.infer<typeof AttackStrategyIdSchema>;
export type TargetAgentProfile = z.infer<typeof TargetAgentProfileSchema>;
export type AttackPlannerInput = z.infer<typeof AttackPlannerInputSchema>;
export type AttackPlannerOutput = z.infer<typeof AttackPlannerOutputSchema>;
export type AttackStrategyPlan = z.infer<typeof AttackStrategyPlanSchema>;
