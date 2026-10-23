import "server-only";

// Thin client for any OpenAI-compatible chat API (DeepSeek by default).
// Server-side only: the API key never reaches the browser.
//
// Configured in .env.local (see .env.example):
//   LLM_BASE_URL  default https://api.deepseek.com
//   LLM_MODEL     default deepseek-chat
//   LLM_API_KEY   falls back to DEEPSEEK_API_KEY

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

class LlmHttpError extends Error {
  readonly status: number;
  constructor(status: number, body: string) {
    super(`LLM ${status}: ${body.slice(0, 300)}`);
    this.status = status;
  }
}

function config() {
  const apiKey = process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("LLM_API_KEY (or DEEPSEEK_API_KEY) is not set (see .env.example)");
  return {
    baseUrl: (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    model: process.env.LLM_MODEL || DEFAULT_MODEL,
    apiKey,
  };
}

// Set once a provider rejects response_format, so later calls skip it.
let jsonModeUnsupported = false;

function rejectsJsonMode(err: LlmHttpError) {
  return err.status >= 400 && err.status < 500 && err.status !== 429 && /response_format|json_object|json mode/i.test(err.message);
}

async function post(messages: ChatMessage[], temperature: number, jsonMode: boolean): Promise<string> {
  const { baseUrl, model, apiKey } = config();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: 2000,
      ...(jsonMode && { response_format: { type: "json_object" } }),
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new LlmHttpError(res.status, await res.text());
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

async function chatOnce(messages: ChatMessage[], temperature: number): Promise<string> {
  if (jsonModeUnsupported) return post(messages, temperature, false);
  try {
    return await post(messages, temperature, true);
  } catch (err) {
    if (!(err instanceof LlmHttpError && rejectsJsonMode(err))) throw err;
    console.warn("[llm] provider rejected response_format json_object; retrying without it");
    jsonModeUnsupported = true;
    return post(messages, temperature, false);
  }
}

/** Parses model output as JSON, tolerating code fences and leading/trailing prose. */
export function parseJsonLoose(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("no JSON object in model output");
  }
}

/**
 * Calls the model and runs `validate` on the parsed JSON. On malformed JSON or a
 * validation error, retries (up to `attempts` total) with the error fed back.
 */
export async function chatJson<T>(
  messages: ChatMessage[],
  validate: (value: unknown) => T,
  { attempts = 3, temperature = 0.3 }: { attempts?: number; temperature?: number } = {},
): Promise<{ value: T; attempts: number }> {
  let convo = messages;
  let lastError = "";
  for (let i = 1; i <= attempts; i++) {
    let raw = "";
    try {
      raw = await chatOnce(convo, temperature);
      return { value: validate(parseJsonLoose(raw)), attempts: i };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[llm] attempt ${i} failed: ${lastError}`);
      if (err instanceof LlmHttpError && err.status >= 400 && err.status < 500 && err.status !== 429) break;
      convo = [
        ...messages,
        ...(raw ? [{ role: "assistant" as const, content: raw }] : []),
        {
          role: "user",
          content: `Your previous output could not be used (${lastError}). Return ONLY one valid JSON object in the required format.`,
        },
      ];
    }
  }
  throw new Error(`model did not return valid JSON after ${attempts} attempts: ${lastError}`);
}
