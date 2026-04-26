import { NextResponse } from "next/server";
import { getCaseDetails } from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await context.params;
  const details = await getCaseDetails(caseId);
  if (!details) {
    return NextResponse.json({ error: `Unknown case: ${caseId}` }, { status: 404 });
  }
  return NextResponse.json(details);
}
