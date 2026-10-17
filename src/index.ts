/**
 * Challenge MCP: one remote MCP server over the Emerge Hackathon challenge APIs, for ChatGPT and Claude.
 *   POST /mcp   Streamable HTTP, stateless (a new server per request, JSON responses). No SSE: it needs session state.
 *   GET  /      what this is and how to connect.
 * Authless: every module API is already public and the data is synthetic (C1 is real MEPS survey data, de-identified).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { cue, cueMoments, FLAG_MEANING, MAX_LINES, parseTranscript, score, tagLines, triggerAt, type Line } from "./coach";
import { ApiError, consoleUrl, get, getAdvice, getC5Agreement, isRecord, metrics, withFault, type Stats, MODULE_INFO, MODULES, moduleOf, roster, statusCounts, survivor, type Env, type Module, type Row } from "./modules";

const VERSION = "0.4.1";
const READ = { readOnlyHint: true, openWorldHint: false } as const;
/** Calls a live model; reads only, but the answer can vary. */
const MODEL = { readOnlyHint: true, openWorldHint: true, idempotentHint: false } as const;
const RANK: Record<string, number> = { alert: 0, watch: 1, ok: 2 };

const IDS_DO_NOT_JOIN =
  "The modules use separate cohorts: C1 ids are c1-S…, C3 c3-P0…(5 digits), C4 c4-N…, C5 c5-P0…(4 digits). No id appears in two modules, so one person has data in one module only.";

type Result = { content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };

/** Short summary for the reader, then compact JSON for the model; the same object as structuredContent. */
function ok(summary: string, data: Record<string, unknown>): Result {
  return { content: [{ type: "text", text: summary }, { type: "text", text: JSON.stringify(data) }], structuredContent: data };
}

