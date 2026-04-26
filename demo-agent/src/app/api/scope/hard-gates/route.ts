import { NextResponse } from "next/server";
import { z } from "zod";
import { getHardGateRules, getToolRegistry, recordHardGateRules } from "@/lib/repository";
import { buildDemoAgentProfileSpec, buildHardGateProposalSet } from "@/lib/scope/hard-gate-architect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toolCategorySchema = z.enum(["read", "write", "egress", "memory"]);
const riskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
const sourceTrustSchema = z.enum(["external", "internal", "system", "generated"]);
const dataClassSchema = z.enum(["public", "customer_confidential", "internal", "restricted", "pii"]);
const authorityScopeSchema = z.enum(["support", "sales", "security", "legal", "finance", "admin", "customer"]);
const egressPolicySchema = z.enum(["external_ok", "internal_only", "restricted"]);

const agentProfileSpecSchema = z.object({
  agentProfileId: z.string(),
  agentName: z.string(),
  agentRole: z.string(),
  workflows: z.array(z.string()).default([]),
  actorRoles: z.array(z.string()).default([]),
  recipients: z.array(z.enum(["external_customer", "internal_user", "system"])).default([]),
  tools: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    category: toolCategorySchema.optional(),
    riskLevel: riskLevelSchema.optional(),
    sideEffect: z.boolean().optional(),
    externalEgress: z.boolean().optional(),
    targetSources: z.array(z.string()).optional()
  })),
  dataSources: z.array(z.object({
    sourceTable: z.string(),
    owner: z.string().optional(),
    sourceTrust: sourceTrustSchema.optional(),
    dataClass: dataClassSchema.optional(),
    authorityScope: authorityScopeSchema.optional(),
    egressPolicy: egressPolicySchema.optional()
  })).default([]),
  safeAlternatives: z.record(z.string(), z.string()).default({})
});

const proposeSchema = z.object({
  agentProfileId: z.string().default("agent_profile_support_vulnerable"),
  policyVersion: z.string().default("v1"),
  persist: z.boolean().default(true),
  spec: agentProfileSpecSchema.optional()
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const agentProfileId = url.searchParams.get("agentProfileId") ?? "agent_profile_support_vulnerable";
  return NextResponse.json({ rules: await getHardGateRules(agentProfileId) });
}

export async function POST(request: Request) {
  try {
    const body = proposeSchema.parse(await request.json());
    const toolRegistry = await getToolRegistry();
    const spec = body.spec ?? buildDemoAgentProfileSpec(toolRegistry);
    spec.agentProfileId = body.agentProfileId ?? spec.agentProfileId;
    const proposal = buildHardGateProposalSet({ spec, toolRegistry, policyVersion: body.policyVersion });
    const ids = body.persist ? await recordHardGateRules(proposal.rules) : [];
    return NextResponse.json({ proposal, ids });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
