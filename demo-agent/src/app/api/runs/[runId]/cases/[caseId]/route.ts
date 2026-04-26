import { NextResponse } from "next/server";
import { getRunCaseView } from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ runId: string; caseId: string }> }) {
  const { runId, caseId } = await context.params;
  const view = await getRunCaseView(runId, caseId);
  if (!view) {
    return NextResponse.json({ error: `No run view for ${runId}/${caseId}` }, { status: 404 });
  }
  return NextResponse.json(view);
}
