import { NextResponse } from "next/server";
import { z } from "zod";
import { AttackStrategyPlanSchema } from "@/lib/redteam/attack-planner/schema";
import { buildEvidencePacksFromAttackResult } from "@/lib/redteam/evaluator/evidence-pack-evaluator";
import { getCaseDetails, recordEvidencePacks } from "@/lib/repository";
import type { AttackStrategyConversationResult } from "@/lib/redteam/attackers/orchestrator";
import type { SourceRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const traceFeedbackSchema = z.object({
  firstAction: z.string().nullable().default(null),
  toolCalls: z.array(z.string()).default([]),
  blockedToolCalls: z.array(z.string()).default([]),
  findings: z.array(z.string()).default([]),
  referencedSources: z.array(z.string()).default([]),
  outputPolicyDecision: z.string().nullable().default(null),
  observedWeakness: z.string().nullable().default(null),
  outputExcerpt: z.string().default("")
});

const conversationResultSchema = z.object({
  runId: z.string(),
  caseId: z.string(),
  mode: z.enum(["observe", "enforce"]),
  planId: z.string(),
  strategyId: z.string(),
  assignedAttacker: z.string(),
  minTurns: z.number().int().min(0).default(0),
  maxTurns: z.number().int().min(1).default(1),
  stoppedReason: z.string().default("api_evaluation"),
  turns: z.array(z.object({
    targetPayload: z.string().default(""),
    traceFeedback: traceFeedbackSchema,
    northStarSignal: z.object({
      strength: z.enum(["none", "weak", "partial", "strong"]).default("none"),
      matchedPolicyCodes: z.array(z.string()).default([]),
      matchedTools: z.array(z.string()).default([]),
      matchedSources: z.array(z.string()).default([]),
      reason: z.string().default("")
    }).default({})
  })).default([]),
  finalResult: z.object({
    run_id: z.string().optional(),
    case_id: z.string().optional(),
    mode: z.string().optional(),
    attack_success: z.boolean().default(false),
    benign_success: z.boolean().default(false),
    blocked_tool_calls: z.number().default(0),
    sensitive_egress_count: z.number().default(0),
    finding_ids: z.array(z.string()).default([]),
    output_id: z.string().nullable().default(null),
    result_summary: z.record(z.string(), z.unknown()).default({}),
    created_at: z.string().optional()
  }),
  quality: z.object({
    targetPayloadsClean: z.boolean().default(true),
    multiTurnAdapted: z.boolean().default(false),
    producedTraceFeedback: z.boolean().default(true),
    completedMinimumTurns: z.boolean().default(true),
    pursuedNorthStar: z.boolean().default(false)
  }).default({})
});

const evaluateSchema = z.object({
  plan: AttackStrategyPlanSchema,
  result: conversationResultSchema,
  caseType: z.enum(["red_team", "benign", "positive_control"]).optional(),
  referencedSourceRecords: z.array(z.object({
    source_table: z.string(),
    source_id: z.string(),
    source_trust: z.enum(["external", "internal", "system", "generated"]).optional(),
    data_class: z.enum(["public", "customer_confidential", "internal", "restricted", "pii"]).optional(),
    authority_scope: z.enum(["support", "sales", "security", "legal", "finance", "admin", "customer"]).optional(),
    egress_policy: z.enum(["external_ok", "internal_only", "restricted"]).optional()
  })).optional(),
  persist: z.boolean().default(true)
});

export async function POST(request: Request) {
  try {
    const body = evaluateSchema.parse(await request.json());
    const details = await getCaseDetails(body.result.caseId);
    const referencedSourceRecords = body.referencedSourceRecords ?? details?.seedRecords ?? [];
    const evidencePacks = buildEvidencePacksFromAttackResult({
      plan: body.plan,
      result: body.result as unknown as AttackStrategyConversationResult,
      caseType: body.caseType ?? details?.scenario.case_type,
      referencedSourceRecords: referencedSourceRecords as SourceRecord[]
    });
    const ids = body.persist ? await recordEvidencePacks(evidencePacks) : [];
    return NextResponse.json({ evidencePacks, ids });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
