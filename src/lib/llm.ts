import "server-only";

// Thin DeepSeek (OpenAI-compatible) client. Server-side only: the API key never
// reaches the browser.

const BASE_URL = "https://api.deepseek.com";
const MODEL = "deepseek-chat";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function chatOnce(messages: ChatMessage[], temperature: number): Promise<string> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY is not set (see .env.local)");

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
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
      if (lastError.startsWith("DeepSeek 4") && !lastError.startsWith("DeepSeek 429")) break;
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
