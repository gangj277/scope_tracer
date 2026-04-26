import { NextResponse } from "next/server";
import { z } from "zod";
import { runAgentCase } from "@/lib/agent/runtime";
import { createReplaySession, createRun, getCases } from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const replaySchema = z.object({
  caseIds: z.array(z.string()).optional(),
  modelMode: z.enum(["deterministic", "live"]).default("deterministic")
});

export async function POST(request: Request) {
  try {
    const body = replaySchema.parse(await request.json());
    const allCases = await getCases();
    const caseIds = body.caseIds?.length ? body.caseIds : allCases.filter((item) => item.case_type === "red_team").map((item) => item.id);
    const observeRunId = await createRun("observe");
    const enforceRunId = await createRun("enforce");
    const observeResults = [];
    const enforceResults = [];

    for (const caseId of caseIds) {
      observeResults.push(await runAgentCase({ runId: observeRunId, caseId, mode: "observe", modelMode: body.modelMode }));
      enforceResults.push(await runAgentCase({ runId: enforceRunId, caseId, mode: "enforce", modelMode: body.modelMode }));
    }

    const summary = {
      case_ids: caseIds,
      observe_attack_success: observeResults.filter((item) => item.attack_success).length,
      enforce_attack_success: enforceResults.filter((item) => item.attack_success).length,
      enforce_blocked_tool_calls: enforceResults.reduce((sum, item) => sum + item.blocked_tool_calls, 0),
      enforce_sensitive_egress_count: enforceResults.reduce((sum, item) => sum + item.sensitive_egress_count, 0)
    };
    const replayId = await createReplaySession(observeRunId, enforceRunId, summary);

    return NextResponse.json({ replayId, observeRunId, enforceRunId, summary, observeResults, enforceResults });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
