import { NextResponse } from "next/server";
import { getCases } from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ cases: await getCases() });
}
