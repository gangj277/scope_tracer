import { writeFile } from "node:fs/promises";
import path from "node:path";
import { getAuthStatus } from "@/lib/openai/client";
import {
  buildDemoAttackPlannerInput,
  evaluateAttackPlannerOutput,
  runAttackPlanner
} from "@/lib/redteam/attack-planner/planner";
import type { AttackStrategyId } from "@/lib/redteam/attack-planner/schema";

function readArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function readFocus(): AttackStrategyId[] {
  const raw = readArg("focus");
  if (!raw) return [];
  return raw.split(",").map((item) => item.trim()).filter(Boolean) as AttackStrategyId[];
}

async function main() {
  const request = readArg("request");
  const model = readArg("model");
  const maxPlans = Number(readArg("maxPlans") ?? 6);
  const focus = readFocus();
  const outPath = readArg("out") ?? "docs/attack-planner-eval-run.md";

  const auth = await getAuthStatus();
  if (!auth.loggedIn) {
    throw new Error(`OpenAI auth is not ready: ${auth.raw}`);
  }

  const input = await buildDemoAttackPlannerInput({ request, preferredFocus: focus, maxPlans });
  const output = await runAttackPlanner(input, model);
  const evaluation = evaluateAttackPlannerOutput(output);

  const report = renderReport({ model: model ?? auth.model, request: input.redTeamRequest.request, output, evaluation });
  await writeFile(path.resolve(process.cwd(), outPath), report, "utf8");

  console.log(JSON.stringify({
    model: model ?? auth.model,
    authProvider: auth.provider,
    pass: evaluation.pass,
    score: `${evaluation.score}/${evaluation.maxScore}`,
    strategyCount: evaluation.strategyCount,
    strategyDiversity: evaluation.strategyDiversity,
    issues: evaluation.issues,
    outputPath: outPath,
    plans: evaluation.planSummaries
  }, null, 2));
}

function renderReport(input: {
  model: string;
  request: string;
  output: Awaited<ReturnType<typeof runAttackPlanner>>;
  evaluation: ReturnType<typeof evaluateAttackPlannerOutput>;
}) {
  const lines = [
    "# Attack Planner Evaluation Run",
    "",
    `- Model: \`${input.model}\``,
    `- Planner run: \`${input.output.plannerRunId}\``,
    `- Score: \`${input.evaluation.score}/${input.evaluation.maxScore}\``,
    `- Pass: \`${input.evaluation.pass}\``,
    `- Strategy count: \`${input.evaluation.strategyCount}\``,
    `- Strategy diversity: \`${input.evaluation.strategyDiversity}\``,
    "",
    "## Request",
    "",
    input.request,
    "",
    "## Coverage Rationale",
    "",
    input.output.strategyCoverageRationale,
    "",
    "## Plans",
    ""
  ];

  for (const plan of input.output.selectedStrategies) {
    lines.push(
      `### ${plan.planId}: ${plan.title}`,
      "",
      `- Strategy: \`${plan.strategyId}\``,
      `- Attacker: \`${plan.assignedAttacker}\``,
      `- Priority: \`${plan.priority}\``,
      `- Difficulty: \`${plan.expectedDifficulty}\``,
      `- Evidence value: \`${plan.expectedEvidenceValue}\``,
      `- Unsafe transition: \`${plan.unsafeTransition}\``,
      "",
      `Why: ${plan.whyThisStrategy}`,
      "",
      `North Star: ${plan.northStarOutcome}`,
      "",
      "Turn blueprint:",
      ...plan.turnBlueprint.map((turn) => `${turn.turn}. ${turn.objective} -> ${turn.promptIntent}`),
      "",
      `Deterministic signals: ${plan.successOracle.deterministicSignals.join(", ")}`,
      `LLM judge signals: ${plan.successOracle.llmJudgeSignals.join(", ")}`,
      ""
    );
  }

  lines.push(
    "## Evaluation",
    "",
    input.evaluation.issues.length ? input.evaluation.issues.map((issue) => `- ${issue}`).join("\n") : "No issues detected.",
    "",
    "## Raw Structured Output",
    "",
    "```json",
    JSON.stringify(input.output, null, 2),
    "```",
    ""
  );

  return lines.join("\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
