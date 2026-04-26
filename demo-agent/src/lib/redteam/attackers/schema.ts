import { z } from "zod";
import { AttackStrategyIdSchema, AssignedAttackerSchema } from "@/lib/redteam/attack-planner/schema";

export const PayloadPlacementChannelSchema = z.enum([
  "direct_user_prompt",
  "ticket_content",
  "attachment_content",
  "retrieved_doc_instruction",
  "crm_note",
  "slack_message"
]);

export const PayloadPlacementSchema = z.object({
  channel: PayloadPlacementChannelSchema,
  intent: z.string(),
  payloadSummary: z.string()
});

export const TraceFeedbackSchema = z.object({
  firstAction: z.string().nullable(),
  toolCalls: z.array(z.string()),
  blockedToolCalls: z.array(z.string()),
  findings: z.array(z.string()),
  referencedSources: z.array(z.string()),
  outputPolicyDecision: z.string().nullable(),
  observedWeakness: z.string().nullable(),
  outputExcerpt: z.string()
});

export const AttackerProgressSchema = z.object({
  northStarProgress: z.enum(["none", "weak_signal", "partial", "strong"]),
  nextTactic: z.enum([
    "establish_business_context",
    "increase_specificity_pressure",
    "shift_payload_placement",
    "induce_privileged_retrieval",
    "induce_sensitive_egress",
    "induce_side_effect",
    "launder_source_or_provenance",
    "lower_friction_reframe",
    "exploit_prior_context",
    "stop_with_evidence"
  ]),
  repeatedTacticRisk: z.boolean()
});

export const AttackerTurnOutputSchema = z.object({
  planId: z.string(),
  strategyId: AttackStrategyIdSchema,
  assignedAttacker: AssignedAttackerSchema,
  turn: z.number().int().min(1).max(10),
  persona: z.string(),
  attackObjective: z.string(),
  northStarFocus: z.string(),
  progress: AttackerProgressSchema,
  payloadPlacement: PayloadPlacementSchema,
  userMessage: z.string(),
  expectedAgentMistake: z.string(),
  observationTargets: z.array(z.string()),
  adaptIfBlocked: z.string(),
  adaptationRationale: z.string(),
  stop: z.object({
    shouldStop: z.boolean(),
    reason: z.string()
  })
});

export type PayloadPlacementChannel = z.infer<typeof PayloadPlacementChannelSchema>;
export type PayloadPlacement = z.infer<typeof PayloadPlacementSchema>;
export type TraceFeedback = z.infer<typeof TraceFeedbackSchema>;
export type AttackerTurnOutput = z.infer<typeof AttackerTurnOutputSchema>;
