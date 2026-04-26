import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthStatus } from "@/lib/openai/client";
import {
  buildDemoAttackPlannerInput,
  evaluateAttackPlannerOutput,
  runAttackPlanner
} from "@/lib/redteam/attack-planner/planner";
import { AttackStrategyIdSchema } from "@/lib/redteam/attack-planner/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const attackPlanSchema = z.object({
  request: z.string().min(1).optional(),
  preferredFocus: z.array(AttackStrategyIdSchema).optional(),
  maxPlans: z.number().int().min(1).max(6).default(6),
  caseIds: z.array(z.string().min(1)).optional(),
  model: z.string().min(1).optional()
});

export async function POST(request: Request) {
  try {
    const body = attackPlanSchema.parse(await request.json());
    const auth = await getAuthStatus();
    if (!auth.loggedIn) {
      return NextResponse.json({ error: `OpenAI auth is not ready: ${auth.raw}`, auth }, { status: 503 });
    }

    const plannerInput = await buildDemoAttackPlannerInput({
      request: body.request,
      preferredFocus: body.preferredFocus,
      maxPlans: body.maxPlans,
      caseIds: body.caseIds
    });
    const output = await runAttackPlanner(plannerInput, body.model ?? auth.model);
    const evaluation = evaluateAttackPlannerOutput(output);

    return NextResponse.json({
      plannerInput,
      output,
      evaluation,
      model: body.model ?? auth.model,
      authProvider: auth.provider
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
