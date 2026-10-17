/**
 * C5 conversation scoring over the live Copilot (coach.raava.dev).
 * Tagging, score and cue triggers copy coach-copilot/public/index.html (updateScore, checkTriggers, CUE_GAP),
 * so "score" and "would a cue fire here" mean the same thing here and on the Copilot's screen.
 */
import { ApiError, isRecord, postCopilot, type Env } from "./modules";

export interface Line { speaker: "coach" | "participant"; text: string; tag?: string | null; flag?: string | null }
export interface Tagged extends Line { n: number; confidence: number | null; ms?: number; error?: string }

export const MAX_LINES = 40;
const CUE_GAP = 3;
/** Participant flags the coach must route to someone today; a coach line right after one is checked for `missed_concern`. */
const ROUTE_FLAGS = new Set(["medical", "distress", "social"]);
const FAMILY: Record<string, string> = {
  "open question": "q", "closed question": "q",
  "simple reflection": "r", "complex reflection": "r",
  affirm: "s", "seek collaboration": "s", "emphasize autonomy": "s", "ask permission": "s",
  "give information": "i", persuade: "x", confront: "x", other: "o",
};
export const FLAG_MEANING: Record<string, string> = {
  medical: "participant reports a new or worsening symptom: tell the care team today",
  distress: "hopelessness about life itself: check in today and connect to support",
  social: "food, money, transport or safety need: connect to a navigator today",
  dropout: "participant may quit the program",
  missed_concern: "coach did not acknowledge or route the participant's concern",
  medical_advice: "coach gave medical advice (dosing, diagnosis, stopping treatment)",
};

/** Accepts [{speaker, text}] or a string with one "coach: ..." / "participant: ..." line per row. */
export function parseTranscript(input: unknown): Line[] {
  const rows: unknown[] = typeof input === "string"
    ? input.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).map((s) => {
      const m = s.match(/^\s*(coach|participant|c|p)\s*[:\-–]\s*(.+)$/i);
      if (!m) throw new ApiError(400, `cannot read the speaker in "${s.slice(0, 60)}"; start each line with "coach:" or "participant:"`);
      return { speaker: m[1].toLowerCase().startsWith("c") ? "coach" : "participant", text: m[2] };
    })
    : Array.isArray(input) ? input : [];
  const lines = rows.filter(isRecord).map((r) => ({
    speaker: String(r.speaker).toLowerCase() === "coach" ? "coach" as const : "participant" as const,
    text: String(r.text ?? "").trim().slice(0, 1000),
    ...(typeof r.tag === "string" ? { tag: r.tag } : {}),
    ...(typeof r.flag === "string" ? { flag: r.flag } : {}),
  })).filter((l) => l.text);
  if (!lines.length) throw new ApiError(400, "transcript is empty");
  if (lines.length > MAX_LINES) throw new ApiError(400, `transcript has ${lines.length} lines; the limit is ${MAX_LINES} (each line is one live model call)`);
  return lines;
}

async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    for (let x = queue.shift(); x !== undefined; x = queue.shift()) await fn(x);
  }));
}

/**
 * Tags every line with /api/turn. Participant lines depend on nothing earlier, so they go first (4 at a time);
 * then coach lines, whose `previous` carries the participant flags (that is how /api/turn finds `missed_concern`).
 */
export async function tagLines(env: Env, lines: Line[]): Promise<Tagged[]> {
  const out: Tagged[] = lines.map((l, i) => ({ n: i + 1, speaker: l.speaker, text: l.text, tag: null, flag: null, confidence: null }));
  const one = async (i: number) => {
    const previous = out.slice(Math.max(0, i - 2), i).map(({ speaker, text, tag, flag }) => ({ speaker, text, tag: tag ?? undefined, flag: flag ?? undefined }));
    try {
      const r = await postCopilot(env, "/api/turn", { line: { speaker: out[i].speaker, text: out[i].text }, previous });
      if (!isRecord(r)) throw new Error("bad /api/turn answer");
      out[i].tag = typeof r.tag === "string" ? r.tag : null;
      out[i].flag = typeof r.flag === "string" ? r.flag : null;
      out[i].confidence = typeof r.confidence === "number" ? +r.confidence.toFixed(3) : null;
      out[i].ms = typeof r.ms === "number" ? r.ms : undefined;
    } catch (e) {
      out[i].error = e instanceof Error ? e.message : String(e);
    }
  };
  const idx = (s: Line["speaker"]) => out.map((l, i) => (l.speaker === s ? i : -1)).filter((i) => i >= 0);
  await pool(idx("participant"), 4, one);
  await pool(idx("coach"), 4, one);
  return out;
}

