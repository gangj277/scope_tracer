import { NextResponse } from "next/server";
import { z } from "zod";
import { runAgentCase } from "@/lib/agent/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const executeSchema = z.object({
  mode: z.enum(["observe", "enforce"]),
  modelMode: z.enum(["deterministic", "live"]).default("deterministic"),
  model: z.string().optional()
});

export async function POST(request: Request, context: { params: Promise<{ runId: string; caseId: string }> }) {
  try {
    const { runId, caseId } = await context.params;
    const body = executeSchema.parse(await request.json());
    const result = await runAgentCase({
      runId,
      caseId,
      mode: body.mode,
      modelMode: body.modelMode,
      model: body.model
    });
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
