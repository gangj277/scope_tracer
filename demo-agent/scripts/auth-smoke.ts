import { getAuthStatus, runOpenAIResponsesTurn } from "@/lib/openai/client";

async function main() {
  const status = await getAuthStatus();
  console.log(JSON.stringify(status, null, 2));

  if (process.argv.includes("--live")) {
    if (!status.loggedIn) {
      throw new Error(`OpenAI auth is not ready: ${status.raw}`);
    }
    const result = await runOpenAIResponsesTurn({
      messages: [{ role: "user", content: "Return the exact text: ScopeTrace auth smoke ok" }],
      tools: [],
      reasoningEffort: "low"
    });
    console.log(JSON.stringify({ output: result.content, usage: result.usage }, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