/** MITI-style score, the Copilot's updateScore arithmetic: rounded once at the end; null under 4 tagged coach lines. */
export function score(lines: Line[]) {
  const c = lines.filter((l) => l.speaker === "coach" && l.tag).map((l) => l.tag as string);
  const p = lines.filter((l) => l.speaker === "participant" && l.tag).map((l) => l.tag as string);
  const n = (t: string) => c.filter((x) => x === t).length;
  const oq = n("open question"), cq = n("closed question"), sr = n("simple reflection"), cr = n("complex reflection");
  const ad = n("affirm") + n("seek collaboration") + n("emphasize autonomy") + n("ask permission");
  const na = n("persuade") + n("confront");
  const q = oq + cq, r = sr + cr;
  const parts = {
    reflectionsPerQuestion: { value: q ? +(r / q).toFixed(2) : null, target: 2, points: 30 * Math.min((q ? r / q : r ? 2 : 0) / 2, 1), max: 30 },
    complexReflectionPct: { value: r ? Math.round((100 * cr) / r) : null, target: 40, points: 20 * Math.min((r ? cr / r : 0) / 0.4, 1), max: 20 },
    openQuestionPct: { value: q ? Math.round((100 * oq) / q) : null, target: 50, points: 20 * Math.min((q ? oq / q : 0) / 0.5, 1), max: 20 },
    miConsistent: { value: `${ad} MI-consistent vs ${na} persuade/confront`, target: "no persuade or confront", points: 30 * (ad + na ? ad / (ad + na) : 1), max: 30 },
  };
  const total = Object.values(parts).reduce((s, x) => s + x.points, 0);
  return {
    score: c.length < 4 ? null : Math.round(total),
    parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, { ...v, points: +v.points.toFixed(1) }])),
    counts: { openQuestions: oq, closedQuestions: cq, simpleReflections: sr, complexReflections: cr, miConsistent: ad, persuadeOrConfront: na, changeTalk: p.filter((x) => x === "change").length, sustainTalk: p.filter((x) => x === "sustain").length },
  };
}

/** The trigger the Copilot would raise after line i, or null. `state.lastCueAt` carries the cooldown across lines. */
export function triggerAt(lines: Line[], i: number, state: { lastCueAt: number }): string | null {
  const l = lines[i];
  let trigger: string | null = null;
  if (l.flag === "missed_concern") trigger = "The participant raised a concern and the coach moved on without routing it. Help the coach go back to it now.";
  else if (l.flag === "medical_advice") trigger = "The coach just gave medical advice outside their role. Help the coach walk it back and refer to the care team.";
  else if (l.flag === "dropout") trigger = "The participant is talking about leaving the program. Help the coach explore it without pressure.";
  else if (l.flag && l.flag !== "none") trigger = `Participant raised a ${l.flag} concern. Help the coach respond with care and connect them to the right person today.`;
  else if (l.speaker === "coach") {
    const coach = lines.slice(0, i + 1).filter((x) => x.speaker === "coach" && x.tag);
    const last = coach.slice(-4).map((x) => x.tag as string);
    const before = lines[i - 1];
    if (l.tag === "confront") trigger = "The coach just confronted the participant.";
    else if (l.tag === "persuade" && !coach.slice(-3, -1).some((x) => x.tag === "ask permission")) trigger = "The coach just told the participant what to do without asking permission.";
    else if (before && before.speaker === "participant" && before.tag === "change" && FAMILY[l.tag ?? ""] !== "r" && l.tag !== "affirm") trigger = "The participant voiced change talk and the coach did not reflect or affirm it.";
    else if (last.length === 4 && last.every((t) => FAMILY[t] === "q")) trigger = "The coach has asked four questions in a row without a reflection.";
    else if (last.length >= 3 && last.slice(-3).every((t) => t === "closed question")) trigger = "Three closed questions in a row.";
    if (trigger && lines.slice(0, i + 1).filter((x) => x.speaker === "coach").length - state.lastCueAt < CUE_GAP) trigger = null;
  }
  if (trigger) state.lastCueAt = lines.slice(0, i + 1).filter((x) => x.speaker === "coach").length;
  return trigger;
}

export function cueMoments(lines: Line[]) {
  const state = { lastCueAt: -99 };
  return lines.flatMap((_, i) => {
    const t = triggerAt(lines, i, state);
    return t ? [{ afterLine: i + 1, trigger: t }] : [];
  });
}

export async function cue(env: Env, recent: Line[], trigger: string) {
  const r = await postCopilot(env, "/api/cue", { trigger, recent: recent.slice(-8).map(({ speaker, text, tag }) => ({ speaker, text, ...(tag ? { tag } : {}) })) }, 45_000);
  if (!isRecord(r)) throw new ApiError(502, "bad /api/cue answer");
  return { cue: r.cue ?? null, say: r.say ?? null, ms: r.ms };
}
