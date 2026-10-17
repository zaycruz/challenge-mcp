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
import { ApiError, consoleUrl, get, isRecord, metrics, MODULE_INFO, MODULES, moduleOf, roster, statusCounts, survivor, type Env, type Module, type Row } from "./modules";

const VERSION = "0.1.0";
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

const rowLine = (r: Row) => `- ${r.survivorId} [${r.status}${r.urgent ? ", URGENT" : ""}] ${r.displayName}: ${r.headline}`;

function buildServer(env: Env) {
  const server = new McpServer(
    { name: "emerge-challenge-mcp", title: "Emerge Hackathon challenge APIs", version: VERSION },
    { instructions: `Care-team tools over the Emerge Hackathon modules (Sylvester cancer-survivor track). ${IDS_DO_NOT_JOIN} Status everywhere is alert > watch > ok. Coaches do not diagnose: route medical items to the care team. Start with triage_today or list_survivors, then get_survivor. Use score_conversation for a coaching transcript and coaching_cue for what to say next.` },
  );

  server.registerTool("triage_today", {
    title: "Who needs attention today (all modules)",
    description: "Cross-module worklist: every survivor on alert (C3 urgent ER/hospital risk first) across C1, C3, C4 and C5, plus the status mix per module. Use for 'who should the care team call today?'.",
    inputSchema: {
      modules: z.array(moduleArg).optional().describe("Limit to these modules; default all four"),
      includeWatch: z.boolean().optional().describe("Also list 'watch' survivors (default false)"),
      limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 25)"),
    },
    annotations: { title: "Triage today", ...READ },
  }, wrap(async ({ modules, includeWatch, limit }) => {
    const ms = modules?.length ? modules : [...MODULES];
    const got = await Promise.allSettled(ms.map((m) => roster(env, m)));
    const counts: Record<string, unknown> = {};
    const rows: (Row & { module: Module })[] = [];
    const down: string[] = [];
    got.forEach((g, i) => {
      if (g.status === "rejected") { down.push(`${ms[i]}: ${g.reason instanceof Error ? g.reason.message : g.reason}`); return; }
      counts[ms[i]] = statusCounts(g.value);
      rows.push(...g.value.filter((r) => r.status === "alert" || (includeWatch && r.status === "watch")).map((r) => ({ module: ms[i], ...r })));
    });
    rows.sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent) || RANK[a.status] - RANK[b.status] || MODULES.indexOf(a.module) - MODULES.indexOf(b.module));
    const shown = rows.slice(0, limit ?? 25);
    const urgent = rows.filter((r) => r.urgent).length;
    const summary = [
      `${rows.length} survivors need attention (${urgent} urgent, C3 ER/hospital risk in 7 days). Per module: ${Object.entries(counts).map(([m, c]) => `${m} ${JSON.stringify(c)}`).join("; ")}.`,
      ...shown.map(rowLine),
      ...(rows.length > shown.length ? [`…and ${rows.length - shown.length} more (raise limit).`] : []),
      ...(down.length ? [`Unavailable: ${down.join("; ")}`] : []),
    ].join("\n");
    return ok(summary, { total: rows.length, urgent, statusCounts: counts, rows: shown, unavailable: down, note: IDS_DO_NOT_JOIN });
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
    description: "How well a module's model works and what the cohort shows. c1: AUROC, calibration and risk tiers vs a baseline. c3: held-out rough-patch and ER recall, lead time and alert precision vs a schedule-only baseline. c4: within-person effects of walking, late dinners, carbs and fasting on post-meal sugar, plus the randomized trial contrasts.",
    inputSchema: { module: z.enum(["c1", "c3", "c4"]) },
    annotations: { title: "Module metrics", ...READ },
  }, wrap(async ({ module }) => {
    const d = await metrics(env, module);
    let summary = `${MODULE_INFO[module].name} metrics.`;
    if (module === "c1") {
      const l = (d as { metrics: { logistic: Record<string, { value: number; ci95: number[] }> } }).metrics.logistic;
      summary = `C1: logistic model AUROC ${l.auroc.value.toFixed(3)} (95% CI ${l.auroc.ci95.map((x) => x.toFixed(2)).join("-")}), Brier ${l.brier.value.toFixed(3)}, out-of-fold on 466 development survivors. Held-out status mix ${JSON.stringify(d.heldoutStatusMix)}.`;
    } else if (module === "c3") {
      const m = d as { model: { weeks?: { auc?: number }; episodes?: Record<string, number> }; scheduleBaseline: { weeks?: { auc?: number }; episodes?: Record<string, number> } };
      summary = `C3 Radar on held-out patients: week AUC ${m.model.weeks?.auc} vs schedule-only ${m.scheduleBaseline.weeks?.auc}; rough-patch episode recall ${m.model.episodes?.episode_recall} vs ${m.scheduleBaseline.episodes?.episode_recall}; ER/admission recall ${m.model.episodes?.er_recall} vs ${m.scheduleBaseline.episodes?.er_recall}; median lead ${m.model.episodes?.median_lead_days} days.`;
    } else {
      const e = (d as { effects: Record<string, { est: number; lo: number; hi: number }> }).effects;
      summary = `C4 cohort (within-person, mg/dL change in post-meal rise): walk after a meal ${e.walk?.est} [${e.walk?.lo}, ${e.walk?.hi}]; late dinner +${e.lateDinner?.est} [${e.lateDinner?.lo}, ${e.lateDinner?.hi}]; per 10 g carbs +${e.carbsPer10g?.est}.`;
    }
    return ok(summary, d);
  }));

  server.registerTool("glucose_advice", {
    title: "Plain-language glucose advice (C4)",
    description: "C4 only: the survivor's meal, meal-timing and walking advice rewritten in plain language by a model, checked against the evidence (falls back to the template text when a rewrite adds numbers or causal claims). Takes 3-8 s.",
    inputSchema: { survivorId: z.string().regex(/^c4-/i, "C4 ids start with c4-").describe("e.g. c4-N0632") },
    annotations: { title: "Glucose advice", ...MODEL },
  }, wrap(async ({ survivorId }) => {
    const d = await get(env, "c4", `/survivors/${encodeURIComponent(survivorId)}/advice`, 30_000);
    // Live shape: items[] with a per-item source ("ai" or "template" when the rewrite was rejected).
    const items = isRecord(d) && Array.isArray(d.items) ? d.items.filter(isRecord).map((r) => ({ title: r.title, text: r.text, source: r.source, ...(r.rejected ? { rejected: r.rejected } : {}) })) : [];
    const summary = [`Plain-language advice for ${survivorId}:`, ...items.map((r) => `- ${r.title}: ${r.text}${r.source === "template" ? " (template)" : ""}`)].join("\n");
    return ok(summary, { survivorId, model: isRecord(d) ? d.model : null, items });
  }));

  server.registerTool("reveal_outcome_demo", {
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
    const c = await cue(env, lines, trigger);
    const summary = `Cue: ${c.cue ?? "(none returned)"}${c.say ? `\nSay: "${c.say}"` : ""}\nWhy: ${trigger}`;
    return ok(summary, { ...c, trigger, triggerSource: source, lines: lines.map(({ speaker, text, tag, flag }) => ({ speaker, text, tag, ...(flag && flag !== "none" ? { flag } : {}) })) });
  }));

  // ChatGPT deep research and company-knowledge connectors look for exactly these two tools.
  server.registerTool("search", {
    title: "Search survivors (all modules)",
    description: "Search every module's roster by words in id, name, cancer type, status or headline. Returns ids for fetch.",
    inputSchema: { query: z.string().describe("e.g. 'urgent', 'breast alert', 'sleep', 'night shift'") },
    annotations: { title: "Search", ...READ },
  }, wrap(async ({ query }) => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const all = (await Promise.allSettled(MODULES.map((m) => roster(env, m)))).flatMap((g) => (g.status === "fulfilled" ? g.value : []));
    const hits = all.filter((r) => words.every((w) => [r.survivorId, r.displayName, r.status, r.urgent ? "urgent" : "", r.headline, ...(r.tags ?? [])].join(" ").toLowerCase().includes(w)))
      .sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent) || RANK[a.status] - RANK[b.status]).slice(0, 20);
    const results = hits.map((r) => ({ id: r.survivorId, title: `${r.displayName} [${r.status}${r.urgent ? ", urgent" : ""}]: ${r.headline}`, url: consoleUrl(r.survivorId) }));
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

