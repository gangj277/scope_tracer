import { runAgentCase } from "@/lib/agent/runtime";
import { createReplaySession, createRun, getCases } from "@/lib/repository";
import type { ModelMode, RunMode } from "@/lib/types";

const modeArg = process.argv[2] ?? "replay";
const modelMode = (process.argv[3] ?? "deterministic") as ModelMode;

async function main() {
  const cases = await getCases();
  const selected = process.argv.includes("--all") ? cases : cases.filter((item) => item.case_type === "red_team");

  if (modeArg === "replay") {
    const observeRunId = await createRun("observe");
    const enforceRunId = await createRun("enforce");
    const observeResults = [];
    const enforceResults = [];

    for (const item of selected) {
      observeResults.push(await runAgentCase({ runId: observeRunId, caseId: item.id, mode: "observe", modelMode }));
      enforceResults.push(await runAgentCase({ runId: enforceRunId, caseId: item.id, mode: "enforce", modelMode }));
    }

    const summary = {
      cases: selected.length,
      observe_attack_success: observeResults.filter((item) => item.attack_success).length,
      enforce_attack_success: enforceResults.filter((item) => item.attack_success).length,
      enforce_blocked_tool_calls: enforceResults.reduce((sum, item) => sum + item.blocked_tool_calls, 0),
      enforce_sensitive_egress_count: enforceResults.reduce((sum, item) => sum + item.sensitive_egress_count, 0)
    };
    const replayId = await createReplaySession(observeRunId, enforceRunId, summary);
    console.log(JSON.stringify({ replayId, observeRunId, enforceRunId, summary }, null, 2));
  } else {
    const mode = modeArg as RunMode;
    if (!["observe", "enforce"].includes(mode)) {
      throw new Error("Usage: npm run run:suite -- <replay|observe|enforce> [deterministic|live] [--all]");
    }
    const runId = await createRun(mode);
    const results = [];
    for (const item of selected) {
      results.push(await runAgentCase({ runId, caseId: item.id, mode, modelMode }));
    }
    console.log(JSON.stringify({ runId, mode, modelMode, results }, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
