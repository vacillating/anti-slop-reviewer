// Checks that chatJson retries on malformed or invalid model output.
// Usage: node --conditions=react-server scripts/test-json-retry.mts
import { chatJson, parseJsonLoose } from "../src/lib/llm.ts";

process.env.DEEPSEEK_API_KEY ??= "test";
const replies = [
  '{"type":"walkthrough","text":💥}', // malformed (what DeepSeek actually returned once)
  '```json\n{"type":"verdict","text":"x","citations":[]}\n```', // valid JSON, wrong type
  'Sure! {"type":"answer","text":"Yes. (p. 8)","citations":[{"page":8,"quote":"No NSP"}]} Hope that helps.',
];
let calls = 0;
globalThis.fetch = (async () =>
  new Response(JSON.stringify({ choices: [{ message: { content: replies[calls++] } }] }))) as typeof fetch;

const validate = (v: unknown) => {
  const t = v as { type?: string };
  if (!["walkthrough", "question", "answer", "fact_correction", "decline"].includes(t.type ?? "")) {
    throw new Error(`invalid type ${t.type}`);
  }
  return t;
};

const { value, attempts } = await chatJson([{ role: "user", content: "hi" }], validate);
console.assert(attempts === 3 && value.type === "answer", "expected success on 3rd attempt");
console.assert((parseJsonLoose('```json\n{"a":1}\n```') as { a: number }).a === 1, "fence stripping");
console.log(`retry test passed: ${attempts} attempts, final type=${value.type}`);
