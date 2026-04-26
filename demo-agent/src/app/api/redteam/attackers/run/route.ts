import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthStatus } from "@/lib/openai/client";
import { AttackPlannerOutputSchema, AttackStrategyIdSchema, AttackStrategyPlanSchema } from "@/lib/redteam/attack-planner/schema";
import {
  buildCampaignItemsFromPlannerOutput,
  runAttackCampaignParallel
} from "@/lib/redteam/attackers/orchestrator";
import { SMOKE_TARGET_AGENT_PROFILE } from "@/lib/redteam/attackers/fixtures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const attackerRunSchema = z.object({
  plannerOutput: AttackPlannerOutputSchema.optional(),
  items: z.array(z.object({
    caseId: z.string().min(1).optional(),
    plan: AttackStrategyPlanSchema
  })).optional(),
  strategyIds: z.array(AttackStrategyIdSchema).optional(),
  mode: z.enum(["observe", "enforce"]).default("observe"),
  minTurns: z.number().int().min(1).max(10).optional(),
  turns: z.number().int().min(1).max(10).optional(),
  model: z.string().min(1).optional()
}).refine((body) => Boolean(body.plannerOutput || body.items?.length), {
  message: "plannerOutput or items is required."
});

export async function POST(request: Request) {
  try {
    const body = attackerRunSchema.parse(await request.json());
    const auth = await getAuthStatus();
    if (!auth.loggedIn) {
      return NextResponse.json({ error: `OpenAI auth is not ready: ${auth.raw}`, auth }, { status: 503 });
    }

    const rawItems = body.plannerOutput
      ? buildCampaignItemsFromPlannerOutput(body.plannerOutput)
      : (body.items ?? []).map((item) => ({ caseId: item.caseId ?? item.plan.targetCaseId, plan: item.plan }));
    const allowedStrategies = body.strategyIds?.length ? new Set(body.strategyIds) : null;
    const items = allowedStrategies
      ? rawItems.filter((item) => allowedStrategies.has(item.plan.strategyId))
      : rawItems;

    if (!items.length) {
      return NextResponse.json({ error: "No attacker campaign items selected." }, { status: 400 });
    }

    const startedAt = new Date().toISOString();
    const campaign = await runAttackCampaignParallel({
      targetAgentSummary: body.plannerOutput?.targetAgentSummary ?? SMOKE_TARGET_AGENT_PROFILE,
      items,
      mode: body.mode,
      minTurns: body.minTurns,
      maxTurns: body.turns,
      model: body.model ?? auth.model
    });
    const completedAt = new Date().toISOString();

    return NextResponse.json({
      startedAt,
      completedAt,
      model: body.model ?? auth.model,
      authProvider: auth.provider,
      mode: body.mode,
      parallel: true,
      campaign
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
