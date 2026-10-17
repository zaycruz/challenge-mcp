// E2E against the deployed server with the official MCP client: initialize, tools/list, call every tool.
// Usage: node e2e/run.mjs [https://emerge-mcp.raava.dev/mcp]. Writes runs/<stamp>.json and runs/latest.md; exits 1 on any failed check.
// C5 traffic is kept small: one 7-line transcript, one stored call, one cue from already-tagged lines.
// Injected failures (?fault=llm-down / llm-slow) never reach a model. Set MCP_KEY to also test the keyed path.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { searchFixtures } from "./search-fixtures.mjs";

const URL_ = process.argv[2] ?? "https://emerge-mcp.raava.dev/mcp";
const started = new Date();
const checks = [];
const calls = [];
const check = (name, pass, detail = "") => { checks.push({ name, pass: !!pass, detail }); console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`); };

const client = new Client({ name: "challenge-mcp-e2e", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(URL_)));
const info = client.getServerVersion();
check("initialize", info?.name === "emerge-challenge-mcp", JSON.stringify(info));

const { tools } = await client.listTools();
const EXPECTED = ["triage_today", "list_survivors", "get_survivor", "patient_overview", "module_metrics", "glucose_advice", "list_coaching_calls", "get_coaching_call", "score_conversation", "coaching_cue", "search", "fetch"];
check("tools/list has every tool", EXPECTED.every((n) => tools.some((t) => t.name === n)), tools.map((t) => t.name).join(", "));
check("every tool has a non-empty input schema", tools.every((t) => Object.keys(t.inputSchema?.properties ?? {}).length > 0), tools.filter((t) => !Object.keys(t.inputSchema?.properties ?? {}).length).map((t) => t.name).join(", ") || "all have properties");
check("default tools/list hides reveal_outcome_demo", !tools.some((t) => t.name === "reveal_outcome_demo"));
check("every tool is marked readOnlyHint", tools.every((t) => t.annotations?.readOnlyHint === true));
check("every tool declares an outputSchema (object, with required fields)", tools.every((t) => t.outputSchema?.type === "object" && (t.outputSchema.required ?? []).length > 0), tools.filter((t) => !t.outputSchema).map((t) => t.name).join(", ") || "all 12");
{
  // Unknown tool: a JSON-RPC error (spec: tools > Error Handling, -32602), not an isError result, and no module names.
  const res = await fetch(URL_, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "no_such_tool", arguments: {} } }) });
  const j = await res.json();
  check("unknown tool is a JSON-RPC error -32602 naming only the tool", j.id === 7 && !j.result && j.error?.code === -32602 && j.error.message === "Unknown tool: no_such_tool" && !/C[1-5]|P360|patient-360|copilot|\/api\//i.test(JSON.stringify(j)), JSON.stringify(j));
}
check("every tool has a description of 40+ chars", tools.every((t) => (t.description ?? "").length >= 40));

async function run(name, args, expectError = false) {
  const t0 = Date.now();
  // A protocol error (unknown tool, bad arguments) counts as an error result.
  const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 120_000 }).catch((e) => ({ isError: true, content: [{ type: "text", text: `protocol error: ${e.message}` }] }));
  const ms = Date.now() - t0;
  const text = r.content?.map((c) => c.text).join("\n") ?? "";
  calls.push({ name, args, ms, isError: !!r.isError, summary: r.content?.[0]?.text?.slice(0, 1500), structuredContent: r.structuredContent });
  check(`${name} ${expectError ? "returns isError" : "succeeds"} (${ms} ms)`, expectError ? r.isError : !r.isError, r.isError ? text.slice(0, 200) : "");
  return r.structuredContent ?? {};
}

// Rosters and triage
const triage = await run("triage_today", {});
check("triage defaults to a short list (10)", triage.rows?.length === 10 && triage.needingAttention > 10, `${triage.rows?.length} of ${triage.needingAttention}`);
check("triage counts all 4 cohorts", ["c1", "c3", "c4", "c5"].every((m) => triage.perCohort?.[m]?.statusCounts), JSON.stringify(Object.fromEntries(Object.entries(triage.perCohort ?? {}).map(([m, c]) => [m, c.statusCounts]))));
check("triage lists urgent C3 first", triage.rows?.[0]?.urgent === true && triage.rows[0].cohort === "c3", triage.rows?.[0]?.survivorId);
// Two survivors may share a module's headline wording (C3's urgent line), so uniqueness is per survivor, not per reason text.
check("triage rows have rank, cohort and their own reason", triage.rows?.every((r, i) => r.rank === i + 1 && r.cohort && r.cohortName && r.reason?.startsWith(r.cohortName) && r.reason.length > r.cohortName.length + 5) && new Set(triage.rows.map((r) => r.survivorId)).size === triage.rows.length);
check("triage mixes cohorts in the top 10", new Set(triage.rows?.map((r) => r.cohort)).size === 4, triage.rows?.map((r) => r.cohort).join(","));
check("triage says cohorts are not joined", triage.cohortsJoined === false && /not joined/.test(calls.at(-1).summary));
check("triage rows carry horizon and scale", triage.rows?.every((r) => r.horizon && r.scale), [...new Set(triage.rows?.map((r) => `${r.cohort}: ${r.horizon}`))].join("; "));
check("triage says risks are not comparable across cohorts", triage.comparableAcrossCohorts === false && /not comparable across cohorts/.test(calls.at(-1).summary));
const triageMax = await run("triage_today", { limit: 25, includeWatch: true });
check("triage caps at 25", triageMax.rows?.length === 25);
await run("triage_today", { limit: 26 }, true);
const ids = {};
for (const m of ["c1", "c3", "c4", "c5"]) {
  const l = await run("list_survivors", { module: m, limit: 3 });
  ids[m] = l.rows?.[0]?.survivorId;
  check(`list_survivors ${m} returns rows`, l.rows?.length > 0 && l.total > 0, `${l.total} total, first ${ids[m]}`);
}
const q = await run("list_survivors", { module: "c1", query: "breast", status: "alert" });
check("list_survivors filters by text and status", q.rows?.every((r) => r.status === "alert" && /breast/i.test(r.displayName + r.headline)), `${q.matched} matched`);
const urgentOnly = await run("list_survivors", { module: "c3", urgentOnly: true });
check("list_survivors urgentOnly", urgentOnly.rows?.length > 0 && urgentOnly.rows.every((r) => r.urgent), `${urgentOnly.matched} urgent`);

// One survivor per module
for (const m of ["c1", "c3", "c4", "c5"]) {
  const v = await run("get_survivor", { survivorId: ids[m] });
  check(`get_survivor ${m} has headline + evidence/recommendations`, v.headline && (v.recommendations || v.evidence), ids[m]);
  if (m === "c3") check("get_survivor c3 hides the outcome", !("demo" in v) && !JSON.stringify(v).includes("roughPatchStartsInDays"));
}
const charts = await run("get_survivor", { survivorId: ids.c3, includeCharts: true });
check("get_survivor c3 charts trimmed to 14 days", charts.chartsLast14Days?.dates?.length === 14);
await run("get_survivor", { survivorId: "c1-NOPE" }, true);
check("errors do not leak upstream paths", !/\/api\/|https?:\/\//.test(calls.at(-1).summary), calls.at(-1).summary);
await run("module_metrics", { module: "c9" }, true);
check("bad arguments get a plain message, not the SDK's validation dump", /^Bad arguments for module_metrics: /.test(calls.at(-1).summary) && !/-32602|Input validation error/.test(calls.at(-1).summary), calls.at(-1).summary);
{
  const h = await fetch(new URL("/health", URL_)).then((r) => r.json());
  const p = h.provenance ?? {};
  check("/health ties the server to a commit, a deploy and model ids", /^[0-9a-f]{7,}$/.test(p.gitSha ?? "") && p.deployId && p.deployId !== "unknown" && /@cf\//.test(p.models?.coaching_cue ?? ""), JSON.stringify({ gitSha: p.gitSha, deployId: p.deployId, deployedAt: p.deployedAt }));
  globalThis.PROVENANCE = p;
}
await run("get_survivor", { survivorId: "x9-123" }, true);

const ov = await run("patient_overview", { survivorId: ids.c3 });
check("patient_overview says ids do not join", ov.idsJoin === false && ov.modules?.c3?.enrolled === true && ["c1", "c4", "c5"].every((m) => ov.modules?.[m]?.enrolled === false), JSON.stringify(ov.modules));

for (const m of ["c1", "c3", "c4", "c5"]) {
  const d = await run("module_metrics", { module: m });
  if (m === "c1") {
    check("module_metrics c1 reads the live finalModel", d.finalModel?.key === "forest" && d.metrics?.forest?.auroc?.value > 0.7 && !("logistic" in (d.metrics ?? {})), `${d.finalModel?.key} AUROC ${d.metrics?.forest?.auroc?.value?.toFixed(3)}`);
    check("module_metrics c1 gives the gain over baseline with a CI", Array.isArray(d.gainOverBaseline?.auroc?.ci95) && /optimistic/i.test(d.gainOverBaseline?.basis ?? ""), d.gainOverBaseline?.basis);
    const n = d.headlineGain?.auroc;
    check("module_metrics c1 leads with the nested-CV gain and names both", n && Math.abs(n.gain - 0.04) < 0.006 && Array.isArray(n.ci95) && /nested CV/.test(calls.at(-1).summary) && /\+0\.039/.test(calls.at(-1).summary) && /\+0\.053/.test(calls.at(-1).summary) && calls.at(-1).summary.indexOf("nested CV") < calls.at(-1).summary.indexOf("+0.053"), calls.at(-1).summary.slice(0, 400));
  }
  if (m === "c5") {
    const a = d.correlations?.find((c) => c.pair === "app score vs supervisor A"), ab = d.correlations?.find((c) => c.pair === "supervisor A vs supervisor B");
    check("module_metrics c5 relays the 477-call validation per supervisor", d.calls >= 400 && a?.ci95 && ab?.ci95 && /on par with a second supervisor/.test(calls.at(-1).summary), calls.at(-1).summary.slice(0, 300));
    check("module_metrics c5 labels this server's own check n = 1", /n = 1/.test(d.mcpLiveCheck ?? ""));
    check("module_metrics c5 subgroups give flags by language", d.subgroups?.rows?.length >= 2 && d.subgroups.rows.every((r) => r.dimension === "Language" && r.flagsCaught?.n > 0), JSON.stringify(d.subgroups?.rows?.map((r) => [r.group, r.flagsCaught?.k, r.flagsCaught?.n])));
    continue;
  }
  if (m === "c3") check("module_metrics c3 has model and baseline", d.model?.weeks?.auc && d.scheduleBaseline?.weeks?.auc, `${d.model?.weeks?.auc} vs ${d.scheduleBaseline?.weeks?.auc}`);
  check(`module_metrics ${m} has subgroups`, d.subgroups && Array.isArray(d.subgroups.rows) && d.subgroups.rows.length > 0, `${d.subgroups?.rows?.length} rows: ${[...new Set(d.subgroups?.rows?.map((r) => r.dimension))].join(", ")}`);
  if (m === "c3") check("module_metrics c3 subgroups include language", d.subgroups?.rows?.some((r) => r.dimension === "Language"));
  check(`module_metrics ${m} is compact`, JSON.stringify(d).length < 12_000, `${JSON.stringify(d).length} chars`);
}
const adv = await run("glucose_advice", { survivorId: ids.c4 });
check("glucose_advice returns advice items", Array.isArray(adv.items) && adv.items.length > 0 && adv.items.every((i) => i.text), adv.items?.map((i) => i.source).join(","));
check("glucose_advice reports timing and model calls", typeof adv.timing?.ms === "number" && "modelCalls" in adv.timing, JSON.stringify(adv.timing));
const adv2 = await run("glucose_advice", { survivorId: ids.c4 });
check("glucose_advice second call is served from cache", adv2.timing?.cached === true && adv2.timing.modelCalls === 0, JSON.stringify(adv2.timing));
await run("reveal_outcome_demo", { survivorId: ids.c3 }, true);
// The demo tool lives only on /mcp?tools=demo.
const demoClient = new Client({ name: "challenge-mcp-e2e-demo", version: "1.0.0" });
await demoClient.connect(new StreamableHTTPClientTransport(new URL(URL_ + "?tools=demo")));
check("?tools=demo lists reveal_outcome_demo", (await demoClient.listTools()).tools.some((t) => t.name === "reveal_outcome_demo"));
const demoRes = await demoClient.callTool({ name: "reveal_outcome_demo", arguments: { survivorId: ids.c3 } });
calls.push({ name: "reveal_outcome_demo (?tools=demo)", args: { survivorId: ids.c3 }, isError: !!demoRes.isError, summary: demoRes.content?.[0]?.text });
check("reveal_outcome_demo works on ?tools=demo", !demoRes.isError && demoRes.structuredContent?.outcome && "roughPatchStartsInDays" in demoRes.structuredContent.outcome);
await demoClient.close();

// C5: calls on file, scoring, cues
const callsList = await run("list_coaching_calls", { limit: 30 });
check("list_coaching_calls returns calls", callsList.calls?.length > 0, `${callsList.matched} calls`);
const shortest = [...callsList.calls].sort((a, b) => a.lines - b.lines)[0];
const call = await run("get_coaching_call", { callId: shortest.callId });
check("get_coaching_call has a transcript", call.lines?.length === call.lineCount && call.lineCount > 0, `${shortest.callId}, ${call.lineCount} lines`);
await run("get_coaching_call", { callId: "CALL99999" }, true);

const transcript = [
  "coach: Hi Rosa, how has your week been with the walking plan?",
  "participant: Not great. I've had a fever since yesterday and my chest feels tight.",
  "coach: Okay. So did you manage to do the walks after dinner?",
  "participant: Twice, I think.",
  "coach: You really need to walk every day, no excuses.",
  "participant: I know, I want to get back to it.",
  "coach: What would make it easier to walk after dinner this week?",
].join("\n");
const sc = await run("score_conversation", { transcript });
const l2 = sc.lines?.[1], l3 = sc.lines?.[2];
check("score_conversation flags the symptom line medical", l2?.flag === "medical", JSON.stringify(l2));
check("score_conversation carries the flag: next coach line is missed_concern", l3?.flag === "missed_concern", JSON.stringify(l3));
check("score_conversation tags every line", sc.lines?.every((l) => l.tag), sc.lines?.map((l) => l.tag).join(" | "));
check("score_conversation scores (4 coach lines)", typeof sc.score === "number" && sc.score >= 0 && sc.score <= 100, `score ${sc.score}`);
check("score_conversation finds cue moments", sc.cueMoments?.length > 0, JSON.stringify(sc.cueMoments));

const scCall = await run("score_conversation", { callId: shortest.callId });
check("score_conversation on a stored call compares with the supervisor", scCall.comparison && typeof scCall.comparison.coachMoveAgreement === "number", JSON.stringify(scCall.comparison));

const cue = await run("coaching_cue", { recent: sc.lines.slice(0, 3).map(({ speaker, text, tag, flag }) => ({ speaker, text, tag, ...(flag ? { flag } : {}) })) });
check("coaching_cue uses the Co-pilot rule for a missed concern", cue.triggerSource === "copilot-rule" && /concern/i.test(cue.trigger), cue.trigger);
check("coaching_cue returns a cue", typeof cue.cue === "string" && cue.cue.length > 0, `${cue.cue} / ${cue.say}`);
await run("score_conversation", { transcript: "hello there" }, true);

// ChatGPT search/fetch pair
const s = await run("search", { query: "urgent" });
check("search returns results with id/title/url", s.results?.length > 0 && s.results.every((r) => r.id && r.title && r.url), `${s.results?.length} results`);
const f = await run("fetch", { id: s.results[0].id });
check("fetch returns id/title/text/url", f.id && f.title && f.text && f.url);

// Search relevance: fixture queries (e2e/search-fixtures.mjs)
for (const fx of searchFixtures(ids)) {
  const r = await run("search", { query: fx.query });
  check(`search "${fx.query}": ${fx.want}`, fx.ok(r.results ?? []), (r.results ?? []).slice(0, 3).map((x) => `${x.id} (${x.matched})`).join("; ") || "no results");
}

// Injected failures: the model-backed upstreams of this request only. Nothing here reaches a model.
async function faultClient(fault) {
  const c = new Client({ name: `challenge-mcp-e2e-${fault}`, version: "1.0.0" });
  await c.connect(new StreamableHTTPClientTransport(new URL(`${URL_}?fault=${fault}`)));
  return c;
}
async function runOn(c, label, name, args) {
  const t0 = Date.now();
  const r = await c.callTool({ name, arguments: args }, undefined, { timeout: 120_000 }).catch((e) => ({ isError: true, content: [{ text: `protocol error: ${e.message}` }] }));
  calls.push({ name: `${name} [${label}]`, args, ms: Date.now() - t0, isError: !!r.isError, summary: r.content?.[0]?.text?.slice(0, 1500), structuredContent: r.structuredContent });
  return { r, ms: Date.now() - t0, d: r.structuredContent ?? {} };
}
const down = await faultClient("llm-down");
{
  const { r, d } = await runOn(down, "fault=llm-down", "glucose_advice", { survivorId: ids.c4 });
  check("model down: glucose_advice falls back to C4's template advice", !r.isError && d.degraded === true && d.items?.length > 0 && d.items.every((i) => i.source === "template-fallback"), `${d.items?.length} items; ${d.degradedReason}`);
  check("model down: glucose_advice retried once", d.timing?.retries === 1 && d.timing?.failedCalls === 1, JSON.stringify(d.timing));
}
{
  const { r, d } = await runOn(down, "fault=llm-down", "coaching_cue", { recent: sc.lines.slice(0, 3).map(({ speaker, text, tag, flag }) => ({ speaker, text, tag, ...(flag ? { flag } : {}) })) });
  check("model down: coaching_cue gives the rule-based fallback cue", !r.isError && d.degraded === true && d.source === "rule-fallback" && d.cue && d.say, `${d.cue}`);
}
{
  const { r } = await runOn(down, "fault=llm-down", "score_conversation", { transcript: "coach: How was your week?\nparticipant: Fine.\ncoach: What went well?\nparticipant: The walks." });
  check("model down: score_conversation says the model failed instead of scoring", r.isError && /failed on 4 of 4 lines/.test(r.content?.[0]?.text ?? ""), r.content?.[0]?.text?.slice(0, 160));
}
await down.close();
const slow = await faultClient("llm-slow");
{
  const { r, d, ms } = await runOn(slow, "fault=llm-slow", "glucose_advice", { survivorId: ids.c4 });
  check("model hangs: glucose_advice times out (9 s, one retry) and falls back", !r.isError && d.degraded === true && /did not answer within 9 s/.test(d.degradedReason ?? "") && ms < 25_000, `${ms} ms; ${d.degradedReason}`);
}
await slow.close();

// Auth: an unknown bearer key is refused; with MCP_KEY set, the keyed path works.
{
  const r = await fetch(URL_, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: "Bearer not-a-real-key" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  check("unknown bearer key gets 401", r.status === 401, `${r.status} ${(await r.text()).slice(0, 120)}`);
}
if (process.env.MCP_KEY) {
  const kc = new Client({ name: "challenge-mcp-e2e-key", version: "1.0.0" });
  await kc.connect(new StreamableHTTPClientTransport(new URL(URL_), { requestInit: { headers: { authorization: `Bearer ${process.env.MCP_KEY}` } } }));
  check("a valid bearer key connects and lists tools", (await kc.listTools()).tools.length === EXPECTED.length);
  await kc.close();
}

// Rate limit on the model-backed tools. Last, because it spends this IP's budget for a minute.
// "hello there" fails to parse after the limit check, so these calls never reach the model.
let limited = null;
for (let i = 0; i < 30 && !limited; i++) {
  const r = await client.callTool({ name: "score_conversation", arguments: { transcript: "hello there" } }).catch((e) => ({ content: [{ text: e.message }] }));
  if (/Rate limit/.test(r.content?.[0]?.text ?? "")) limited = { afterCalls: i + 1, text: r.content[0].text };
}
calls.push({ name: "score_conversation (rate limit probe)", args: { transcript: "hello there" }, isError: true, summary: limited?.text ?? "never limited" });
check("model-backed tools are rate-limited per IP", !!limited, limited ? `limited after ${limited.afterCalls} probe calls: ${limited.text.slice(0, 120)}` : "never limited");

const noStruct = calls.filter((c) => !c.isError && c.ms !== undefined && !c.structuredContent).map((c) => c.name);
check("every successful call returns structuredContent (validated by the SDK client against outputSchema)", noStruct.length === 0, noStruct.join(", ") || `${calls.filter((c) => !c.isError && c.structuredContent).length} calls`);
await client.close();
const failed = checks.filter((c) => !c.pass);
const stamp = started.toISOString().replace(/[:.]/g, "-");
mkdirSync("runs", { recursive: true });
const report = { url: URL_, startedAt: started.toISOString(), seconds: (Date.now() - started) / 1000, server: info, provenance: globalThis.PROVENANCE, tools: tools.map((t) => ({ name: t.name, annotations: t.annotations, inputs: Object.keys(t.inputSchema?.properties ?? {}) })), passed: checks.length - failed.length, failed: failed.length, checks, calls };
writeFileSync(`runs/${stamp}.json`, JSON.stringify(report, null, 2));
const md = [`# challenge-mcp E2E ${started.toISOString()}`, "", `Server: ${URL_} (${info?.name} ${info?.version}, commit ${globalThis.PROVENANCE?.gitSha}, deploy ${globalThis.PROVENANCE?.deployId}). ${report.passed}/${checks.length} checks passed in ${report.seconds.toFixed(1)} s.`, `Full run: runs/${stamp}.json`, "", "| | Check | Detail |", "|---|---|---|", ...checks.map((c) => `| ${c.pass ? "PASS" : "FAIL"} | ${c.name} | ${String(c.detail).replace(/\|/g, "/").slice(0, 160)} |`), "", "## Tool summaries (first text block of each call)", "", ...calls.map((c) => `### ${c.name} ${JSON.stringify(c.args).slice(0, 120)}\n\n\`\`\`\n${c.summary}\n\`\`\``)].join("\n");
writeFileSync("runs/latest.md", md);
console.log(`\n${report.passed}/${checks.length} passed -> runs/${stamp}.json, runs/latest.md`);
process.exit(failed.length ? 1 : 0);
