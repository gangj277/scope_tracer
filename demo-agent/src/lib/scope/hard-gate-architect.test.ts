import { describe, expect, it } from "vitest";
import { buildDemoAgentProfileSpec, buildHardGateProposalSet, classifyToolCategory } from "@/lib/scope/hard-gate-architect";
import type { ToolRegistryRow } from "@/lib/types";

const registry = new Map<string, ToolRegistryRow>([
  ["search_contracts", { name: "search_contracts", risk_level: "high", allowed_roles: [], required_scope: "legal", side_effect: false, external_egress: false, default_policy: "approval_required" }],
  ["send_email", { name: "send_email", risk_level: "critical", allowed_roles: [], required_scope: "support", side_effect: true, external_egress: true, default_policy: "approval_required" }],
  ["write_agent_memory", { name: "write_agent_memory", risk_level: "critical", allowed_roles: [], required_scope: "admin", side_effect: true, external_egress: false, default_policy: "block" }],
  ["search_public_kb", { name: "search_public_kb", risk_level: "low", allowed_roles: [], required_scope: "support", side_effect: false, external_egress: false, default_policy: "allow" }]
]);

describe("Hard Gate Architect Agent", () => {
  it("classifies tool categories from registry metadata", () => {
    expect(classifyToolCategory("search_contracts", registry.get("search_contracts"))).toBe("read");
    expect(classifyToolCategory("send_email", registry.get("send_email"))).toBe("egress");
    expect(classifyToolCategory("write_agent_memory", registry.get("write_agent_memory"))).toBe("memory");
  });

  it("generates inactive hard gate proposals with coverage for critical tool families", () => {
    const spec = buildDemoAgentProfileSpec(registry);
    const proposal = buildHardGateProposalSet({ spec, toolRegistry: registry });
    const codes = new Set(proposal.rules.map((rule) => rule.rule_code));
    expect(codes).toContain("HG_UNTRUSTED_PRIVILEGED_RETRIEVAL");
    expect(codes).toContain("HG_SENSITIVE_EXTERNAL_EGRESS");
    expect(codes).toContain("HG_EXTERNAL_SIDE_EFFECT");
    expect(codes).toContain("HG_MEMORY_WRITE_FROM_EXTERNAL");
    expect(proposal.rules.every((rule) => rule.status === "proposed")).toBe(true);
    expect(proposal.reviewPacket.toolCoverage).toHaveLength(registry.size);
  });
});