const HOME = (origin: string) => `Emerge Hackathon challenge MCP server v${VERSION}

MCP endpoint (Streamable HTTP, no auth): ${origin}/mcp

Claude Code:   claude mcp add --transport http emerge-challenges ${origin}/mcp
claude.ai:     Settings > Connectors > Add custom connector > URL ${origin}/mcp
ChatGPT:       Settings > Apps & Connectors > Advanced > Developer mode on; then Create > MCP server URL ${origin}/mcp, Authentication: No authentication

Modules: ${MODULES.map((m) => `${m} ${MODULE_INFO[m].name}: ${MODULE_INFO[m].about}`).join("\n         ")}
`;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === "/health") return Response.json({ ok: true, version: VERSION });
    if (url.pathname === "/mcp" || url.pathname === "/mcp/") {
      if (req.method !== "POST") {
        // Stateless server: no standalone SSE stream and no sessions to delete.
        return withCors(Response.json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed: POST JSON-RPC to /mcp" }, id: null }, { status: 405, headers: { allow: "POST, OPTIONS" } }));
      }
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      const server = buildServer(env);
      await server.connect(transport);
      return withCors(await transport.handleRequest(req));
    }
    if (url.pathname === "/") return new Response(HOME(url.origin), { headers: { "content-type": "text/plain; charset=utf-8" } });
    return new Response("not found", { status: 404 });
  },
};
