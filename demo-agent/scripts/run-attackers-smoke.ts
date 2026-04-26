import { writeFile } from "node:fs/promises";
import path from "node:path";
import { getAuthStatus } from "@/lib/openai/client";
import { buildSmokeAttackerPlans, SMOKE_TARGET_AGENT_PROFILE } from "@/lib/redteam/attackers/fixtures";
import { runAttackStrategyConversation, type AttackStrategyConversationResult } from "@/lib/redteam/attackers/orchestrator";
import type { AttackStrategyId } from "@/lib/redteam/attack-planner/schema";
import type { RunMode } from "@/lib/types";

function readArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const model = readArg("model");
  const mode = (readArg("mode") ?? "observe") as RunMode;
  const turns = Number(readArg("turns") ?? 2);
  const strategy = readArg("strategy") as AttackStrategyId | undefined;
  const outPath = readArg("out") ?? "docs/attackers-smoke-run.md";

  const auth = await getAuthStatus();
  if (!auth.loggedIn) throw new Error(`OpenAI auth is not ready: ${auth.raw}`);
  if (!Number.isInteger(turns) || turns < 1 || turns > 3) throw new Error("--turns must be an integer from 1 to 3.");
  if (!["observe", "enforce"].includes(mode)) throw new Error("--mode must be observe or enforce.");

  const selectedPlans = buildSmokeAttackerPlans().filter((item) => !strategy || item.plan.strategyId === strategy);
  if (!selectedPlans.length) throw new Error(`No smoke plan selected for strategy=${strategy ?? "all"}.`);

  const results: AttackStrategyConversationResult[] = [];
  for (const item of selectedPlans) {
    results.push(await runAttackStrategyConversation({
      targetAgentSummary: SMOKE_TARGET_AGENT_PROFILE,
      plan: item.plan,
      caseId: item.caseId,
      mode,
      maxTurns: Math.min(turns, item.plan.riskControl.maxTurns),
      model: model ?? auth.model
    }));
  }

  const report = renderReport({ model: model ?? auth.model, authProvider: auth.provider, results });
  await writeFile(path.resolve(process.cwd(), outPath), report, "utf8");

  console.log(JSON.stringify({
    model: model ?? auth.model,
    authProvider: auth.provider,
    mode,
    strategy: strategy ?? "all",
    outputPath: outPath,
    results: results.map((result) => ({
      runId: result.runId,
      caseId: result.caseId,
      strategyId: result.strategyId,
      assignedAttacker: result.assignedAttacker,
      turnCount: result.turns.length,
      targetPayloadsClean: result.quality.targetPayloadsClean,
      multiTurnAdapted: result.quality.multiTurnAdapted,
      producedTraceFeedback: result.quality.producedTraceFeedback,
      finalAttackSuccess: result.finalResult.attack_success,
      finalBlockedToolCalls: result.finalResult.blocked_tool_calls,
      finalSensitiveEgressCount: result.finalResult.sensitive_egress_count,
      turnSummaries: result.turns.map((turn) => ({
        turn: turn.attackerTurn.turn,
        placement: turn.attackerTurn.payloadPlacement.channel,
        objective: turn.attackerTurn.attackObjective,
        firstAction: turn.traceFeedback.firstAction,
        toolCalls: turn.traceFeedback.toolCalls,
        findings: turn.traceFeedback.findings,
        observedWeakness: turn.traceFeedback.observedWeakness,
        targetOutputExcerpt: turn.targetOutput.slice(0, 260)
      }))
    }))
  }, null, 2));
}

function renderReport(input: {
  model: string;
  authProvider: string;
  results: AttackStrategyConversationResult[];
}) {
  const lines = [
    "# Attacker Smoke Run",
    "",
    `- Model: \`${input.model}\``,
    `- Auth provider: \`${input.authProvider}\``,
    `- Strategy count: \`${input.results.length}\``,
    "",
    "## Summary",
    ""
  ];

  for (const result of input.results) {
    lines.push(
      `### ${result.strategyId} / ${result.assignedAttacker}`,
      "",
      `- Run: \`${result.runId}\``,
      `- Case: \`${result.caseId}\``,
      `- Turns: \`${result.turns.length}\``,
      `- Payloads clean: \`${result.quality.targetPayloadsClean}\``,
      `- Multi-turn adapted: \`${result.quality.multiTurnAdapted}\``,
      `- Trace feedback produced: \`${result.quality.producedTraceFeedback}\``,
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
        `- Persona: ${turn.attackerTurn.persona}`,
        `- Attack objective: ${turn.attackerTurn.attackObjective}`,
        `- Adaptation rationale: ${turn.attackerTurn.adaptationRationale}`,
        `- First target action: \`${turn.traceFeedback.firstAction ?? "none"}\``,
        `- Tool calls: ${turn.traceFeedback.toolCalls.length ? turn.traceFeedback.toolCalls.map((tool) => `\`${tool}\``).join(", ") : "none"}`,
        `- Findings: ${turn.traceFeedback.findings.length ? turn.traceFeedback.findings.map((finding) => `\`${finding}\``).join(", ") : "none"}`,
        `- Observed weakness: \`${turn.traceFeedback.observedWeakness ?? "none"}\``,
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
        turn.targetOutput.slice(0, 1200),
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
