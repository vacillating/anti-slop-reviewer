// Checks that chatJson retries on malformed or invalid model output.
// Usage: node --conditions=react-server scripts/test-json-retry.mts
import { chatJson, parseJsonLoose } from "../src/lib/llm.ts";

process.env.LLM_API_KEY ??= "test";
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

// A provider that rejects response_format: one 400, then a retry without it, and
// later calls skip it.
const bodies: { response_format?: unknown }[] = [];
globalThis.fetch = (async (_url: string, init: RequestInit) => {
  const body = JSON.parse(init.body as string);
  bodies.push(body);
  if (body.response_format) {
    return new Response('{"error":{"message":"response_format json_object is not supported by this model"}}', { status: 400 });
  }
  return new Response(JSON.stringify({ choices: [{ message: { content: '{"type":"question","text":"How do you see it?","citations":[]}' } }] }));
}) as typeof fetch;

const first = await chatJson([{ role: "user", content: "hi" }], validate);
const second = await chatJson([{ role: "user", content: "hi" }], validate);
console.assert(first.value.type === "question" && second.value.type === "question", "fallback should succeed");
console.assert(bodies.length === 3 && !bodies[1].response_format && !bodies[2].response_format, "json mode should be dropped after the first rejection");
console.log(`json-mode fallback test passed: ${bodies.length} requests, response_format dropped after the first`);
