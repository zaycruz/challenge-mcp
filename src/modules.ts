/**
 * Reads the challenge modules through service bindings and trims their answers to what a chat client needs.
 *   c1  c1-acute-risk       /api/c1/survivors[/:id], /api/c1/metrics
 *   c3  c3-rough-patch      /api/c3/survivors[/:id][?demo=1], /api/c3/metrics
 *   c4  c4-glucose-guide    /api/c4/survivors[/:id][/advice], /api/c4/cohort
 *   c5  patient-360         /api/c5/survivors[/:id], /api/c5/calls[/:id]  (supervisor-labelled calls; the Copilot serves no roster)
 *   c5  coach-copilot-clef  POST /api/turn, /api/cue                      (the live model)
 */
export interface Fetcher { fetch(input: RequestInfo, init?: RequestInit): Promise<Response> }
export interface Env {
  C1: Fetcher; C3: Fetcher; C4: Fetcher; C5: Fetcher; P360: Fetcher;
  /** Workers rate limiter keyed by client IP, for the tools that call a live model. */
  LLM_LIMIT?: { limit(o: { key: string }): Promise<{ success: boolean }> };
}

export const MODULES = ["c1", "c3", "c4", "c5"] as const;
export type Module = (typeof MODULES)[number];

export const MODULE_INFO: Record<Module, { name: string; about: string; binding: "C1" | "C3" | "C4" | "C5" | "P360"; base: string }> = {
  c1: { name: "C1 Care Team Risk", about: "chance of an ER visit or hospital stay next year (199 real MEPS survivors, held out)", binding: "C1", base: "/api/c1" },
  c3: { name: "C3 Bad Week Radar", about: "wearable forecast of a rough patch, and urgent ER/hospital risk, in the next 7 days (60 synthetic survivors)", binding: "C3", base: "/api/c3" },
  c4: { name: "C4 Glucose Guide", about: "CGM blood sugar, meals, meal timing and walking advice (50 synthetic sensor wearers)", binding: "C4", base: "/api/c4" },
  c5: { name: "C5 Coach's Co-pilot", about: "coaching calls scored for motivational interviewing, with flags a person must act on (26 synthetic participants)", binding: "P360", base: "/api/c5" },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Errors name the module and the status, never the upstream path or raw body. */
async function call(f: Fetcher, label: string, path: string, init?: RequestInit, timeoutMs = 15_000): Promise<unknown> {
  let r: Response;
  try {
    r = await f.fetch(`https://module${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const timedOut = e instanceof Error && /timeout|abort/i.test(`${e.name} ${e.message}`);
    throw new ApiError(504, `${label} ${timedOut ? `did not answer within ${timeoutMs / 1000} s` : "could not be reached"}`);
  }
  const text = await r.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  if (!r.ok) {
    const why = isRecord(body) && typeof body.error === "string" ? body.error.replace(/\/?api\/\S*/g, "").replace(/\s+/g, " ").trim().slice(0, 120) : "";
    throw new ApiError(r.status, `${label} returned ${r.status}${why ? `: ${why}` : ""}`);
  }
  return body;
}

export const get = (env: Env, m: Module, path: string, timeoutMs?: number) =>
  call(env[MODULE_INFO[m].binding], MODULE_INFO[m].name, MODULE_INFO[m].base + path, undefined, timeoutMs);

export const postCopilot = (env: Env, path: string, body: unknown, timeoutMs = 30_000) =>
  call(env.C5, "C5 Co-pilot model", path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, timeoutMs);

export function moduleOf(survivorId: string): Module {
  const m = survivorId.split("-")[0]?.toLowerCase();
  if ((MODULES as readonly string[]).includes(m)) return m as Module;
  throw new ApiError(400, `survivorId must start with c1-, c3-, c4- or c5- (got "${survivorId}")`);
}

export const consoleUrl = (survivorId: string) => `https://patient-360.raava.dev/#p-${encodeURIComponent(survivorId)}`;

// ---------------------------------------------------------------- rosters

export interface Row { survivorId: string; displayName: string; status: string; headline: string; urgent?: boolean; tags?: string[]; updatedAt?: string }

const rosterCache = new Map<Module, { at: number; rows: Row[] }>();
export async function roster(env: Env, m: Module): Promise<Row[]> {
  const hit = rosterCache.get(m);
  if (hit && Date.now() - hit.at < 60_000) return hit.rows;
  const raw = await get(env, m, "/survivors");
  if (!Array.isArray(raw)) throw new ApiError(502, `${m} roster is not a list`);
  const rows = raw.filter(isRecord).map((r) => ({
    survivorId: String(r.survivorId), displayName: String(r.displayName ?? ""), status: String(r.status ?? ""), headline: String(r.headline ?? ""),
    ...(typeof r.urgent === "boolean" ? { urgent: r.urgent } : {}),
    ...(Array.isArray(r.tags) ? { tags: r.tags.filter(isRecord).map((t) => String(t.label)) } : {}),
    ...(r.updatedAt ? { updatedAt: String(r.updatedAt) } : {}),
  }));
  rosterCache.set(m, { at: Date.now(), rows });
  return rows;
}

export const statusCounts = (rows: Row[]) =>
  rows.reduce<Record<string, number>>((c, r) => ({ ...c, [r.status]: (c[r.status] ?? 0) + 1 }), {});

// ---------------------------------------------------------------- one survivor

const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const list = (v: unknown) => (Array.isArray(v) ? v.filter(isRecord) : []);

/** C3 charts hold 42 days; the last 14 are enough to talk about. */
function lastDays(charts: unknown, n = 14) {
  if (!isRecord(charts)) return charts;
  return Object.fromEntries(Object.entries(charts).map(([k, v]) => [k, Array.isArray(v) ? v.slice(-n) : v]));
}

export type View = Record<string, unknown> & { module: Module; moduleName: string; consoleUrl: string; displayName?: unknown; status?: unknown; headline?: unknown; summary?: unknown; recommendations?: unknown; urgent?: unknown };

export async function survivor(env: Env, survivorId: string, includeCharts = false): Promise<View> {
  const m = moduleOf(survivorId);
  // C3: never ?demo=1 here. The hidden outcome has its own demo-only tool.
  const d = await get(env, m, `/survivors/${encodeURIComponent(survivorId)}`);
  if (!isRecord(d)) throw new ApiError(502, `${m} survivor is not an object`);
  const base = pick(d, ["survivorId", "displayName", "status", "headline", "summary"]);
  let view: Record<string, unknown>;
  if (m === "c1") {
    const charts = isRecord(d.charts) ? d.charts : {};
    view = {
      ...base, risk: d.risk, thresholds: d.thresholds,
      evidence: list(d.evidence).map((e) => pick(e, ["kind", "text"])),
      recommendations: d.recommendations, profile: d.profile,
      surveyScores2017: charts.scores, use2017: charts.use2017, caveat: d.caveat,
      ...(includeCharts ? { charts: pick(charts, ["risk", "drivers"]) } : {}),
    };
  } else if (m === "c3") {
    view = {
      ...base, urgent: d.urgent, urgentRisk: d.urgentRisk, risk: d.risk, scheduleRisk: d.scheduleRisk, thresholds: d.thresholds,
      profile: d.profile,
      evidence: list(d.evidence).map((e) => pick(e, ["label", "text", "riskShare"])),
      recommendations: d.recommendations,
      ...(includeCharts ? { chartsLast14Days: lastDays(d.charts) } : {}),
    };
  } else if (m === "c4") {
    view = {
      ...base, statusReasons: d.statusReasons, tags: list(d.tags).map((t) => t.label), profile: d.profile,
      evidence: list(d.evidence).filter((e) => e.value !== null && e.scope !== "rule").map((e) => pick(e, ["id", "label", "value", "unit"])),
      recommendations: list(d.recommendations).map((r) => pick(r, ["title", "text", "basis"])),
      dataNote: d.dataNote,
      ...(includeCharts ? { charts: d.charts } : {}),
    };
  } else {
    const charts = isRecord(d.charts) ? d.charts : {};
    view = {
      ...base, profile: d.profile, evidence: d.evidence, recommendations: d.recommendations,
      calls: list(charts.calls).map((c) => ({ ...pick(c, ["callId", "date", "callNumber", "week", "goalTopic", "language", "score", "status"]), flaggedLines: list(c.flags).length })),
    };
  }
  return { module: m, moduleName: MODULE_INFO[m].name, ...view, consoleUrl: consoleUrl(survivorId) };
}

// ---------------------------------------------------------------- metrics

const ci = (v: unknown) => (isRecord(v) ? { value: v.value, ci95: v.ci95 } : v);

const r3 = (x: unknown) => (typeof x === "number" ? +x.toFixed(3) : x);

/** C1's nested-CV estimate: the whole model search re-run inside each outer fold, so the scored model never saw its test fold. */
function nestedGain(ms: unknown) {
  if (!isRecord(ms) || !isRecord(ms.auroc) || !isRecord(ms.vsBaseline)) return null;
  const v = ms.vsBaseline, ll = isRecord(ms.logLoss) ? ms.logLoss : {};
  return {
    basis: `nested CV (${ms.candidates}-candidate search re-run inside each of ${ms.outerFolds} outer folds); unbiased`,
    auroc: { model: r3(ms.auroc.search), baseline: r3(ms.auroc.baseline), gain: r3(v.dAuroc), ci95: list2(v.dAurocCi95), pBetter: v.pAurocBetter },
    logLoss: { model: r3(ll.search), baseline: r3(ll.baseline), gain: r3(v.dLogLoss), ci95: list2(v.dLogLossCi95), pBetter: v.pLogLossBetter },
    powerNote: ms.powerNote,
  };
}
const list2 = (x: unknown) => (Array.isArray(x) ? x.map(r3) : x);

/** C1 fairness: AUROC and observed/expected per group on the 466 development survivors, with the baseline's AUROC beside it. */
function c1Subgroups(f: unknown, fb: unknown) {
  const base = new Map((Array.isArray(fb) ? fb.filter(isRecord) : []).map((r) => [`${r.attribute}|${r.group}`, r]));
  const rows = (Array.isArray(f) ? f.filter(isRecord) : []).map((r) => ({
    dimension: r.attribute, group: r.group, n: r.n, events: r.positives,
    auroc: r3(r.auroc), aurocCi95: list2(r.aurocCi95), baselineAuroc: r3(base.get(`${r.attribute}|${r.group}`)?.auroc),
    observedOverExpected: r3(r.oe), oeCi95: list2(r.oeCi95), flag: r.flag, tooSmall: r.tooSmall,
  }));
  const weak = rows.filter((r) => r.flag !== "ok" && !r.tooSmall).map((r) => `${r.group} (AUROC ${r.auroc})`);
  return {
    basis: "out-of-fold on the 466 development survivors; tooSmall = n < 30 or < 10 events",
    summary: `${weak.length ? `Weaker for: ${weak.join(", ")}.` : "No judgeable group is flagged."} Too small to judge: ${rows.filter((r) => r.tooSmall).map((r) => r.group).join(", ") || "none"}. C1 has no language field.`,
    rows,
  };
}

/** C3 fairness: week-level recall at the alert line per group (language included), held-out patients. */
function c3Subgroups(f: unknown) {
  if (!isRecord(f)) return null;
  return {
    basis: f.metric, overallRecall: f.overallRecall, summary: f.summary,
    rows: (Array.isArray(f.dimensions) ? f.dimensions.filter(isRecord) : []).flatMap((d) => (Array.isArray(d.rows) ? d.rows.filter(isRecord) : []).map((r) => ({
      dimension: d.label, group: r.group, patients: r.patients, roughWeeks: r.roughWeeks, recall: r.recall, recallCi95: r.recallCi95, precision: r.precision, auc: r.auc,
      ...(r.tooFewToJudge ? { tooFewToJudge: true } : {}), ...(r.belowOverall ? { belowOverall: true } : {}), ...(r.lowerButUncertain ? { lowerButUncertain: true } : {}),
    }))),
  };
}

export async function metrics(env: Env, m: Exclude<Module, "c5">) {
  if (m === "c4") {
    const c = await get(env, "c4", "/cohort");
    if (!isRecord(c)) throw new ApiError(502, "c4 cohort is not an object");
    const trial = isRecord(c.trial) ? c.trial : {};
    return {
      module: m, moduleName: MODULE_INFO[m].name, source: c.source,
      note: "effects.<name> = within-person change in the post-meal rise (mg/dL) with 95% CI; negative = smaller rise.",
      effects: c.effects, statusCounts: c.statusCounts,
      trialContrasts: trial.contrasts, realWorld: c.realWorld,
      subgroups: {
        note: "C4 serves effects by blood-sugar group only. It serves no age, sex, race/ethnicity or language breakdown, so none is shown.",
        rows: isRecord(c.effectsByBloodSugarGroup) ? Object.entries(c.effectsByBloodSugarGroup).flatMap(([group, e]) => isRecord(e) ? Object.entries(e).filter(([, v]) => isRecord(v)).map(([effect, v]) => {
          const x = v as Record<string, unknown>;
          return { dimension: "blood-sugar group", group, effect, estimate: x.est, ci95: [x.lo, x.hi], people: x.people };
        }) : []) : [],
      },
    };
  }
  const d = await get(env, m, "/metrics");
  if (!isRecord(d)) throw new ApiError(502, `${m} metrics is not an object`);
  if (m === "c1") {
    const ms = isRecord(d.metrics) ? d.metrics : {};
    const short = (x: unknown) => (isRecord(x) ? Object.fromEntries(["auroc", "auprc", "brier", "cal_slope"].map((k) => [k, ci(x[k])])) : x);
    const tiers = isRecord(d.tiers) ? d.tiers : {};
    // The live model is whatever finalModel.key names (the forest since the model search); never hard-code one.
    const fm = isRecord(d.finalModel) ? d.finalModel : {};
    const key = typeof fm.key === "string" && isRecord(ms[fm.key]) ? fm.key : "logistic";
    const deltas = isRecord(d.deltaVsBaseline) ? d.deltaVsBaseline : {};
    const delta = isRecord(deltas[key]) ? Object.fromEntries(Object.entries(deltas[key] as Record<string, unknown>).map(([k, v]) => [k, isRecord(v) ? pick(v, ["value", "ci95", "p_better"]) : v])) : null;
    return {
      module: m, moduleName: MODULE_INFO[m].name, asOf: d.asOf, outcome: d.outcome, data: d.data, validation: d.validation,
      finalModel: { key, name: fm.name ?? fm, chosenBy: fm.chosenBy, previous: fm.previous },
      metrics: { [key]: short(ms[key]), baseline: short(ms.baseline) },
      // Two gains exist and the judges caught both; label each and lead with the unbiased one.
      headlineGain: nestedGain(d.modelSearch),
      gainOverBaseline: delta ? { basis: `out-of-fold, ${key} vs baseline on the same repeated 5-fold CV. Optimistic: the model search chose ${key} using these folds. Use headlineGain (nested CV) as the honest figure.`, ...delta } : null,
      subgroups: c1Subgroups(d.fairness, d.fairnessBaseline),
      tiers: list(tiers.tiers).map((t) => pick(t, ["status", "riskFrom", "riskTo", "n", "observedRate"])),
      plainFactors: list(d.plainFactors).map((f) => ({ factor: f.factor, rateRatio: f.rateRatio })),
      clinicalRecords: isRecord(d.clinicalRecords) ? d.clinicalRecords.verdict : d.clinicalRecords,
      heldoutStatusMix: d.heldoutStatusMix, caveats: d.caveats,
    };
  }
  const model = (x: unknown) => (isRecord(x) ? { name: x.name, weeks: x.weeks, episodes: isRecord(x.episodes) ? pick(x.episodes, ["episode_recall", "median_lead_days", "er_recall", "alert_precision", "alerts_per_patient_month"]) : x.episodes } : x);
  // Live shape: methods.{model, schedule, logistic, steps_rule} (CONTRACT.md's excerpt shows them at the top level).
  const ms = isRecord(d.methods) ? d.methods : d;
  const urgent = isRecord(d.urgent) ? d.urgent : {};
  return {
    module: m, moduleName: MODULE_INFO[m].name, asOf: d.asOf, definition: d.definition, counts: d.counts,
    model: model(ms.model), scheduleBaseline: model(ms.schedule), liftVsScheduleCi95: d.lift_vs_schedule_ci95,
    urgent: { definition: urgent.definition, methods: urgent.methods },
    calibration: isRecord(d.calibration) && isRecord(d.calibration.model) ? pick(d.calibration.model, ["brier", "base_rate", "brier_if_base_rate"]) : undefined,
    subgroups: c3Subgroups(d.fairness), realDataCheck: isRecord(d.realDataCheck) ? pick(d.realDataCheck, ["dataset", "people", "days", "next_day_auc_wearable_only_prev2days", "next_day_auc_yesterdays_self_rating"]) : d.realDataCheck,
  };
}
