import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";

export const DEFAULT_MODEL = process.env.SCOPE_TRACE_MODEL ?? process.env.AGENTBLAST_CODEX_MODEL ?? "gpt-5.5";
const CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
const OPENAI_TOKEN_URL = "https://auth.openai.com/oauth/token";
const OPENAI_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

export type AgentModelTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type AgentModelToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type AgentModelMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
};

export type AgentModelTurn = {
  content: string;
  toolCalls: AgentModelToolCall[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

export type AuthStatus = {
  loggedIn: boolean;
  provider: "codex-oauth" | "openai-api-key" | "none";
  accountId?: string;
  model: string;
  raw: string;
};

type CodexAuthFile = {
  auth_mode?: string;
  tokens?: {
    access_token?: string;
    refresh_token?: string;
    account_id?: string;
  };
};

type CodexCredentials = {
  accessToken: string;
  refreshToken: string;
  accountId: string;
  expiresAt: number;
};

let cachedCodexCredentials: CodexCredentials | null = null;

export async function getAuthStatus(): Promise<AuthStatus> {
  if (process.env.OPENAI_API_KEY && process.env.SCOPE_TRACE_AUTH_PROVIDER === "openai-api-key") {
    return {
      loggedIn: true,
      provider: "openai-api-key",
      model: DEFAULT_MODEL,
      raw: "Using OPENAI_API_KEY"
    };
  }

  try {
    const credentials = await ensureCodexCredentials();
    return {
      loggedIn: true,
      provider: "codex-oauth",
      accountId: credentials.accountId,
      model: DEFAULT_MODEL,
      raw: "Logged in using Codex ChatGPT OAuth"
    };
  } catch (error) {
    return {
      loggedIn: false,
      provider: "none",
      model: DEFAULT_MODEL,
      raw: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function runOpenAIResponsesTurn(input: {
  messages: AgentModelMessage[];
  tools: AgentModelTool[];
  model?: string;
  reasoningEffort?: "low" | "medium" | "high";
}): Promise<AgentModelTurn> {
  const { client, model } = await createOpenAIClient(input.model);
  const { instructions, responseInput } = extractInstructionsAndInput(input.messages);
  const tools = input.tools.length
    ? input.tools.map((tool) => ({
        type: "function",
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters
      }))
    : undefined;
  const response = await client.responses.create({
    model,
    instructions,
    input: responseInput as never,
    tools: tools as never,
    reasoning: input.reasoningEffort ? { effort: input.reasoningEffort } : undefined,
    store: false,
    stream: true
  } as never);

  let content = "";
  let usage: AgentModelTurn["usage"];
  const callsByItemId = new Map<string, { index: number; call: AgentModelToolCall }>();
  let callIndex = 0;

  for await (const event of response as unknown as AsyncIterable<Record<string, unknown>>) {
    if (event.type === "response.output_text.delta") {
      content += readString(event.delta) ?? "";
      continue;
    }
    if (event.type === "response.output_item.added" && isRecord(event.item) && event.item.type === "function_call") {
      const itemId = readString(event.item.id) ?? readString(event.item.call_id) ?? `item_${callIndex}`;
      const callId = readString(event.item.call_id) ?? `call_${callIndex}`;
      callsByItemId.set(itemId, {
        index: callIndex,
        call: {
          id: callId,
          name: readString(event.item.name) ?? "",
          arguments: readString(event.item.arguments) ?? ""
        }
      });
      callIndex += 1;
      continue;
    }
    if (event.type === "response.function_call_arguments.delta") {
      const entry = callsByItemId.get(readString(event.item_id) ?? "");
      if (entry) entry.call.arguments += readString(event.delta) ?? "";
      continue;
    }
    if (event.type === "response.function_call_arguments.done") {
      const entry = callsByItemId.get(readString(event.item_id) ?? "");
      if (entry) entry.call.arguments = readString(event.arguments) ?? entry.call.arguments;
      continue;
    }
    if (event.type === "response.completed" && isRecord(event.response) && isRecord(event.response.usage)) {
      usage = {
        inputTokens: readNumber(event.response.usage.input_tokens),
        outputTokens: readNumber(event.response.usage.output_tokens),
        totalTokens: readNumber(event.response.usage.total_tokens)
      };
    }
  }

  const toolCalls = [...callsByItemId.values()]
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.call)
    .filter((call) => call.name);

  return {
    content,
    toolCalls,
    usage
  };
}

export async function runOpenAIStructuredResponse<T>(input: {
  instructions: string;
  input: string;
  textFormat: unknown;
  model?: string;
  reasoningEffort?: "low" | "medium" | "high";
  parseFallback?: (content: string) => T;
}): Promise<T> {
  const { client, model } = await createOpenAIClient(input.model);
  const body = {
    model,
    instructions: input.instructions,
    input: [{ role: "user", content: input.input }],
    text: { format: input.textFormat as never },
    reasoning: input.reasoningEffort ? { effort: input.reasoningEffort } : undefined,
    store: false
  } as never;
  let response;
  try {
    response = await client.responses.parse(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("400")) throw error;
    const stream = await client.responses.create({ ...(body as Record<string, unknown>), stream: true } as never);
    return parseTextFormat<T>(input.textFormat, await collectOutputText(stream), input.parseFallback);
  }

  const parsed = response.output_parsed as T | null;
  if (parsed) return parsed;

  for (const output of response.output) {
    if (output.type !== "message") continue;
    for (const item of output.content) {
      if (item.type === "refusal") {
        throw new Error(`Structured response refused: ${item.refusal}`);
      }
    }
  }
  throw new Error(`Structured response did not contain parsed output. Raw summary: ${summarizeParsedResponse(response)}`);
}

function summarizeParsedResponse(response: unknown): string {
  if (!isRecord(response)) return "non-object response";
  const output = Array.isArray(response.output) ? response.output : [];
  return JSON.stringify({
    outputParsed: response.output_parsed ?? null,
    outputText: typeof response.output_text === "string" ? response.output_text.slice(0, 1000) : null,
    outputTypes: output.map((item) => {
      if (!isRecord(item)) return { type: typeof item };
      return {
        type: item.type,
        contentTypes: Array.isArray(item.content)
          ? item.content.map((content) => (isRecord(content) ? content.type : typeof content))
          : []
      };
    })
  });
}

async function collectOutputText(response: unknown): Promise<string> {
  let content = "";
  for await (const event of response as AsyncIterable<Record<string, unknown>>) {
    if (event.type === "response.output_text.delta") {
      content += readString(event.delta) ?? "";
    }
  }
  return content;
}

function parseTextFormat<T>(textFormat: unknown, content: string, parseFallback?: (content: string) => T): T {
  if (isRecord(textFormat) && typeof textFormat.$parseRaw === "function") {
    return textFormat.$parseRaw(content) as T;
  }
  if (parseFallback) return parseFallback(content);
  return JSON.parse(content) as T;
}

async function createOpenAIClient(model = DEFAULT_MODEL): Promise<{ client: OpenAI; model: string }> {
  if (process.env.OPENAI_API_KEY && process.env.SCOPE_TRACE_AUTH_PROVIDER === "openai-api-key") {
    return {
      model,
      client: new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 180_000,
        maxRetries: 2
      })
    };
  }

  const credentials = await ensureCodexCredentials();
  return {
    model,
    client: new OpenAI({
      apiKey: credentials.accessToken,
      baseURL: CODEX_BASE_URL,
      timeout: 180_000,
      maxRetries: 2,
      defaultHeaders: {
        originator: "scopetrace-demo-agent",
        "User-Agent": `scopetrace-demo-agent/0.1.0 (${process.platform} ${process.arch})`,
        session_id: randomUUID(),
        "ChatGPT-Account-Id": credentials.accountId
      }
    })
  };
}

export function extractInstructionsAndInput(messages: AgentModelMessage[]) {
  const instructions: string[] = [];
  const responseInput: Array<Record<string, unknown>> = [];

  for (const message of messages) {
    if (message.role === "system") {
      if (message.content) instructions.push(message.content);
      continue;
    }
    if (message.role === "assistant" && message.tool_calls?.length) {
      for (const toolCall of message.tool_calls) {
        responseInput.push({
          type: "function_call",
          call_id: toolCall.id,
          name: toolCall.function.name,
          arguments: toolCall.function.arguments
        });
      }
      if (message.content) responseInput.push({ role: "assistant", content: message.content });
      continue;
    }
    if (message.role === "tool") {
      responseInput.push({
        type: "function_call_output",
        call_id: message.tool_call_id ?? "",
        output: message.content ?? ""
      });
      continue;
    }
    responseInput.push({ role: message.role, content: message.content ?? "" });
  }

  return {
    instructions: instructions.join("\n\n") || "You are a helpful assistant.",
    responseInput
  };
}

async function ensureCodexCredentials(forceRefresh = false): Promise<CodexCredentials> {
  const current = cachedCodexCredentials ?? (await loadCodexCredentials());
  cachedCodexCredentials = current;

  if (!forceRefresh && current.expiresAt - Date.now() >= 30_000) {
    return current;
  }

  const refreshed = await refreshAccessToken(current.refreshToken);
  cachedCodexCredentials = {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || current.refreshToken,
    accountId: current.accountId,
    expiresAt: Date.now() + refreshed.expires_in * 1000
  };
  return cachedCodexCredentials;
}

async function loadCodexCredentials(): Promise<CodexCredentials> {
  const authFilePath = path.join(process.env.HOME ?? "", ".codex", "auth.json");
  const parsed = JSON.parse(await readFile(authFilePath, "utf8")) as CodexAuthFile;
  if (parsed.auth_mode !== "chatgpt") {
    throw new Error("Codex is not signed in with ChatGPT OAuth on this device.");
  }
  const accessToken = assertString(parsed.tokens?.access_token, "Codex auth is missing an access token.");
  const refreshToken = assertString(parsed.tokens?.refresh_token, "Codex auth is missing a refresh token.");
  const accountId = assertString(parsed.tokens?.account_id, "Codex auth is missing an account ID.");
  return { accessToken, refreshToken, accountId, expiresAt: getTokenExpiryMs(accessToken) };
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const response = await fetch(OPENAI_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: OPENAI_CLIENT_ID,
      refresh_token: refreshToken
    })
  });
  if (!response.ok) {
    throw new Error(`Token refresh failed (${response.status}): ${await response.text()}`);
  }
  return response.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

function getTokenExpiryMs(token: string): number {
  const parts = token.split(".");
  if (parts.length < 2) throw new Error("Invalid JWT format.");
  const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as { exp?: unknown };
  if (typeof payload.exp !== "number") throw new Error("Codex access token is missing an expiry.");
  return payload.exp * 1000;
}

function assertString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(message);
  return value;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
