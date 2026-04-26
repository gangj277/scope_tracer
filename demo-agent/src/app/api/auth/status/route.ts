import { NextResponse } from "next/server";
import { getAuthStatus } from "@/lib/openai/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getAuthStatus());
}
