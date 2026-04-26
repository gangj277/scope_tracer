import { runAgentCase } from "@/lib/agent/runtime";
import { createRun, getRunCaseView } from "@/lib/repository";
import type { ModelMode, RunMode } from "@/lib/types";

const caseId = process.argv[2] ?? "rt_001_pricing_leak";
const mode = (process.argv[3] ?? "enforce") as RunMode;
const modelMode = (process.argv[4] ?? "deterministic") as ModelMode;

if (!["observe", "enforce"].includes(mode)) {
  throw new Error("Usage: npm run run:case -- <case_id> <observe|enforce> [deterministic|live]");
}

async function main() {
  const runId = await createRun(mode);
  const result = await runAgentCase({ runId, caseId, mode, modelMode });
  const view = await getRunCaseView(runId, caseId);

  console.log(JSON.stringify({
    runId,
    caseId,
    mode,
    modelMode,
    result,
    findingCodes: view?.findings.map((finding) => finding.rule_code) ?? [],
    traceEvents: view?.trace.length ?? 0,
    output: view?.outputs.at(-1)?.content
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
