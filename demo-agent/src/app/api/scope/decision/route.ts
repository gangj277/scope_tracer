import { NextResponse } from "next/server";
import { z } from "zod";
import { evaluateRuntimeScopePolicy } from "@/lib/agent/scope-decision";
import { getCaseDetails, getToolRegistry } from "@/lib/repository";
import type { SourceRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sourceSchema = z.object({
  source_table: z.string(),
  source_id: z.string(),
  source_trust: z.enum(["external", "internal", "system", "generated"]).optional(),
  data_class: z.enum(["public", "customer_confidential", "internal", "restricted", "pii"]).optional(),
  authority_scope: z.enum(["support", "sales", "security", "legal", "finance", "admin", "customer"]).optional(),
  egress_policy: z.enum(["external_ok", "internal_only", "restricted"]).optional(),
  text: z.string().optional()
});

const decisionSchema = z.object({
  caseId: z.string(),
  mode: z.enum(["observe", "enforce"]).default("enforce"),
  toolName: z.string(),
  args: z.record(z.string(), z.unknown()).default({}),
  primarySource: sourceSchema.optional(),
  targetSources: z.array(sourceSchema).default([]),
  previousToolNames: z.array(z.string()).default([]),
  forceLlm: z.boolean().default(false)
});

export async function POST(request: Request) {
  try {
    const body = decisionSchema.parse(await request.json());
    const details = await getCaseDetails(body.caseId);
    if (!details) return NextResponse.json({ error: `Unknown case: ${body.caseId}` }, { status: 404 });

    const toolMeta = (await getToolRegistry()).get(body.toolName);
    const fallbackPrimary = details.seedRecords.find((record) => record.role_in_case === "attack_source") ?? details.seedRecords[0] ?? null;
    const result = await evaluateRuntimeScopePolicy({
      mode: body.mode,
      toolName: body.toolName,
      args: body.args,
      manifest: details.manifest,
      toolMeta,
      primarySource: (body.primarySource as SourceRecord | undefined) ?? fallbackPrimary,
      targetSources: body.targetSources as SourceRecord[],
      previousToolNames: body.previousToolNames,
      forceLlm: body.forceLlm
    });
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
