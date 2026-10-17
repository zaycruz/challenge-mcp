// Latency (p50/p95) and estimated model cost per tool call against the live server.
// Usage: MCP_KEY=... node scripts/bench.mjs [url]. Without MCP_KEY it runs anonymously (20 model-backed calls/min per IP);
// the bench makes 18 model-backed calls, so with no key it may hit the limit.
// Writes runs/bench-<stamp>.json and runs/bench-latest.md.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mkdirSync, writeFileSync } from "node:fs";

const URL_ = process.argv[2] ?? "https://emerge-mcp.raava.dev/mcp";
const headers = process.env.MCP_KEY ? { authorization: `Bearer ${process.env.MCP_KEY}` } : {};
const client = new Client({ name: "challenge-mcp-bench", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(URL_), { requestInit: { headers } }));

// Workers AI list prices (developers.cloudflare.com/workers-ai/platform/pricing, read 2026-10-17), USD per 1M tokens.
const PRICE = {
  "llama-3.3-70b-instruct-fp8-fast": { in: 0.293, out: 2.253 }, // C4 advice
  "clef": { in: 0.24, out: 0 },                                   // C5 line tagging (Clef bills input only)
  "glm-5.3-flash": { in: 0.15, out: 0.5 },                        // C5 cue
};
// Token estimates: about 4 characters per token. Prompt sizes measured from the module sources:
// C4 system prompt ~430 chars + the template items; C5 /api/turn: coach line ~4,200 chars of rules and options,
// participant line ~1,800 chars (talk + flag questions); C5 cue system prompt ~760 chars + the last lines.
const tok = (chars) => Math.ceil(chars / 4);
const usd = (p, i, o) => (i * p.in + o * p.out) / 1e6;

const rows = [];
async function time(tool, args, cost) {
  const t0 = Date.now();
  const r = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 120_000 });
  const ms = Date.now() - t0;
  const d = r.structuredContent ?? {};
  rows.push({ tool, ms, isError: !!r.isError, serverMs: d.timing?.ms, cached: d.timing?.cached ?? false, upstreamCached: d.timing?.upstreamCached ?? false, degraded: d.degraded ?? false, modelCalls: d.timing?.modelCalls, usd: !r.isError && cost && !d.timing?.cached && !d.timing?.upstreamCached ? cost(d) : 0 });
  return d;
}

// This server caches advice for 6 h, so a rerun on the same survivors only measures the cache. BENCH_OFFSET picks 8 others.
const OFFSET = Number(process.env.BENCH_OFFSET ?? 1);
const c4 = (await client.callTool({ name: "list_survivors", arguments: { module: "c4", limit: 50 } })).structuredContent.rows;
for (const r of c4.slice(OFFSET, OFFSET + 8)) {
  const tmpl = (await client.callTool({ name: "get_survivor", arguments: { survivorId: r.survivorId } })).structuredContent.recommendations ?? [];
  const inChars = 430 + JSON.stringify(tmpl.map((t) => ({ text: t.text }))).length;
  await time("glucose_advice", { survivorId: r.survivorId }, (d) => usd(PRICE["llama-3.3-70b-instruct-fp8-fast"], tok(inChars), tok(JSON.stringify((d.items ?? []).filter((i) => i.source === "ai").map((i) => ({ text: i.text }))).length)));
  await time("glucose_advice", { survivorId: r.survivorId }); // second call: cache
}
const transcript = "coach: How has your week been with the walks?\nparticipant: Better, I walked three times.\ncoach: What made those days work?\nparticipant: Going right after lunch.";
for (let i = 0; i < 4; i++) await time("score_conversation", { transcript }, () => usd(PRICE.clef, tok(2 * 4200 + 2 * 1800 + 4 * 200), 0));
const recent = [
  { speaker: "coach", text: "Did you do the walks?", tag: "closed question" },
  { speaker: "participant", text: "No. Work was crazy and I was exhausted.", tag: "sustain" },
  { speaker: "coach", text: "You have to make time for it.", tag: "persuade" },
];
const triggers = ["The coach just told the participant what to do without asking permission.", "The coach asked for help with the next line.", "Three closed questions in a row.", "The participant voiced change talk and the coach did not reflect or affirm it.", "The coach has asked four questions in a row without a reflection.", "The coach just confronted the participant."];
// C5 caches cue answers in KV for a week, keyed by the prompt, so a fixed prompt only measures the cache after the first run.
// A per-run tag on the trigger makes these 6 calls reach the live model (6 GLM calls per bench run).
const RUN_TAG = new Date().toISOString();
for (const t of triggers) await time("coaching_cue", { recent, trigger: `${t} (bench ${RUN_TAG})` }, (d) => usd(PRICE["glm-5.3-flash"], tok(760 + JSON.stringify(recent).length + t.length), tok(String(d.cue ?? "").length + String(d.say ?? "").length + 40)));
for (let i = 0; i < 5; i++) await time("triage_today", {});
for (let i = 0; i < 5; i++) await time("search", { query: ["night shift", "urgent", "breast alert", "sleep", "fever"][i] });
for (const m of ["c1", "c3", "c4", "c5"]) await time("module_metrics", { module: m });
await client.close();

const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]; };
const groups = {};
for (const r of rows) (groups[`${r.tool}${r.tool === "glucose_advice" ? (r.cached ? " (this server's cache)" : r.upstreamCached ? " (C4 precomputed rewrite)" : " (live model)") : r.tool === "coaching_cue" ? (r.upstreamCached ? " (C5 KV cache)" : " (live model)") : ""}`] ??= []).push(r);
const table = Object.entries(groups).map(([k, rs]) => ({
  tool: k, n: rs.length, errors: rs.filter((r) => r.isError).length, degraded: rs.filter((r) => r.degraded).length,
  p50: pct(rs.map((r) => r.ms), 50), p95: pct(rs.map((r) => r.ms), 95), max: Math.max(...rs.map((r) => r.ms)),
  usdPerCall: +(rs.reduce((s, r) => s + r.usd, 0) / rs.length).toFixed(6),
}));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync("runs", { recursive: true });
writeFileSync(`runs/bench-${stamp}.json`, JSON.stringify({ url: URL_, at: new Date().toISOString(), keyed: !!process.env.MCP_KEY, price: PRICE, table, rows }, null, 2));
const md = [
  `# challenge-mcp bench ${new Date().toISOString()}`, "",
  `Server: ${URL_}. Client-side wall time per tool call (from this machine), ${rows.length} calls. Cost is an estimate: Workers AI list prices x tokens estimated at 4 characters per token; C5 tagging bills input only. Full rows: runs/bench-${stamp}.json`, "",
  "| Tool | n | p50 ms | p95 ms | max ms | errors | degraded | est. USD per call |", "|---|---|---|---|---|---|---|---|",
  ...table.map((t) => `| ${t.tool} | ${t.n} | ${t.p50} | ${t.p95} | ${t.max} | ${t.errors} | ${t.degraded} | ${t.usdPerCall ? `$${t.usdPerCall.toFixed(5)}` : "0 (no model)"} |`),
].join("\n");
writeFileSync("runs/bench-latest.md", md);
console.log(md);
