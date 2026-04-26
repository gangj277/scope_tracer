import { NextResponse } from "next/server";
import { getEvidencePacks } from "@/lib/repository";
import type { EvidencePackCategory, PrecedentStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return NextResponse.json({
    evidencePacks: await getEvidencePacks({
      agentProfileId: url.searchParams.get("agentProfileId") ?? undefined,
      category: (url.searchParams.get("category") as EvidencePackCategory | null) ?? undefined,
      status: (url.searchParams.get("status") as PrecedentStatus | null) ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? 50)
    })
  });
}
