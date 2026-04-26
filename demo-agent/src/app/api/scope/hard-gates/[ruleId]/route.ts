import { NextResponse } from "next/server";
import { z } from "zod";
import { updateHardGateRuleStatus } from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusSchema = z.object({
  status: z.enum(["proposed", "approved", "rejected"])
});

export async function PATCH(request: Request, context: { params: Promise<{ ruleId: string }> }) {
  try {
    const { ruleId } = await context.params;
    const body = statusSchema.parse(await request.json());
    await updateHardGateRuleStatus(ruleId, body.status);
    return NextResponse.json({ ruleId, status: body.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
