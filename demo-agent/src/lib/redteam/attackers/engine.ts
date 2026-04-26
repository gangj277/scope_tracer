import "server-only";

import { zodTextFormat } from "openai/helpers/zod";
import { DEFAULT_MODEL, runOpenAIStructuredResponse } from "@/lib/openai/client";
import type { AttackStrategyPlan, TargetAgentProfile } from "@/lib/redteam/attack-planner/schema";
import { AttackStrategyPlanSchema } from "@/lib/redteam/attack-planner/schema";
import { AttackerTurnOutputSchema, TraceFeedbackSchema, type AttackerTurnOutput, type TraceFeedback } from "@/lib/redteam/attackers/schema";
import { ATTACKER_COMMON_SYSTEM_PROMPT, buildAttackerUserPrompt } from "@/lib/redteam/attackers/prompts/common";
import { STRATEGY_GUIDES } from "@/lib/redteam/attackers/prompts/strategy-guides";
const ASSIGNED_ATTACKER_BY_STRATEGY: Record<AttackStrategyPlan["strategyId"], AttackStrategyPlan["assignedAttacker"]> = {
  A1_AUTHORITY_CONFUSION: "AuthorityConfusionAttacker",
  A2_PRIVILEGED_RETRIEVAL: "PrivilegedRetrievalAttacker",
  A3_SENSITIVE_EGRESS: "SensitiveEgressAttacker",
  A4_UNAUTHORIZED_ACTION: "UnauthorizedActionAttacker"
};

export async function runSpecialistAttackerTurn(input: {
  targetAgentSummary: TargetAgentProfile;
  plan: AttackStrategyPlan;
  turn: number;
  maxTurns: number;
  minTurns: number;
  noveltyWindow?: number;
  previousTurns: AttackerTurnOutput[];
  traceFeedback: TraceFeedback | null;
  model?: string;
}): Promise<AttackerTurnOutput> {
  const plan = AttackStrategyPlanSchema.parse(input.plan);
  const traceFeedback = input.traceFeedback ? TraceFeedbackSchema.parse(input.traceFeedback) : null;
  const expectedAttacker = ASSIGNED_ATTACKER_BY_STRATEGY[plan.strategyId];

  const output = await runOpenAIStructuredResponse<AttackerTurnOutput>({
    model: input.model ?? DEFAULT_MODEL,
    instructions: ATTACKER_COMMON_SYSTEM_PROMPT,
    input: buildAttackerUserPrompt({
      strategyGuide: STRATEGY_GUIDES[plan.strategyId],
      targetAgentSummary: input.targetAgentSummary,
      plan,
      turn: input.turn,
      maxTurns: input.maxTurns,
      minTurns: input.minTurns,
      noveltyWindow: input.noveltyWindow ?? 3,
      previousTurns: input.previousTurns,
      traceFeedback
    }),
    textFormat: zodTextFormat(AttackerTurnOutputSchema, "attacker_turn_output"),
    reasoningEffort: "medium"
  });

  if (output.strategyId !== plan.strategyId) {
    throw new Error(`Attacker returned ${output.strategyId} for ${plan.strategyId}.`);
  }
  if (output.assignedAttacker !== expectedAttacker) {
    throw new Error(`Attacker returned ${output.assignedAttacker}; expected ${expectedAttacker}.`);
  }
  if (output.planId !== plan.planId) {
    throw new Error(`Attacker returned planId ${output.planId}; expected ${plan.planId}.`);
  }
  if (output.turn !== input.turn) {
    throw new Error(`Attacker returned turn ${output.turn}; expected ${input.turn}.`);
  }

  return output;
}
