import { afterAll, describe, expect, it } from "vitest";
import { runAgentCase } from "@/lib/agent/runtime";
import { closePool } from "@/lib/db";
import { createRun, getCases, getRunCaseView } from "@/lib/repository";

describe("ScopeTrace deterministic runtime", () => {
  afterAll(async () => {
    await closePool();
  });

  it("records expected findings for all red-team observe cases", async () => {
    const cases = (await getCases()).filter((item) => item.case_type === "red_team");
    expect(cases.length).toBeGreaterThanOrEqual(8);
    const runId = await createRun("observe");

    for (const item of cases) {
      const result = await runAgentCase({ runId, caseId: item.id, mode: "observe", modelMode: "deterministic" });
      const view = await getRunCaseView(runId, item.id);
      const findingCodes = new Set(view?.findings.map((finding) => finding.rule_code) ?? []);
      expect(result.attack_success, item.id).toBe(true);
      expect(view?.trace.length ?? 0, item.id).toBeGreaterThanOrEqual(3);
      expect(item.expected_findings.some((code) => findingCodes.has(code)), item.id).toBe(true);
      expect(view?.outputs.at(-1)?.content ?? "", item.id).not.toHaveLength(0);
    }
  });

  it("blocks unsafe transitions for all red-team enforce cases", async () => {
    const cases = (await getCases()).filter((item) => item.case_type === "red_team");
    const runId = await createRun("enforce");

    for (const item of cases) {
      const result = await runAgentCase({ runId, caseId: item.id, mode: "enforce", modelMode: "deterministic" });
      expect(result.attack_success, item.id).toBe(false);
      if (item.expected_forbidden_tools.length) {
        expect(result.blocked_tool_calls, item.id).toBeGreaterThan(0);
      }
      const view = await getRunCaseView(runId, item.id);
      if (item.expected_forbidden_tools.length) {
        expect(view?.trace.some((event) => event.policy_decision === "blocked"), item.id).toBe(true);
      }
      expect(view?.outputs.at(-1)?.content ?? "", item.id).not.toContain("_INTERNAL");
    }
  });

  it("preserves benign and positive-control behavior in enforce mode", async () => {
    const cases = (await getCases()).filter((item) => item.case_type !== "red_team");
    expect(cases.length).toBeGreaterThanOrEqual(7);
    const runId = await createRun("enforce");

    for (const item of cases) {
      const result = await runAgentCase({ runId, caseId: item.id, mode: "enforce", modelMode: "deterministic" });
      expect(result.attack_success, item.id).toBe(false);
      expect(result.benign_success, item.id).toBe(true);
      const view = await getRunCaseView(runId, item.id);
      expect(view?.findings.length ?? 0, item.id).toBe(0);
      expect(view?.outputs.at(-1)?.content ?? "", item.id).not.toContain("_INTERNAL");
    }
  });

  it("covers at least ten deterministic case executions end to end", async () => {
    const cases = (await getCases()).slice(0, 10);
    const runId = await createRun("enforce");
    const results = [];
    for (const item of cases) {
      results.push(await runAgentCase({ runId, caseId: item.id, mode: "enforce", modelMode: "deterministic" }));
    }
    expect(results).toHaveLength(10);
    expect(results.every((item) => item.output_id)).toBe(true);
  });
});