function wrap<A>(fn: (args: A) => Promise<Result>) {
  return async (args: A): Promise<Result> => {
    try {
      return await fn(args);
    } catch (e) {
      const msg = e instanceof ApiError ? (e.status === 404 ? `Not found. ${e.message}` : e.message) : e instanceof Error ? e.message : String(e);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  };
}

const moduleArg = z.enum(MODULES).describe("c1 = acute-care (ER/hospital) risk next year; c3 = wearable rough-patch and urgent ER risk next 7 days; c4 = CGM glucose, meals and walking; c5 = coaching calls");
const statusArg = z.enum(["alert", "watch", "ok"]);
const lineArg = z.object({
  speaker: z.enum(["coach", "participant"]),
  text: z.string().min(1).max(1000),
  tag: z.string().optional().describe("MI tag from score_conversation, if known"),
  flag: z.string().optional().describe("flag from score_conversation, if known"),
});
const transcriptArg = z.union([z.array(lineArg), z.string()]).describe(`The call, oldest line first, at most ${MAX_LINES} lines. Either [{speaker, text}] or plain text with one "coach: …" / "participant: …" per line.`);

const LLM_PER_MINUTE = 20, KEY_PER_MINUTE = 60;
type Caller = { kind: "anonymous"; ip: string } | { kind: "key"; name: string };
/** Limit on the tools that call a live model: per API key with a bearer key, else per client IP. */
async function limitModelCalls(env: Env, caller: Caller, tool: string) {
  const limiter = caller.kind === "key" ? env.KEY_LIMIT : env.LLM_LIMIT;
  if (!limiter) return;
  const { success } = await limiter.limit({ key: caller.kind === "key" ? `key:${caller.name}` : caller.ip });
  if (!success) throw new ApiError(429, `Rate limit: ${tool} calls a live model. ${caller.kind === "key" ? `Key "${caller.name}" may make ${KEY_PER_MINUTE}` : `Each anonymous client IP may make ${LLM_PER_MINUTE}`} such calls per minute (score_conversation, coaching_cue and glucose_advice together). Wait a minute and try again.`);
}

/** Timing and model-call counts for a model-backed tool, so callers can see latency, retries and cost drivers. */
const timing = (t0: number, st: Stats | undefined, extra: Record<string, unknown> = {}) => ({ ms: Date.now() - t0, modelCalls: st?.modelCalls ?? 0, retries: st?.retries ?? 0, failedCalls: st?.failures ?? 0, ...extra });

/** Rule-based cues for when the cue model is down: the Co-pilot's triggers, with a safe default move. */
function fallbackCue(trigger: string) {
  const t = trigger.toLowerCase();
  if (/concern|medical|distress|social/.test(t)) return { cue: "Pause the plan. Reflect what the participant just said, ask one open question about it, and offer to connect them with the care team today.", say: "Before we go on, I want to come back to what you just said. Can you tell me more about how you are feeling?" };
  if (/medical advice/.test(t)) return { cue: "Walk the advice back and refer to the care team; coaches do not give medical advice.", say: "I should not have said that; that is a question for your care team. Can I help you reach them?" };
  if (/leaving|dropout/.test(t)) return { cue: "Explore the reasons without pressure; emphasize that the choice is theirs.", say: "It sounds like you are thinking about stepping back. What is making the program hard right now?" };
  if (/change talk/.test(t)) return { cue: "Reflect the change talk back before moving on.", say: "So you want to get your energy back, and you already have a plan for it." };
  if (/confront|permission/.test(t)) return { cue: "Ask permission and emphasize autonomy instead of telling.", say: "Would it be OK if I shared an idea? You know your week best, so tell me what fits." };
  return { cue: "Offer a complex reflection, then one open question.", say: "It sounds like part of you wants this and part of you is worn out. What would make this week a little easier?" };
}

const TRIAGE_DEFAULT = 10, TRIAGE_MAX = 25;
/** What a cohort's alert means. The four are different outcomes, horizons and scales, so no row's risk compares with another cohort's. */
const COHORT_SCALE: Record<Module, { horizon: string; scale: string }> = {
  c1: { horizon: "next 12 months", scale: "calibrated probability of any ER visit or hospital stay (MEPS survey model)" },
  c3: { horizon: "next 7 days", scale: "probability of a rough patch from wearables; urgent = ER or hospital risk in the next 7 days" },
  c4: { horizon: "recent CGM days", scale: "blood-sugar status from CGM rules (mg/dL), not a probability" },
  c5: { horizon: "latest coaching call", scale: "call flags a person must act on, and the coach's MI score; not a probability" },
};
const NOT_COMPARABLE = "Risks are not comparable across cohorts: each cohort measures a different outcome over a different horizon on a different scale (see horizon and scale on each row). The order between cohorts is round-robin after C3 urgent, not a ranking by risk.";
const COHORTS_NOT_JOINED = "Each row is labelled with its cohort. The four cohorts are separate groups of people and are not joined: the same person never appears in two of them.";

const rowLine = (r: Row) => `- ${r.survivorId} [${r.status}${r.urgent ? ", URGENT" : ""}] ${r.displayName}: ${r.headline}`;

/** `demo` adds reveal_outcome_demo; only the /mcp?tools=demo endpoint sets it, so the default tools/list never shows it. */
function buildServer(env: Env, demo = false, caller: Caller = { kind: "anonymous", ip: "unknown" }) {
  const server = new McpServer(
    { name: "emerge-challenge-mcp", title: "Emerge Hackathon challenge APIs", version: VERSION },
    { instructions: `Care-team tools over the Emerge Hackathon modules (Sylvester cancer-survivor track). ${IDS_DO_NOT_JOIN} Status everywhere is alert > watch > ok. Coaches do not diagnose: route medical items to the care team. Start with triage_today or list_survivors, then get_survivor. Use score_conversation for a coaching transcript and coaching_cue for what to say next.` },
  );

  server.registerTool("triage_today", {
    title: "Who needs attention today (all modules)",
    description: "Short ranked worklist across C1, C3, C4 and C5 (default 10, at most 25): C3 urgent ER/hospital risk first, then the top alert from each cohort in turn, so no one cohort fills the list. Each row names its cohort, its own reason, and the horizon and scale of that cohort's risk; risks are not comparable across cohorts, and the order between cohorts is round-robin, not by risk. The four cohorts are separate groups of people and are not joined. Use for 'who should the care team call today?'.",
    inputSchema: {
      modules: z.array(moduleArg).optional().describe("Limit to these cohorts; default all four"),
      includeWatch: z.boolean().optional().describe("Also rank 'watch' survivors after the alerts (default false)"),
      limit: z.number().int().min(1).max(TRIAGE_MAX).optional().describe(`Rows to return (default ${TRIAGE_DEFAULT}, max ${TRIAGE_MAX})`),
    },
    annotations: { title: "Triage today", ...READ },
  }, wrap(async ({ modules, includeWatch, limit }) => {
    const ms = modules?.length ? modules : [...MODULES];
    const got = await Promise.allSettled(ms.map((m) => roster(env, m)));
    const counts: Record<string, Record<string, number>> = {};
    const queues = new Map<Module, Row[]>();
    const down: string[] = [];
    got.forEach((g, i) => {
      if (g.status === "rejected") { down.push(`${ms[i]}: ${g.reason instanceof Error ? g.reason.message : g.reason}`); return; }
      counts[ms[i]] = statusCounts(g.value);
      // Rosters arrive ranked by each module (urgent, then status, then risk); keep that order inside a cohort.
      queues.set(ms[i], g.value.filter((r) => r.status === "alert" || (includeWatch && r.status === "watch")));
    });
    const take = (m: Module, r: Row) => { const q = queues.get(m)!; q.splice(q.indexOf(r), 1); return { module: m, r }; };
    const picked: { module: Module; r: Row }[] = [];
    for (const [m, q] of queues) for (const r of q.filter((x) => x.urgent)) picked.push(take(m, r));
    // Then round-robin across cohorts: alerts before watch, best-ranked first in each cohort.
    for (const status of ["alert", "watch"]) {
      for (let more = true; more;) {
        more = false;
        for (const [m, q] of queues) {
          const r = q.find((x) => x.status === status);
          if (r) { picked.push(take(m, r)); more = true; }
        }
      }
    }
    const cap = limit ?? TRIAGE_DEFAULT;
    const rows = picked.slice(0, cap).map(({ module, r }, i) => ({
      rank: i + 1, cohort: module, cohortName: MODULE_INFO[module].name, survivorId: r.survivorId, displayName: r.displayName,
      status: r.status, ...(r.urgent ? { urgent: true } : {}),
      reason: `${MODULE_INFO[module].name}: ${r.headline}`,
      horizon: COHORT_SCALE[module].horizon, scale: COHORT_SCALE[module].scale,
    }));
    const urgent = picked.filter((x) => x.r.urgent).length;
    const perCohort = Object.fromEntries(ms.filter((m) => counts[m]).map((m) => [m, { cohort: MODULE_INFO[m].name, people: MODULE_INFO[m].about, statusCounts: counts[m], shown: rows.filter((r) => r.cohort === m).length }]));
    const summary = [
      `Top ${rows.length} of ${picked.length} survivors needing attention (${urgent} urgent). ${COHORTS_NOT_JOINED} ${NOT_COMPARABLE}`,
      ...rows.map((r) => `${r.rank}. ${r.survivorId} [${r.status}${r.urgent ? ", URGENT" : ""}] ${r.reason} (${r.horizon})`),
      `Per cohort: ${Object.entries(perCohort).map(([m, c]) => `${m} ${JSON.stringify(c.statusCounts)}`).join("; ")}.`,
      ...(picked.length > rows.length ? [`${picked.length - rows.length} more not shown; use list_survivors per module.`] : []),
      ...(down.length ? [`Unavailable: ${down.join("; ")}`] : []),
    ].join("\n");
    return ok(summary, { shown: rows.length, needingAttention: picked.length, urgent, cohortsJoined: false, comparableAcrossCohorts: false, note: `${COHORTS_NOT_JOINED} ${NOT_COMPARABLE}`, rows, perCohort, unavailable: down });
  }));

  server.registerTool("list_survivors", {
    title: "List or search survivors in one module",
    description: "Roster for one module, sorted alert > watch > ok (C3: urgent first). Filter by status, urgent (C3 only), or free text over name, cancer type and headline (e.g. 'breast', 'sleep', 'night shift').",
    inputSchema: {
      module: moduleArg,
      status: statusArg.optional(),
      urgentOnly: z.boolean().optional().describe("C3 only: just survivors with urgent ER/hospital risk in the next 7 days"),
      query: z.string().optional().describe("Case-insensitive words; every word must match id, display name, headline or tags"),
      limit: z.number().int().min(1).max(200).optional().describe("Max rows (default 25)"),
    },
    annotations: { title: "List survivors", ...READ },
  }, wrap(async ({ module, status, urgentOnly, query, limit }) => {
    const all = await roster(env, module);
    const words = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const rows = all.filter((r) => (!status || r.status === status) && (!urgentOnly || r.urgent)
      && words.every((w) => [r.survivorId, r.displayName, r.headline, ...(r.tags ?? [])].join(" ").toLowerCase().includes(w)));
    const shown = rows.slice(0, limit ?? 25);
    const summary = [`${MODULE_INFO[module].name}: ${rows.length} of ${all.length} survivors match (${JSON.stringify(statusCounts(all))} overall).`, ...shown.map(rowLine)].join("\n");
    return ok(summary, { module, moduleName: MODULE_INFO[module].name, about: MODULE_INFO[module].about, matched: rows.length, total: all.length, statusCounts: statusCounts(all), rows: shown });
  }));

  server.registerTool("get_survivor", {
    title: "One survivor's panel",
    description: "Everything one module says about one survivor: status, headline, summary, the evidence behind it and recommended actions (with audience or urgency). The module comes from the id prefix (c1-, c3-, c4-, c5-). C3 never includes the hidden outcome here.",
    inputSchema: {
      survivorId: z.string().describe("e.g. c1-S2480BBDE, c3-P02185, c4-N0632, c5-P0117"),
      includeCharts: z.boolean().optional().describe("Add chart series (C3: last 14 days of wearable data). Default false; large."),
    },
    annotations: { title: "Get survivor", ...READ },
  }, wrap(async ({ survivorId, includeCharts }) => {
    const v = await survivor(env, survivorId, includeCharts);
    const recs = Array.isArray(v.recommendations) ? v.recommendations.filter(isRecord) : [];
    const recText = recs.slice(0, 4).map((r) => `- ${r.audience ? `[${r.audience}] ` : r.urgency ? `[${r.urgency}] ` : ""}${r.text ?? r.action ?? r.title}`);
    const summary = [`${v.moduleName} · ${v.displayName} · ${String(v.status).toUpperCase()}${(v as { urgent?: boolean }).urgent ? " · URGENT" : ""}`, String(v.headline), String(v.summary ?? ""), ...(recText.length ? ["Next steps:", ...recText] : [])].filter(Boolean).join("\n");
    return ok(summary, v);
  }));

  server.registerTool("patient_overview", {
    title: "Patient overview across modules",
    description: `One survivor across every module that knows them, with their rank in each roster. ${IDS_DO_NOT_JOIN} So today this returns the one module's view plus a check of the others; it does not guess matches by age, sex or cancer type.`,
    inputSchema: { survivorId: z.string().describe("Any module's id, e.g. c3-P02185") },
    annotations: { title: "Patient overview", ...READ },
  }, wrap(async ({ survivorId }) => {
    const home = moduleOf(survivorId);
    const key = survivorId.slice(survivorId.indexOf("-") + 1);
    const view = await survivor(env, survivorId);
    const modules: Record<string, unknown> = {};
    await Promise.all(MODULES.map(async (m) => {
      try {
        const rows = await roster(env, m);
        const i = rows.findIndex((r) => r.survivorId === `${m}-${key}`);
        modules[m] = i < 0 ? { enrolled: false } : { enrolled: true, survivorId: rows[i].survivorId, status: rows[i].status, headline: rows[i].headline, rank: `${i + 1} of ${rows.length}` };
      } catch (e) {
        modules[m] = { enrolled: null, error: e instanceof Error ? e.message : String(e) };
      }
    }));
    const enrolled = MODULES.filter((m) => isRecord(modules[m]) && (modules[m] as { enrolled: boolean }).enrolled);
    const summary = `${view.displayName}: ${String(view.status).toUpperCase()} in ${MODULE_INFO[home].name} (${(modules[home] as { rank?: string }).rank ?? "?"}). ${view.headline}\nFound in: ${enrolled.join(", ")}. Not found in: ${MODULES.filter((m) => !enrolled.includes(m)).join(", ") || "none"}. ${IDS_DO_NOT_JOIN}`;
    return ok(summary, { survivorId, modules, home: view, idsJoin: false, note: IDS_DO_NOT_JOIN });
  }));

  server.registerTool("module_metrics", {
    title: "Model card / cohort findings",
    description: "How well a module's model works and what the cohort shows. Every module also returns subgroups. c1: AUROC, calibration and risk tiers vs a baseline. c3: held-out rough-patch and ER recall, lead time and alert precision vs a schedule-only baseline. c4: within-person effects of walking, late dinners, carbs and fasting on post-meal sugar, plus the randomized trial contrasts. c5: the coach score vs two supervisors and flag recall on 477 held-out supervisor-rated calls (the C5 module's own validation).",
    inputSchema: { module: z.enum(["c1", "c3", "c4", "c5"]) },
    annotations: { title: "Module metrics", ...READ },
  }, wrap(async ({ module }) => {
    if (module === "c5") return c5Metrics(env);
    const d = await metrics(env, module);
    let summary = `${MODULE_INFO[module].name} metrics.`;
    if (module === "c1") {
      type Gain = { value: number; ci95: number[]; p_better?: number };
      type Nested = { auroc: { model: number; baseline: number; gain: number; ci95: number[]; pBetter: number }; logLoss: { gain: number; ci95: number[]; pBetter: number } };
      const c = d as unknown as { finalModel: { key: string; name: string }; metrics: Record<string, Record<string, { value: number; ci95: number[] }>>; gainOverBaseline: Record<string, Gain> | null; headlineGain: Nested | null };
      const f = (x: number) => x.toFixed(3), band = (x: number[]) => `${f(x[0])} to ${f(x[1])}`, sig = (x: number[]) => (x[0] > 0 || x[1] < 0 ? "significant" : "not significant: the CI crosses 0");
      const m = c.metrics[c.finalModel.key], b = c.metrics.baseline, g = c.gainOverBaseline, n = c.headlineGain;
      summary = [
        `C1 live model: ${c.finalModel.name.split(",")[0].split(" on ")[0]} (${c.finalModel.key}).`,
        ...(n ? [`Honest estimate (nested CV, the model search re-run inside each outer fold): AUROC ${f(n.auroc.model)} vs baseline ${f(n.auroc.baseline)}, gain +${f(n.auroc.gain)} (95% CI ${band(n.auroc.ci95)}, ${sig(n.auroc.ci95)}); this is the "nested CV +0.04" in the caveats. Log loss ${f(n.logLoss.gain)} (95% CI ${band(n.logLoss.ci95)}, ${sig(n.logLoss.ci95)}).`] : []),
        `Out-of-fold for the chosen ${c.finalModel.key} (optimistic, because the search saw these folds): AUROC ${f(m.auroc.value)} (95% CI ${band(m.auroc.ci95)}) vs baseline ${f(b.auroc.value)}${g?.auroc ? `, gain +${f(g.auroc.value)} (95% CI ${band(g.auroc.ci95)})` : ""}. The two baselines differ (${f(b.auroc.value)} vs ${n ? f(n.auroc.baseline) : "?"}) because they come from different CV runs.`,
        `Held-out status mix ${JSON.stringify(d.heldoutStatusMix)}.`,
      ].join(" ");
    } else if (module === "c3") {
      const m = d as { model: { weeks?: { auc?: number }; episodes?: Record<string, number> }; scheduleBaseline: { weeks?: { auc?: number }; episodes?: Record<string, number> } };
      summary = `C3 Radar on held-out patients: week AUC ${m.model.weeks?.auc} vs schedule-only ${m.scheduleBaseline.weeks?.auc}; rough-patch episode recall ${m.model.episodes?.episode_recall} vs ${m.scheduleBaseline.episodes?.episode_recall}; ER/admission recall ${m.model.episodes?.er_recall} vs ${m.scheduleBaseline.episodes?.er_recall}; median lead ${m.model.episodes?.median_lead_days} days.`;
    } else {
      const e = (d as { effects: Record<string, { est: number; lo: number; hi: number }> }).effects;
      summary = `C4 cohort (within-person, mg/dL change in post-meal rise): walk after a meal ${e.walk?.est} [${e.walk?.lo}, ${e.walk?.hi}]; late dinner +${e.lateDinner?.est} [${e.lateDinner?.lo}, ${e.lateDinner?.hi}]; per 10 g carbs +${e.carbsPer10g?.est}.`;
    }
    const sg = (d as { subgroups?: { summary?: unknown; note?: unknown } | null }).subgroups;
    if (sg) summary += `\nSubgroups: ${sg.summary ?? sg.note ?? "see subgroups.rows"}`;
    return ok(summary, d);
  }));

  server.registerTool("glucose_advice", {
    title: "Plain-language glucose advice (C4)",
    description: "C4 only: the survivor's meal, meal-timing and walking advice rewritten in plain language by a model, checked against the evidence (falls back to the template text when a rewrite adds numbers or causal claims). Takes 3-8 s.",
    inputSchema: { survivorId: z.string().regex(/^c4-/i, "C4 ids start with c4-").describe("e.g. c4-N0632") },
    annotations: { title: "Glucose advice", ...MODEL },
  }, wrap(async ({ survivorId }) => {
    const t0 = Date.now();
    // Cache key: survivor + the roster row (status, headline, updatedAt), so new C4 data gets new advice.
    const row = (await roster(env, "c4")).find((r) => r.survivorId.toLowerCase() === survivorId.toLowerCase());
    if (!row) throw new ApiError(404, `Not found: ${survivorId} is not in the C4 roster`);
    const version = [row.status, row.headline, row.updatedAt ?? ""].join("|");
    const key = new Request(`https://advice-cache.challenge-mcp/${encodeURIComponent(row.survivorId)}?v=${encodeURIComponent(version)}`);
    const cache = env.NO_CACHE ? undefined : (globalThis as unknown as { caches?: { default: Cache } }).caches?.default;
    const hit = cache ? await cache.match(key) : undefined;
    if (hit) {
      const data = (await hit.json()) as Record<string, unknown>;
      data.timing = timing(t0, env.STATS, { cached: true });
      return ok(`${data.summaryText}\n(cached; ${data.timing && (data.timing as { ms: number }).ms} ms)`, data);
    }
    await limitModelCalls(env, caller, "glucose_advice");
    let items: Record<string, unknown>[] = [], model: unknown = null, degraded: string | null = null, upstreamCached = false;
    try {
      const d = await getAdvice(env, row.survivorId);
      // Live shape: items[] with a per-item source ("ai" or "template" when the rewrite was rejected).
      items = isRecord(d) && Array.isArray(d.items) ? d.items.filter(isRecord).map((r) => ({ title: r.title, text: r.text, source: r.source, ...(r.rejected ? { rejected: r.rejected } : {}) })) : [];
      model = isRecord(d) ? d.model : null;
      upstreamCached = isRecord(d) && d.cached === true;
      if (!items.length) throw new ApiError(502, "advice model returned no items");
    } catch (e) {
      // Template fallback: C4's own rule-based recommendations, no model involved.
      degraded = e instanceof Error ? e.message : String(e);
      const v = await survivor(env, row.survivorId, false);
      items = (Array.isArray(v.recommendations) ? v.recommendations : []).filter(isRecord).map((r) => ({ title: r.title, text: r.text, source: "template-fallback" }));
    }
    const summaryText = [`Plain-language advice for ${row.survivorId}${degraded ? " (MODEL UNAVAILABLE, showing C4's template advice)" : ""}:`, ...items.map((r) => `- ${r.title}: ${r.text}${r.source !== "ai" ? ` (${r.source})` : ""}`)].join("\n");
    const data: Record<string, unknown> = { survivorId: row.survivorId, model, items, degraded: !!degraded, ...(degraded ? { degradedReason: degraded } : {}), summaryText, timing: timing(t0, env.STATS, { cached: false, upstreamCached }) };
    if (cache && !degraded) await cache.put(key, new Response(JSON.stringify(data), { headers: { "content-type": "application/json", "cache-control": "max-age=21600" } }));
    return ok(summaryText, data);
  }));

  if (demo) server.registerTool("reveal_outcome_demo", {
    title: "DEMO ONLY: what really happened next (C3)",
    description: "C3 demo only, never for a coach-facing answer: the hidden outcome in the 14 days after the forecast (did a rough patch or ER visit/admission happen, and when). Use only when the user explicitly asks to check the forecast against what happened.",
    inputSchema: { survivorId: z.string().regex(/^c3-/i, "C3 ids start with c3-") },
    annotations: { title: "Reveal outcome (demo)", ...READ },
  }, wrap(async ({ survivorId }) => {
    const d = await get(env, "c3", `/survivors/${encodeURIComponent(survivorId)}?demo=1`);
    const demo = isRecord(d) && isRecord(d.demo) ? d.demo : {};
    const forecast = isRecord(d) ? { status: d.status, urgent: d.urgent, risk: d.risk, urgentRisk: d.urgentRisk, headline: d.headline } : {};
    const summary = `DEMO ONLY (hidden from coaches). Forecast for ${survivorId}: ${forecast.status}${forecast.urgent ? ", urgent" : ""}, rough-patch risk ${forecast.risk}. What happened: rough patch ${demo.roughPatchStartsInDays == null ? "did not start in 14 days" : `started in ${demo.roughPatchStartsInDays} days`}; ER/admission ${demo.erOrAdmissionInDays == null ? "none in 14 days" : `in ${demo.erOrAdmissionInDays} days`}.`;
    return ok(summary, { survivorId, forecast, outcome: demo });
  }));

  server.registerTool("list_coaching_calls", {
    title: "Coaching calls on file (C5)",
    description: "Supervisor-labelled coaching calls, worst first (flagged lines, then lowest coach score). Each has the MITI-style coach score and how many lines needed a person. Filter by participant (c5-…) or status.",
    inputSchema: {
      survivorId: z.string().regex(/^c5-/i).optional().describe("Only this participant's calls, e.g. c5-P0117"),
      status: statusArg.optional().describe("alert = a line needed a person; watch = score below 60"),
      limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 25)"),
    },
    annotations: { title: "List coaching calls", ...READ },
  }, wrap(async ({ survivorId, status, limit }) => {
    const all = await get(env, "c5", "/calls");
    if (!Array.isArray(all)) throw new ApiError(502, "c5 calls is not a list");
    const rows = all.filter(isRecord).filter((c) => (!survivorId || c.survivorId === survivorId) && (!status || c.status === status)).map((c) => ({
      callId: c.callId, survivorId: c.survivorId, participantName: c.participantName, coach: isRecord(c.coach) ? c.coach.name : c.coach,
      date: c.date, callNumber: c.callNumber, week: c.week, goalTopic: c.goalTopic, language: c.language, lines: c.lines,
      score: c.score, status: c.status, flaggedLines: Array.isArray(c.flags) ? c.flags.length : 0,
    }));
    const shown = rows.slice(0, limit ?? 25);
    const summary = [`${rows.length} calls match.`, ...shown.map((c) => `- ${c.callId} ${c.participantName} (${c.survivorId}) ${c.date}, coach ${c.coach}: score ${c.score ?? "–"}/100, ${c.flaggedLines} flagged line(s) [${c.status}]`)].join("\n");
    return ok(summary, { matched: rows.length, calls: shown });
  }));

  server.registerTool("get_coaching_call", {
    title: "One coaching call transcript (C5)",
    description: "A supervisor-labelled call: transcript with each line's supervisor label (coach move / participant talk, needs-a-person), the coach score and its parts, and flagged lines. Pass its callId to score_conversation to compare the live model with the supervisor.",
    inputSchema: { callId: z.string().describe("e.g. CALL00646"), includeLines: z.boolean().optional().describe("Include the transcript (default true)") },
    annotations: { title: "Get coaching call", ...READ },
  }, wrap(async ({ callId, includeLines }) => {
    const d = await get(env, "c5", `/calls/${encodeURIComponent(callId)}`);
    if (!isRecord(d)) throw new ApiError(502, "call is not an object");
    const lines = Array.isArray(d.lines) ? d.lines.filter(isRecord).map((l) => {
      const s = isRecord(l.supervisor) ? l.supervisor : {};
      return { n: l.n, t: l.t, speaker: l.speaker, text: l.text, label: s.move ?? s.talk ?? null, ...(s.needsHuman ? { needsHuman: true } : {}) };
    }) : [];
    const { lines: _, ...rest } = d;
    const flags = Array.isArray(d.flags) ? d.flags.filter(isRecord) : [];
    const summary = `${d.callId}: ${d.participantName} with coach ${isRecord(d.coach) ? d.coach.name : ""}, ${d.date}, ${d.language}, goal ${d.goalTopic}. Supervisor coach score ${d.score ?? "–"}/100. ${flags.length ? `Needs a person: ${flags.map((f) => `${f.t} "${f.text}"`).join("; ")}` : "No line needed a person."}`;
    return ok(summary, { ...rest, lineCount: lines.length, ...(includeLines === false ? {} : { lines }) });
  }));

  server.registerTool("score_conversation", {
    title: "Score a coaching conversation (C5 live model)",
    description: `Runs the live C5 Co-pilot over a coaching transcript: tags every line with a motivational-interviewing code (coach: open/closed question, simple/complex reflection, affirm, persuade, confront…; participant: change/sustain/neutral talk), raises flags a person must act on (medical, distress, social, dropout, missed_concern, medical_advice), computes the MITI-style coach score out of 100 (2 reflections per question 30 pts, 40% complex reflections 20, 50% open questions 20, MI-consistent vs persuade/confront 30; needs 4+ coach lines), and lists where the Co-pilot would raise a coaching cue. Give a transcript (max ${MAX_LINES} lines) or a callId from list_coaching_calls (then the result also compares with the supervisor's labels). About 1 s per line.`,
    inputSchema: {
      transcript: transcriptArg.optional(),
      callId: z.string().optional().describe("Score a stored call instead of a transcript, e.g. CALL00646 (first 40 lines)"),
    },
    annotations: { title: "Score conversation", ...MODEL },
  }, wrap(async ({ transcript, callId }) => {
    await limitModelCalls(env, caller, "score_conversation");
    const t0 = Date.now();
    let lines: Line[];
    let supervisor: { label: string | null; needsHuman: boolean }[] | null = null;
    let supervisorScore: unknown = null;
    if (callId) {
      const d = await get(env, "c5", `/calls/${encodeURIComponent(callId)}`);
      const raw = isRecord(d) && Array.isArray(d.lines) ? d.lines.filter(isRecord).slice(0, MAX_LINES) : [];
      lines = parseTranscript(raw.map((l) => ({ speaker: l.speaker, text: l.text })));
      supervisor = raw.map((l) => { const s = isRecord(l.supervisor) ? l.supervisor : {}; return { label: (s.move ?? s.talk ?? null) as string | null, needsHuman: s.needsHuman === true }; });
      supervisorScore = isRecord(d) ? d.score : null;
    } else if (transcript !== undefined) {
      lines = parseTranscript(transcript);
    } else throw new ApiError(400, "give a transcript or a callId");

    const tagged = await tagLines(env, lines);
    const s = score(tagged);
    const flags = tagged.filter((l) => l.flag && l.flag !== "none").map((l) => ({ line: l.n, speaker: l.speaker, flag: l.flag as string, meaning: FLAG_MEANING[l.flag as string] ?? "", text: l.text }));
    const cues = cueMoments(tagged);
    const failed = tagged.filter((l) => l.error).length;
    // Tagging has no honest template fallback: if the model failed on most lines, say so instead of scoring.
    if (failed > tagged.length / 2) throw new ApiError(503, `The C5 tagging model failed on ${failed} of ${tagged.length} lines (after a retry each): ${tagged.find((l) => l.error)?.error}. No score was computed; try again later.`);
    let comparison: Record<string, unknown> | undefined;
    if (supervisor) {
      const both = tagged.map((l, i) => ({ l, s: supervisor![i] })).filter((x) => x.l.tag && x.s?.label);
      const agree = (sp: string) => { const xs = both.filter((x) => x.l.speaker === sp); return xs.length ? +(xs.filter((x) => x.l.tag === x.s.label).length / xs.length).toFixed(2) : null; };
      comparison = {
        supervisorScoreFullCall: supervisorScore,
        supervisorScoreSameLines: score(lines.map((l, i) => ({ ...l, tag: supervisor![i]?.label ?? null }))).score,
        coachMoveAgreement: agree("coach"), participantTalkAgreement: agree("participant"),
        supervisorNeedsHumanLines: supervisor.map((x, i) => (x.needsHuman ? i + 1 : 0)).filter(Boolean),
      };
    }
    const summary = [
      `Coach score ${s.score ?? "n/a (needs 4+ tagged coach lines)"}${s.score != null ? "/100" : ""} over ${tagged.length} lines${callId ? ` of ${callId}` : ""}.`,
      `Questions ${s.counts.openQuestions} open / ${s.counts.closedQuestions} closed; reflections ${s.counts.simpleReflections} simple / ${s.counts.complexReflections} complex; ${s.counts.persuadeOrConfront} persuade/confront; change talk ${s.counts.changeTalk}, sustain talk ${s.counts.sustainTalk}.`,
      flags.length ? `FLAGS: ${flags.map((f) => `line ${f.line} ${f.flag} (${f.meaning})`).join("; ")}` : "No flags.",
      cues.length ? `Cue moments: ${cues.map((c) => `after line ${c.afterLine}: ${c.trigger}`).join(" | ")}` : "No cue would fire.",
      ...(comparison ? [`Supervisor: score ${comparison.supervisorScoreSameLines} on the same lines; coach-move agreement ${comparison.coachMoveAgreement}, talk agreement ${comparison.participantTalkAgreement}.`] : []),
      ...(failed ? [`${failed} line(s) could not be tagged (model error); the score uses the rest.`] : []),
    ].join("\n");
    return ok(summary, {
      score: s.score, scoreParts: s.parts, counts: s.counts, flags, cueMoments: cues,
      lines: tagged.map(({ n, speaker, text, tag, flag, confidence, error }) => ({ n, speaker, text, tag, ...(flag && flag !== "none" ? { flag } : {}), confidence, ...(error ? { error } : {}) })),
      ...(comparison ? { comparison } : {}),
      degraded: failed > 0, timing: timing(t0, env.STATS),
    });
  }));

  server.registerTool("coaching_cue", {
    title: "What should the coach say next (C5)",
    description: "One short coaching cue plus an example line the coach could say, written by the C5 Co-pilot's model from the last lines of a call. Without a trigger, the Co-pilot's own rules pick one from the last line (flag, confront, persuading without permission, missed change talk, 4 questions without a reflection, 3 closed questions); if none applies it asks for the best next MI move. Pass lines with tag/flag from score_conversation to skip re-tagging. Takes 2-8 s.",
    inputSchema: {
      recent: transcriptArg.describe("The last lines of the call (up to 8 are used), oldest first; [{speaker, text, tag?, flag?}] or 'coach: …' text"),
      trigger: z.string().max(300).optional().describe("Why a cue is needed, in one sentence; leave empty to let the Co-pilot's rules decide"),
    },
    annotations: { title: "Coaching cue", ...MODEL },
  }, wrap(async ({ recent, trigger }) => {
    await limitModelCalls(env, caller, "coaching_cue");
    const t0 = Date.now();
    let lines = parseTranscript(recent).slice(-8);
    let source = "caller";
    if (!trigger) {
      if (!lines.every((l) => l.tag)) lines = await tagLines(env, lines);
      // Replay the Co-pilot's rules over the window and keep the trigger on the last line, if any.
      const state = { lastCueAt: -99 };
      const fired = lines.map((_, i) => triggerAt(lines, i, state));
      trigger = fired.at(-1) ?? undefined;
      source = trigger ? "copilot-rule" : "requested";
      trigger ??= "The coach asked for help with the next line. Suggest the best next motivational-interviewing move.";
    }
    let c: { cue: unknown; say: unknown; ms?: unknown; upstreamCached?: boolean }, degraded: string | null = null;
    try {
      c = await cue(env, lines, trigger);
    } catch (e) {
      degraded = e instanceof Error ? e.message : String(e);
      c = fallbackCue(trigger);
    }
    const summary = `Cue: ${c.cue ?? "(none returned)"}${c.say ? `\nSay: "${c.say}"` : ""}\nWhy: ${trigger}${degraded ? "\n(Cue model unavailable; this is the rule-based fallback cue.)" : ""}`;
    const { upstreamCached, ...answer } = c;
    return ok(summary, { ...answer, source: degraded ? "rule-fallback" : "model", degraded: !!degraded, ...(degraded ? { degradedReason: degraded } : {}), timing: timing(t0, env.STATS, { upstreamCached: !!upstreamCached }), trigger, triggerSource: source, lines: lines.map(({ speaker, text, tag, flag }) => ({ speaker, text, tag, ...(flag && flag !== "none" ? { flag } : {}) })) });
  }));

  // ChatGPT deep research and company-knowledge connectors look for exactly these two tools.
  server.registerTool("search", {
    title: "Search survivors (all modules)",
    description: "Search every module's roster by words in id, name, cancer type, status or headline. Returns ids for fetch.",
    inputSchema: { query: z.string().describe("e.g. 'urgent', 'breast alert', 'sleep', 'night shift'") },
    annotations: { title: "Search", ...READ },
  }, wrap(async ({ query }) => {
    const results = rankSearch(query, (await Promise.allSettled(MODULES.map((m) => roster(env, m)))).flatMap((g) => (g.status === "fulfilled" ? g.value : [])));
    return { content: [{ type: "text", text: JSON.stringify({ results }) }], structuredContent: { results } };
  }));

  server.registerTool("fetch", {
    title: "Fetch one survivor",
    description: "Full panel for an id returned by search (same as get_survivor).",
    inputSchema: { id: z.string().describe("A survivorId from search, e.g. c3-P02185") },
    annotations: { title: "Fetch", ...READ },
  }, wrap(async ({ id }) => {
    const v = await survivor(env, id);
    const doc = { id, title: `${v.moduleName}: ${v.displayName}`, text: `${v.headline}\n${v.summary ?? ""}\n\n${JSON.stringify(v)}`, url: consoleUrl(id), metadata: { module: v.module, status: String(v.status) } };
    return { content: [{ type: "text", text: JSON.stringify(doc) }], structuredContent: doc };
  }));

  return server;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, accept, authorization, mcp-session-id, mcp-protocol-version, last-event-id",
  "access-control-expose-headers": "mcp-session-id, mcp-protocol-version",
};

