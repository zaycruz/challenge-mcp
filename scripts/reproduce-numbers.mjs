// Regenerates every number this repo's README quotes, from the module APIs directly (not through this server),
// then diffs them against (1) the live MCP server's module_metrics and (2) the README text. Exits 1 on any mismatch.
// Usage: node scripts/reproduce-numbers.mjs [mcp-url]. Makes no model calls. Writes runs/numbers-<stamp>.md.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const MCP = process.argv[2] ?? "https://emerge-mcp.raava.dev/mcp";
const SRC = {
  c1: "https://c1-acute-risk.zay-259.workers.dev/api/c1/metrics",
  c3: "https://c3-rough-patch.zay-259.workers.dev/api/c3/metrics",
  c5: "https://coach.raava.dev/api/c5/agreement",
  call: (id) => `https://patient-360.raava.dev/api/c5/calls/${id}`,
};
const getJson = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return r.json(); };
const r3 = (x) => +x.toFixed(3);
const wilson = (k, n) => { const z = 1.96, p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return [+(c - h).toFixed(2), +(c + h).toFixed(2)]; };

const rows = [];
const same = (a, b) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 0.0015 : JSON.stringify(a) === JSON.stringify(b));
const row = (number, regenerated, live, readme) => rows.push({ number, regenerated, live, readme, ok: (live === undefined || same(regenerated, live)) && (readme === undefined || readme === true) });

const client = new Client({ name: "challenge-mcp-numbers", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(MCP)));
const mm = async (module) => (await client.callTool({ name: "module_metrics", arguments: { module } })).structuredContent;
const README = readFileSync("README.md", "utf8");
const inReadme = (s) => README.includes(s);

// C1: the nested-CV gain (the honest headline) and the out-of-fold gain for the chosen model.
const c1 = await getJson(SRC.c1), live1 = await mm("c1");
const v = c1.modelSearch.vsBaseline;
row("C1 nested-CV AUROC (model)", r3(c1.modelSearch.auroc.search), live1.headlineGain?.auroc?.model, inReadme(`AUROC ${r3(c1.modelSearch.auroc.search)}`));
row("C1 nested-CV AUROC (baseline)", r3(c1.modelSearch.auroc.baseline), live1.headlineGain?.auroc?.baseline, inReadme(`${r3(c1.modelSearch.auroc.baseline)}`));
row("C1 nested-CV gain", r3(v.dAuroc), live1.headlineGain?.auroc?.gain, inReadme(`+${r3(v.dAuroc)}`));
row("C1 nested-CV gain 95% CI", v.dAurocCi95.map(r3), live1.headlineGain?.auroc?.ci95, inReadme(`${r3(v.dAurocCi95[0])} to ${r3(v.dAurocCi95[1])}`));
const fk = c1.finalModel.key;
row(`C1 out-of-fold gain (${fk}, optimistic)`, r3(c1.deltaVsBaseline[fk].auroc.value), r3(live1.gainOverBaseline?.auroc?.value ?? NaN), inReadme(`+${r3(c1.deltaVsBaseline[fk].auroc.value)}`));
const weak = c1.fairness.filter((f) => f.flag !== "ok" && !f.tooSmall).map((f) => f.group);
row("C1 subgroups flagged weak", weak, live1.subgroups?.rows?.filter((r) => r.flag !== "ok" && !r.tooSmall).map((r) => r.group));

// C3: language rows of the fairness table.
const c3 = await getJson(SRC.c3), live3 = await mm("c3");
const lang = (c3.fairness.dimensions.find((d) => d.label === "Language")?.rows ?? []).map((r) => `${r.group} ${r.recall}`);
row("C3 recall by language", lang, live3.subgroups?.rows?.filter((r) => r.dimension === "Language").map((r) => `${r.group} ${r.recall}`));

