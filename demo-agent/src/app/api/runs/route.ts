import { NextResponse } from "next/server";
import { z } from "zod";
import { createRun } from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createRunSchema = z.object({
  mode: z.enum(["observe", "enforce"]),
  caseIds: z.array(z.string()).optional()
});

export async function POST(request: Request) {
  try {
    const body = createRunSchema.parse(await request.json());
    const runId = await createRun(body.mode);
    return NextResponse.json({ runId, mode: body.mode, caseIds: body.caseIds ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
