import { NextResponse } from "next/server";
import { z } from "zod";
import { updateEvidencePackStatus } from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusSchema = z.object({
  status: z.enum(["candidate", "approved", "rejected"])
});

export async function PATCH(request: Request, context: { params: Promise<{ packId: string }> }) {
  try {
    const { packId } = await context.params;
    const body = statusSchema.parse(await request.json());
    await updateEvidencePackStatus(packId, body.status);
    return NextResponse.json({ packId, status: body.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
