// E2E against the deployed server with the official MCP client: initialize, tools/list, call every tool.
// Usage: node e2e/run.mjs [https://emerge-mcp.raava.dev/mcp]. Writes runs/<stamp>.json and runs/latest.md; exits 1 on any failed check.
// C5 traffic is kept small: one 7-line transcript, one stored call, one cue from already-tagged lines.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mkdirSync, writeFileSync } from "node:fs";

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
const EXPECTED = ["triage_today", "list_survivors", "get_survivor", "patient_overview", "module_metrics", "glucose_advice", "reveal_outcome_demo", "list_coaching_calls", "get_coaching_call", "score_conversation", "coaching_cue", "search", "fetch"];
check("tools/list has every tool", EXPECTED.every((n) => tools.some((t) => t.name === n)), tools.map((t) => t.name).join(", "));
check("every tool has a non-empty input schema", tools.every((t) => Object.keys(t.inputSchema?.properties ?? {}).length > 0), tools.filter((t) => !Object.keys(t.inputSchema?.properties ?? {}).length).map((t) => t.name).join(", ") || "all have properties");
check("every tool is marked readOnlyHint", tools.every((t) => t.annotations?.readOnlyHint === true));
check("every tool has a description of 40+ chars", tools.every((t) => (t.description ?? "").length >= 40));

async function run(name, args, expectError = false) {
  const t0 = Date.now();
  const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 120_000 });
  const ms = Date.now() - t0;
  const text = r.content?.map((c) => c.text).join("\n") ?? "";
  calls.push({ name, args, ms, isError: !!r.isError, summary: r.content?.[0]?.text?.slice(0, 1500), structuredContent: r.structuredContent });
  check(`${name} ${expectError ? "returns isError" : "succeeds"} (${ms} ms)`, expectError ? r.isError : !r.isError, r.isError ? text.slice(0, 200) : "");
  return r.structuredContent ?? {};
}

// Rosters and triage
const triage = await run("triage_today", { limit: 10 });
check("triage counts all 4 modules", ["c1", "c3", "c4", "c5"].every((m) => triage.statusCounts?.[m]), JSON.stringify(triage.statusCounts));
check("triage lists urgent C3 first", triage.rows?.[0]?.urgent === true && triage.rows[0].module === "c3", triage.rows?.[0]?.survivorId);
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
await run("get_survivor", { survivorId: "x9-123" }, true);

const ov = await run("patient_overview", { survivorId: ids.c3 });
check("patient_overview says ids do not join", ov.idsJoin === false && ov.modules?.c3?.enrolled === true && ["c1", "c4", "c5"].every((m) => ov.modules?.[m]?.enrolled === false), JSON.stringify(ov.modules));

for (const m of ["c1", "c3", "c4"]) {
  const d = await run("module_metrics", { module: m });
  if (m === "c3") check("module_metrics c3 has model and baseline", d.model?.weeks?.auc && d.scheduleBaseline?.weeks?.auc, `${d.model?.weeks?.auc} vs ${d.scheduleBaseline?.weeks?.auc}`);
  check(`module_metrics ${m} is compact`, JSON.stringify(d).length < 12_000, `${JSON.stringify(d).length} chars`);
}
const adv = await run("glucose_advice", { survivorId: ids.c4 });
check("glucose_advice returns advice items", Array.isArray(adv.items) && adv.items.length > 0 && adv.items.every((i) => i.text), adv.items?.map((i) => i.source).join(","));
const demo = await run("reveal_outcome_demo", { survivorId: ids.c3 });
check("reveal_outcome_demo returns the outcome", demo.outcome && "roughPatchStartsInDays" in demo.outcome);

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

await client.close();
const failed = checks.filter((c) => !c.pass);
const stamp = started.toISOString().replace(/[:.]/g, "-");
mkdirSync("runs", { recursive: true });
const report = { url: URL_, startedAt: started.toISOString(), seconds: (Date.now() - started) / 1000, server: info, tools: tools.map((t) => ({ name: t.name, annotations: t.annotations, inputs: Object.keys(t.inputSchema?.properties ?? {}) })), passed: checks.length - failed.length, failed: failed.length, checks, calls };
writeFileSync(`runs/${stamp}.json`, JSON.stringify(report, null, 2));
const md = [`# challenge-mcp E2E ${started.toISOString()}`, "", `Server: ${URL_} (${info?.name} ${info?.version}). ${report.passed}/${checks.length} checks passed in ${report.seconds.toFixed(1)} s.`, `Full run: runs/${stamp}.json`, "", "| | Check | Detail |", "|---|---|---|", ...checks.map((c) => `| ${c.pass ? "PASS" : "FAIL"} | ${c.name} | ${String(c.detail).replace(/\|/g, "/").slice(0, 160)} |`), "", "## Tool summaries (first text block of each call)", "", ...calls.map((c) => `### ${c.name} ${JSON.stringify(c.args).slice(0, 120)}\n\n\`\`\`\n${c.summary}\n\`\`\``)].join("\n");
writeFileSync("runs/latest.md", md);
console.log(`\n${report.passed}/${checks.length} passed -> runs/${stamp}.json, runs/latest.md`);
process.exit(failed.length ? 1 : 0);