// C5: the module's own validation on held-out supervisor-rated calls.
const c5 = await getJson(SRC.c5), live5 = await mm("c5");
const pc = (pair) => c5.correlations.find((c) => c.pair === pair);
for (const [label, pair] of [["C5 r vs supervisor A", "app score vs supervisor A"], ["C5 r vs supervisor B", "app score vs supervisor B"], ["C5 r supervisor A vs B (baseline)", "supervisor A vs supervisor B"]]) {
  const c = pc(pair), l = live5.correlations?.find((x) => x.pair === pair);
  row(label, c.pearson, l?.pearson, inReadme(`${c.pearson}`) && inReadme(`${c.pearsonCi95[0]} to ${c.pearsonCi95[1]}`));
}
row("C5 calls in the validation", c5.calls, live5.calls, inReadme(`${c5.calls}`));
const langs = Object.entries(c5.flags.byLanguage ?? {}).map(([g, v]) => `${g} ${v.caught.k}/${v.caught.n} caught, ${v.falseAlarmLines.k}/${v.falseAlarmLines.n} false-alarm lines`);
row("C5 flags by language", langs, live5.subgroups?.rows?.map((r) => `${r.group} ${r.flagsCaught?.k}/${r.flagsCaught?.n} caught, ${r.falseAlarmLines?.k}/${r.falseAlarmLines?.n} false-alarm lines`));
row("C5 flag recall", `${c5.flags.recall.k}/${c5.flags.recall.n}`, `${live5.flags?.recall?.k}/${live5.flags?.recall?.n}`, inReadme(`${c5.flags.recall.k} of ${c5.flags.recall.n}`));

// This server's own live check on one stored call (n = 1): recomputed from the committed E2E run's line tags.
const runFile = readdirSync("runs").filter((f) => /^\d{4}-.*\.json$/.test(f)).sort().at(-1);
const run = JSON.parse(readFileSync(`runs/${runFile}`, "utf8"));
const stored = run.calls.find((c) => c.name === "score_conversation" && c.args?.callId);
const sup = await getJson(SRC.call(stored.args.callId));
const agree = (speaker) => {
  const pairs = stored.structuredContent.lines.map((l, i) => ({ l, s: sup.lines[i]?.supervisor })).filter((x) => x.l.speaker === speaker && x.l.tag && (x.s?.move ?? x.s?.talk));
  const k = pairs.filter((x) => x.l.tag === (x.s.move ?? x.s.talk)).length, n = pairs.length;
  const counts = {}; for (const x of pairs) counts[x.s.move ?? x.s.talk] = (counts[x.s.move ?? x.s.talk] ?? 0) + 1;
  return { k, n, rate: +(k / n).toFixed(2), ci: wilson(k, n), majority: +(Math.max(...Object.values(counts)) / n).toFixed(2) };
};
for (const sp of ["coach", "participant"]) {
  const a = agree(sp);
  row(`n=1 check (${stored.args.callId}, ${runFile}): ${sp} agreement`, `${a.k}/${a.n} = ${a.rate}, CI ${a.ci.join("-")}, majority ${a.majority}`, undefined, inReadme(`${a.k} of ${a.n}`) && inReadme(`${a.ci[0]} to ${a.ci[1]}`) && inReadme(`${a.majority}`));
}
await client.close();

const bad = rows.filter((r) => !r.ok);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const fmt = (x) => (x === undefined ? "n/a" : x === true ? "yes" : x === false ? "**MISSING**" : JSON.stringify(x));
const md = [
  `# challenge-mcp numbers ${new Date().toISOString()}`, "",
  `Regenerated from the module APIs directly; compared with ${MCP} (module_metrics) and README.md. ${rows.length - bad.length}/${rows.length} match.`, "",
  "| | Number | Regenerated | Live MCP | In README |", "|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.ok ? "OK" : "DIFF"} | ${r.number} | ${fmt(r.regenerated)} | ${fmt(r.live)} | ${fmt(r.readme)} |`),
].join("\n");
mkdirSync("runs", { recursive: true });
writeFileSync(`runs/numbers-${stamp}.md`, md);
writeFileSync("runs/numbers-latest.md", md);
console.log(md);
process.exit(bad.length ? 1 : 0);