const withCors = (r: Response) => {
  const h = new Headers(r.headers);
  for (const [k, v] of Object.entries(CORS)) h.set(k, v);
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
};

/**
 * Search ranking: an exact id wins; then the whole query as a phrase in a tag (3) or the headline (2);
 * then every word somewhere (1). Ties go urgent first, then alert > watch > ok. Each hit says why it matched.
 */
export function rankSearch(query: string, rows: Row[]) {
  const q = query.toLowerCase().trim().replace(/\s+/g, " ");
  const words = q.split(" ").filter(Boolean);
  const scored = rows.map((r) => {
    const tags = (r.tags ?? []).map((t) => t.toLowerCase());
    const hay = [r.survivorId, r.displayName, r.status, r.urgent ? "urgent" : "", r.headline, ...tags].join(" ").toLowerCase();
    let score = 0, why = "";
    if (r.survivorId.toLowerCase() === q) { score = 10; why = "id"; }
    else if (tags.some((t) => t.includes(q))) { score = 3; why = `tag "${r.tags!.find((t) => t.toLowerCase().includes(q))}"`; }
    else if (r.headline.toLowerCase().includes(q)) { score = 2; why = "headline"; }
    else if (words.length && words.every((w) => hay.includes(w))) { score = 1; why = `all words (${words.join(", ")})`; }
    return { r, score, why };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score || Number(!!b.r.urgent) - Number(!!a.r.urgent) || RANK[a.r.status] - RANK[b.r.status]);
  return scored.slice(0, 20).map(({ r, why }) => ({
    id: r.survivorId,
    title: `${r.displayName} [${r.status}${r.urgent ? ", urgent" : ""}]: ${r.headline}${r.tags?.length ? ` · tags: ${r.tags.join(", ")}` : ""}`,
    url: consoleUrl(r.survivorId), matched: why,
  }));
}

/** C5's own validation, relayed: 477 held-out calls rated by two supervisors. */
async function c5Metrics(env: Env): Promise<Result> {
  const d = await getC5Agreement(env);
  if (!isRecord(d)) throw new ApiError(502, "C5 agreement is not an object");
  type Corr = { pair: string; n: number; pearson: number; pearsonCi95: number[] };
  const corr = (Array.isArray(d.correlations) ? d.correlations : []) as Corr[];
  const by = (p: string) => corr.find((c) => c.pair === p);
  const a = by("app score vs supervisor A"), b = by("app score vs supervisor B"), ab = by("supervisor A vs supervisor B");
  const fl = isRecord(d.flags) ? d.flags : {};
  const rate = (x: unknown) => (isRecord(x) ? x : {}) as { k?: number; n?: number; rate?: number; ci95?: number[] };
  const rec = rate(fl.recall), fa = rate(fl.falseAlarmsPerLine);
  const band = (x?: number[]) => (x ? `${x[0]} to ${x[1]}` : "?");
  type Lang = { caught?: { k: number; n: number; ci95?: number[] }; falseAlarmLines?: { k: number; n: number } };
  const byLang = Object.entries(isRecord(fl.byLanguage) ? (fl.byLanguage as Record<string, Lang>) : {});
  const data = {
    module: "c5", moduleName: MODULE_INFO.c5.name, about: d.about, method: d.method, calls: d.calls,
    headline: "Per supervisor, not against their mean: the app score tracks each supervisor about as well as the two supervisors track each other (overlapping CIs). That is parity with a second supervisor, not better.",
    correlations: corr.map((c) => ({ pair: c.pair, n: c.n, pearson: c.pearson, ci95: c.pearsonCi95 })),
    supervisorIcc: d.supervisorIcc, flags: d.flags,
    subgroups: { basis: "flag recall and false alarms per call language, from C5's validation split; C5 serves no per-language score agreement", rows: byLang.map(([group, v]) => ({ dimension: "Language", group, flagsCaught: v.caught, falseAlarmLines: v.falseAlarmLines })) },
    mcpLiveCheck: "This server's own live comparison (score_conversation on a stored call) is a pipeline check on one call, n = 1, not a validation.",
    source: "C5 Co-pilot /api/c5/agreement (scripts/score.py over Clef's tags on the validation split)",
  };
  const summary = `C5 coach score on ${d.calls} held-out supervisor-rated calls: Pearson r ${a?.pearson} (95% CI ${band(a?.pearsonCi95)}) vs supervisor A and ${b?.pearson} (${band(b?.pearsonCi95)}) vs supervisor B; the two supervisors agree at r ${ab?.pearson} (${band(ab?.pearsonCi95)}), so the app is on par with a second supervisor. Flag recall ${rec.k}/${rec.n} (95% CI ${band(rec.ci95)}); false alarms ${fa.k} in ${fa.n} lines.\nSubgroups: ${byLang.length ? byLang.map(([g, v]) => `${g} flags caught ${v.caught?.k}/${v.caught?.n}, false alarms ${v.falseAlarmLines?.k} in ${v.falseAlarmLines?.n} lines`).join("; ") + "." : "none served by C5."}`;
  return ok(summary, data);
}

const E2E_URL = "https://github.com/zaycruz/challenge-mcp/blob/main/runs/latest.md";

const HOME = (origin: string) => `Emerge Hackathon challenge MCP server v${VERSION}

MCP endpoint (Streamable HTTP, open; optional bearer key): ${origin}/mcp

Claude Code:   claude mcp add --transport http emerge-challenges ${origin}/mcp
claude.ai:     Settings > Connectors > Add custom connector > URL ${origin}/mcp
ChatGPT:       Settings > Apps & Connectors > Advanced > Developer mode on; then Create > MCP server URL ${origin}/mcp, Authentication: No authentication

Latest E2E run (every check and call): ${E2E_URL}   (also ${origin}/e2e)
Auth: open on purpose, so judges can connect. The data is synthetic or de-identified. Tools that call a live model: ${LLM_PER_MINUTE} calls per minute per IP without a key, ${KEY_PER_MINUTE} per minute per bearer key (Authorization: Bearer <key>).

Modules: ${MODULES.map((m) => `${m} ${MODULE_INFO[m].name}: ${MODULE_INFO[m].about}`).join("\n         ")}
`;

/** Optional bearer keys (secret MCP_KEYS = "name:key,..."). No header = anonymous, unless REQUIRE_KEY is "1". */
function authenticate(req: Request, env: Env): Caller | "invalid" | "required" {
  const h = req.headers.get("authorization");
  if (!h) return env.REQUIRE_KEY === "1" ? "required" : { kind: "anonymous", ip: req.headers.get("cf-connecting-ip") ?? "unknown" };
  const token = h.replace(/^Bearer\s+/i, "").trim();
  for (const pair of (env.MCP_KEYS ?? "").split(",")) {
    const i = pair.indexOf(":");
    if (i > 0 && pair.slice(i + 1).trim() && timingSafeEqual(pair.slice(i + 1).trim(), token)) return { kind: "key", name: pair.slice(0, i).trim() };
  }
  return "invalid";
}
function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === "/health") return Response.json({ ok: true, version: VERSION, e2e: E2E_URL });
    if (url.pathname === "/e2e") return Response.redirect(E2E_URL, 302);
    if (url.pathname === "/mcp" || url.pathname === "/mcp/") {
      if (req.method !== "POST") {
        // Stateless server: no standalone SSE stream and no sessions to delete.
        return withCors(Response.json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed: POST JSON-RPC to /mcp" }, id: null }, { status: 405, headers: { allow: "POST, OPTIONS" } }));
      }
      const caller = authenticate(req, env);
      if (caller === "invalid") return withCors(Response.json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized: unknown bearer key. Omit the Authorization header to use the open, IP-limited endpoint." }, id: null }, { status: 401, headers: { "www-authenticate": "Bearer" } }));
      if (caller === "required") return withCors(Response.json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized: this deployment requires a bearer key." }, id: null }, { status: 401, headers: { "www-authenticate": "Bearer" } }));
      const fault = url.searchParams.get("fault");
      const reqEnv: Env = { ...withFault(env, fault), STATS: { modelCalls: 0, retries: 0, failures: 0 }, ...(fault ? { NO_CACHE: true } : {}) };
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      const server = buildServer(reqEnv, url.searchParams.get("tools") === "demo", caller);
      await server.connect(transport);
      return withCors(await transport.handleRequest(req));
    }
    if (url.pathname === "/") return new Response(HOME(url.origin), { headers: { "content-type": "text/plain; charset=utf-8" } });
    return new Response("not found", { status: 404 });
  },
};
