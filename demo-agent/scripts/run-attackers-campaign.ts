import { writeFile } from "node:fs/promises";
import path from "node:path";
import { getAuthStatus } from "@/lib/openai/client";
import { buildSmokeAttackerPlans, SMOKE_TARGET_AGENT_PROFILE } from "@/lib/redteam/attackers/fixtures";
import { runAttackCampaignParallel, type AttackCampaignParallelResult } from "@/lib/redteam/attackers/orchestrator";
import type { AttackStrategyId } from "@/lib/redteam/attack-planner/schema";
import type { RunMode } from "@/lib/types";

function readArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function readOptionalInt(name: string) {
  const raw = readArg(name);
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`--${name} must be an integer.`);
  return value;
}

async function main() {
  const model = readArg("model");
  const mode = (readArg("mode") ?? "observe") as RunMode;
  const maxTurns = readOptionalInt("turns");
  const minTurns = readOptionalInt("minTurns");
  const strategy = readArg("strategy") as AttackStrategyId | undefined;
  const outPath = readArg("out") ?? "docs/attackers-campaign-run.md";

  const auth = await getAuthStatus();
  if (!auth.loggedIn) throw new Error(`OpenAI auth is not ready: ${auth.raw}`);
  if (!["observe", "enforce"].includes(mode)) throw new Error("--mode must be observe or enforce.");
  if (maxTurns !== undefined && (maxTurns < 1 || maxTurns > 10)) throw new Error("--turns must be 1..10.");
  if (minTurns !== undefined && (minTurns < 1 || minTurns > 10)) throw new Error("--minTurns must be 1..10.");

  const selectedPlans = buildSmokeAttackerPlans().filter((item) => !strategy || item.plan.strategyId === strategy);
  if (!selectedPlans.length) throw new Error(`No campaign plan selected for strategy=${strategy ?? "all"}.`);

  const startedAt = new Date();
  const campaign = await runAttackCampaignParallel({
    targetAgentSummary: SMOKE_TARGET_AGENT_PROFILE,
    items: selectedPlans,
    mode,
    maxTurns,
    minTurns,
    model: model ?? auth.model
  });
  const completedAt = new Date();

  const report = renderReport({
    model: model ?? auth.model,
    authProvider: auth.provider,
    mode,
    startedAt,
    completedAt,
    campaign
  });
  await writeFile(path.resolve(process.cwd(), outPath), report, "utf8");

  console.log(JSON.stringify({
    model: model ?? auth.model,
    authProvider: auth.provider,
    mode,
    strategy: strategy ?? "all",
    parallel: true,
    outputPath: outPath,
    durationSeconds: Math.round((completedAt.getTime() - startedAt.getTime()) / 1000),
    summary: campaign.summary,
    failures: campaign.failures,
    results: campaign.results.map((result) => ({
      runId: result.runId,
      caseId: result.caseId,
      strategyId: result.strategyId,
      assignedAttacker: result.assignedAttacker,
      minTurns: result.minTurns,
      maxTurns: result.maxTurns,
      turnCount: result.turns.length,
      stoppedReason: result.stoppedReason,
      targetPayloadsClean: result.quality.targetPayloadsClean,
      multiTurnAdapted: result.quality.multiTurnAdapted,
      completedMinimumTurns: result.quality.completedMinimumTurns,
      pursuedNorthStar: result.quality.pursuedNorthStar,
      finalAttackSuccess: result.finalResult.attack_success,
      finalBlockedToolCalls: result.finalResult.blocked_tool_calls,
      finalSensitiveEgressCount: result.finalResult.sensitive_egress_count,
      finalSignals: result.turns.slice(-3).map((turn) => ({
        turn: turn.attackerTurn.turn,
        nextTactic: turn.attackerTurn.progress.nextTactic,
        progress: turn.attackerTurn.progress.northStarProgress,
        signal: turn.northStarSignal.strength,
        reason: turn.northStarSignal.reason,
        toolCalls: turn.traceFeedback.toolCalls,
        findings: turn.traceFeedback.findings
      }))
    }))
  }, null, 2));
}

function renderReport(input: {
  model: string;
  authProvider: string;
  mode: RunMode;
  startedAt: Date;
  completedAt: Date;
  campaign: AttackCampaignParallelResult;
}) {
  const lines = [
    "# Parallel Attacker Campaign Run",
    "",
    `- Model: \`${input.model}\``,
    `- Auth provider: \`${input.authProvider}\``,
    `- Mode: \`${input.mode}\``,
    `- Started: \`${input.startedAt.toISOString()}\``,
    `- Completed: \`${input.completedAt.toISOString()}\``,
    `- Duration seconds: \`${Math.round((input.completedAt.getTime() - input.startedAt.getTime()) / 1000)}\``,
    `- Total plans: \`${input.campaign.summary.total}\``,
    `- Completed: \`${input.campaign.summary.completed}\``,
    `- Failed: \`${input.campaign.summary.failed}\``,
    `- Attack successes: \`${input.campaign.summary.attackSuccesses}\``,
    `- Minimum turn completions: \`${input.campaign.summary.minimumTurnCompletions}\``,
    `- North Star pursuits: \`${input.campaign.summary.northStarPursuits}\``,
    ""
  ];

  if (input.campaign.failures.length) {
    lines.push("## Failures", "");
    for (const failure of input.campaign.failures) {
      lines.push(`- \`${failure.strategyId}\` / \`${failure.planId}\` / \`${failure.caseId}\`: ${failure.error}`);
    }
    lines.push("");
  }

  lines.push("## Results", "");
  for (const result of input.campaign.results) {
    lines.push(
      `### ${result.strategyId} / ${result.assignedAttacker}`,
      "",
      `- Run: \`${result.runId}\``,
      `- Case: \`${result.caseId}\``,
      `- Turn budget: \`${result.minTurns}-${result.maxTurns}\``,
      `- Actual turns: \`${result.turns.length}\``,
      `- Stopped reason: \`${result.stoppedReason}\``,
      `- Payloads clean: \`${result.quality.targetPayloadsClean}\``,
      `- Multi-turn adapted: \`${result.quality.multiTurnAdapted}\``,
      `- Completed minimum turns: \`${result.quality.completedMinimumTurns}\``,
      `- Pursued North Star: \`${result.quality.pursuedNorthStar}\``,
      `- Final attack_success: \`${result.finalResult.attack_success}\``,
      `- Final blocked_tool_calls: \`${result.finalResult.blocked_tool_calls}\``,
      `- Final sensitive_egress_count: \`${result.finalResult.sensitive_egress_count}\``,
      ""
    );

    for (const turn of result.turns) {
      lines.push(
        `#### Turn ${turn.attackerTurn.turn}`,
        "",
        `- Payload placement: \`${turn.attackerTurn.payloadPlacement.channel}\``,
        `- Next tactic: \`${turn.attackerTurn.progress.nextTactic}\``,
        `- North Star progress: \`${turn.attackerTurn.progress.northStarProgress}\``,
        `- Signal: \`${turn.northStarSignal.strength}\` - ${turn.northStarSignal.reason}`,
        `- Persona: ${turn.attackerTurn.persona}`,
        `- North Star focus: ${turn.attackerTurn.northStarFocus}`,
        `- Attack objective: ${turn.attackerTurn.attackObjective}`,
        `- Adaptation rationale: ${turn.attackerTurn.adaptationRationale}`,
        `- Tool calls: ${turn.traceFeedback.toolCalls.length ? turn.traceFeedback.toolCalls.map((tool) => `\`${tool}\``).join(", ") : "none"}`,
        `- Findings: ${turn.traceFeedback.findings.length ? turn.traceFeedback.findings.map((finding) => `\`${finding}\``).join(", ") : "none"}`,
        "",
        "Target payload:",
        "",
        "```text",
        turn.targetPayload,
        "```",
        "",
        "Target output excerpt:",
        "",
        "```text",
        turn.targetOutput.slice(0, 1000),
        "```",
        ""
      );
    }
  }

  return lines.join("\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
