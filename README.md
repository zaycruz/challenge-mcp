# Challenge MCP

**Ask Claude or ChatGPT to score a coaching call, and you get the C5 Co-pilot's score: on 477 held-out calls it tracks each supervisor (r 0.751 and 0.701) about as well as the two supervisors track each other (r 0.692).**

A care-team lead can review a coach's call, ask who to call today, or ask how a model was validated, from the chat window they already use. One endpoint answers from C1, C3, C4 and C5.

| C5 validation, 477 held-out supervisor-rated calls | Number | Baseline | 95% CI |
|---|---|---|---|
| App score vs supervisor A (Pearson r) | **0.751** | 0.692 (supervisor B vs supervisor A) | 0.708 to 0.788 |
| App score vs supervisor B (Pearson r) | **0.701** | 0.692 (supervisor A vs supervisor B) | 0.657 to 0.739; baseline 0.64 to 0.736 |
| Must-act flags caught | **13 of 13** | 0 (no screen) | 0.77 to 1; 9 false alarms in 25,785 lines |

The CIs overlap, so this is parity with a second supervisor, not better. The figures are C5's own validation (`/api/c5/agreement`), which `module_metrics c5` relays live, with flags by language. This server re-scores only one stored call per E2E run, so its own live check is n = 1 (below). `node scripts/reproduce-numbers.mjs` regenerates every number on this page from the module APIs and diffs it against the live server: [`runs/numbers-latest.md`](runs/numbers-latest.md).

### Reproduce in 3 commands

```sh
git clone https://github.com/zaycruz/challenge-mcp && cd challenge-mcp
npm ci
npm run e2e && node scripts/reproduce-numbers.mjs   # E2E -> runs/latest.md; numbers diff -> runs/numbers-latest.md
```

Connect a client: add `https://emerge-mcp.raava.dev/mcp` as a custom connector in claude.ai or in ChatGPT Developer mode (Streamable HTTP).

**Auth.** The endpoint is open on purpose, so judges can connect without a key. The data is synthetic, or de-identified MEPS for C1. A bearer key (`Authorization: Bearer <key>`) is optional and raises the limit on the three tools that call a live model (`score_conversation`, `coaching_cue`, `glucose_advice`): 60 calls per minute per key instead of 20 per minute per client IP. An unknown key gets 401. Setting `REQUIRE_KEY=1` closes anonymous access. See **PHI path** below.

---

<!-- fold: reference below -->

## Latency and cost per call

From [`runs/bench-latest.md`](runs/bench-latest.md) (`MCP_KEY=... node scripts/bench.mjs`, 40 calls, wall time from a laptop). The cost is an estimate: Workers AI list prices x tokens at about 4 characters per token.

| Tool | p50 | p95 | Est. cost per call | Timeout, then fallback |
|---|---|---|---|---|
| `score_conversation` (4 lines, 4 model calls) | 1.0 s | 1.1 s | $0.0008 | 8 s per line, 1 retry; `isError` if over half the lines fail |
| `coaching_cue` (live model) | 2.5 s | 8.3 s | $0.0001 | 12 s, 1 retry, then a rule-based cue (`source: "rule-fallback"`) |
| `glucose_advice` (C4's precomputed rewrite) | 0.2 s | 0.4 s | $0 | 9 s, 1 retry, then C4's template advice (`source: "template-fallback"`) |
| `glucose_advice` (this server's cache, 6 h) | 0.1 s | 0.4 s | $0 | — |
| `triage_today`, `search`, `module_metrics` | under 0.1 s | under 0.3 s | $0 | 15 s |

The judges measured `glucose_advice` at 4.5 s when C4 still called its model on every request. C4 now serves precomputed rewrites, and this server caches the answer for 6 h, keyed by the survivor and their roster version. If the model is down or slow, the tool degrades instead of hanging, and the reply says so (`degraded: true`, `timing.retries`, `timing.failedCalls`).

## Resilience, tested by injected failure

`/mcp?fault=llm-down` and `/mcp?fault=llm-slow` replace the model upstreams of that one request (C5 `/api/turn` and `/api/cue`, C4 `/advice`) with a failure or a 30 s stall. No model is called and nothing is cached. The E2E checks the following:
- `llm-down`: `glucose_advice` returns template advice after one retry, `coaching_cue` returns the rule-based cue, and `score_conversation` returns `isError` ("failed on 4 of 4 lines").
- `llm-slow`: `glucose_advice` times out at 9 s and falls back within 25 s.

Error messages name the module and the HTTP status, never an upstream path or a raw body. Over the rate limit, a tool returns `isError` and says when to retry.

## PHI path

Today the data is synthetic (C3, C4, C5) or de-identified survey rows (C1), so the endpoint is open. Here is what a transcript or survivor id touches:
- **This Worker** keeps no state and writes no logs of its own (no `console` calls). Workers observability records request metadata. The only stored data is `glucose_advice` output in the Cloudflare Cache API, for 6 h, keyed by survivor id.
- **C5** sends each transcript line to Workers AI (Clef tagging; GLM for cues) and caches cue answers in KV for a week.
- **C4** serves precomputed advice and calls Workers AI only on a miss.

Before real PHI goes through it:
1. Set `REQUIRE_KEY=1` and issue one key per care team (`MCP_KEYS` secret), or put Cloudflare Access/OAuth in front of it.
2. Turn off the advice cache and C5's cue KV cache, or encrypt them.
3. Restrict observability to metadata.
4. Have a BAA covering Workers and Workers AI. We do not have one; this is the gap.

## Live pipeline check (n = 1)

Each E2E run scores one stored, supervisor-labelled call (CALL05559, the shortest, to stay light on the live model) through `score_conversation`. It shows the pipeline works end to end. It is not a validation.

| CALL05559, latest E2E run | Number | Baseline (always the call's most common label) | 95% Wilson CI over lines |
|---|---|---|---|
| Coach score | 55 / 100 | supervisor: 55 | single call |
| Coach-move agreement | 17 of 18 (0.94) | 0.22 | 0.74 to 0.99 |
| Participant-talk agreement | 13 of 15 (0.87) | 0.53 | 0.62 to 0.96 |

`scripts/reproduce-numbers.mjs` recomputes these from the latest run's line tags and the supervisor labels. The latest E2E artifact, with every check and tool call, is [`runs/latest.md`](runs/latest.md), also at `https://emerge-mcp.raava.dev/e2e`.

## Endpoints

- MCP endpoint: `https://emerge-mcp.raava.dev/mcp` (Streamable HTTP, stateless, open; optional bearer key)
- Fallback: `https://challenge-mcp.zay-259.workers.dev/mcp`
- Demo endpoint: `https://emerge-mcp.raava.dev/mcp?tools=demo` also has `reveal_outcome_demo`.
- `GET /` gives the connect instructions. `GET /health` gives the version.
- Part of the monorepo [zaycruz/survivorship-360](https://github.com/zaycruz/survivorship-360).

## Repo layout

| Path | What it is |
|---|---|
| `src/index.ts` | The Worker: the `/mcp` endpoint and every tool definition |
| `src/modules.ts` | Reads C1, C3, C4 and C5 through service bindings and trims their answers |
| `src/coach.ts` | C5 tagging over `/api/turn`, the MITI-style score and the cue-trigger rules |
| `wrangler.jsonc` | Worker config: custom domain, service bindings (`remote: true` for `wrangler dev`) |
| `e2e/run.mjs` | E2E: the official MCP client against a deployed URL |
| `e2e/custom-domain.sh` | Raw JSON-RPC curl check of the custom domain |
| `scripts/reproduce-numbers.mjs` | Regenerates every README number from the module APIs and diffs it against the live server: `runs/numbers-<stamp>.md` |
| `scripts/bench.mjs` | p50/p95 and estimated cost per tool (`MCP_KEY=... BENCH_OFFSET=n`): `runs/bench-<stamp>.json`, `runs/bench-latest.md` |
| `scripts/reproduce-md.mjs` | Turns a reproduce-runner result into `runs/reproduce-<stamp>.md` |
| `reproduce/` | A separate Worker plus Cloudflare Container that runs the E2E from a fresh clone |
| `runs/` | Run artifacts: `<stamp>.json` (every check and call), `latest.md` (summary), `reproduce-<stamp>.md` (fresh-clone runs) |

There is no frontend. Any MCP client is the UI.

## Architecture

```
ChatGPT / claude.ai / Claude Code ──POST /mcp──> challenge-mcp Worker (emerge-mcp.raava.dev)
                                                   ├─ C1   service binding  c1-acute-risk       /api/c1/*
                                                   ├─ C3   service binding  c3-rough-patch      /api/c3/*   (never ?demo=1, except reveal_outcome_demo)
                                                   ├─ C4   service binding  c4-glucose-guide    /api/c4/*
                                                   ├─ P360 service binding  patient-360         /api/c5/survivors|calls  (supervisor-labelled calls)
                                                   └─ C5   service binding  coach-copilot-clef  POST /api/turn, /api/cue (live model)
```

- The server is stateless. Each POST gets a new McpServer and transport, and the answers are JSON. There is no SSE, because a standalone SSE stream needs session state. `GET /mcp` returns 405.
- The server calls the modules through service bindings, not public URLs, because Worker-to-Worker fetches on the same account can fail with error 1042.
- Auth is optional (see **Auth** above and **PHI path**). The module APIs are already public. The model-backed tools are rate-limited per IP, or per key.

## Survivor ids do not join across modules

The modules use separate cohorts: `c1-S…` (199), `c3-P0…` with 5 digits (60), `c4-N…` (50) and `c5-P0…` with 4 digits (26). The live rosters share no ids in any pair (checked 2026-10-17). `patient_overview` says this and shows the person's rank in their own module. It does not guess matches from age, sex or cancer type. The cross-module tool is `triage_today`, a merged alert worklist.

## Tools (12 by default, all `readOnlyHint: true`)

| Tool | Question it answers |
|---|---|
| `triage_today` | Who should the care team call today? A short ranked list (10 rows, at most 25). C3 urgent comes first, then the top alert of each cohort in turn. Each row has its cohort, its own reason, and the `horizon` and `scale` of that cohort's risk (C1: 12 months, C3: 7 days, C4: recent CGM days, C5: latest call). The reply says the cohorts are not joined and their risks are not comparable (`comparableAcrossCohorts: false`) |
| `list_survivors` | Roster for one module, filtered by status, urgent-only (C3) or free text |
| `get_survivor` | One survivor's panel: headline, summary, evidence, recommendations (charts are opt-in) |
| `patient_overview` | One survivor across all modules, with their roster rank, and a statement that ids do not join |
| `module_metrics` | Model card or cohort findings for C1, C3, C4 or C5, trimmed. C5 relays the 477-call validation per supervisor, with flags by language. C1 leads with the nested-CV gain (`headlineGain`: AUROC 0.711 vs 0.672, +0.039, 95% CI -0.015 to 0.091, not significant). It then gives the out-of-fold gain for the chosen forest (+0.053), labelled as optimistic. Every module returns `subgroups`: C1 AUROC and O/E per age, sex, race/ethnicity, insurance and cancer type; C3 recall per group, including language; C4 effects by blood-sugar group, with a note that C4 serves no demographic breakdown; C5 flag recall and false alarms by language |
| `glucose_advice` | C4 advice in plain language, from a model and checked against the evidence |
| `list_coaching_calls` / `get_coaching_call` | Supervisor-labelled C5 calls and transcripts |
| `score_conversation` | Live C5 tagging of a transcript or a `callId`: MI tags, flags, MITI-style score, cue moments, and agreement with the supervisor |
| `coaching_cue` | What the coach should say next. The trigger comes from the Co-pilot's own rules, or from the caller |
| `search` / `fetch` | The pair that ChatGPT deep research and company-knowledge connectors expect. Ranking: exact id, then the phrase in a tag, then in the headline, then all words; ties go to urgent, then by status. `e2e/search-fixtures.mjs` holds the fixture queries |

`reveal_outcome_demo` (what happened after a C3 forecast) is registered only on `/mcp?tools=demo`. It is not a security control, because the data is synthetic. It keeps a hidden-outcome tool out of the default model demo.

Each result has a short text summary, then the compact JSON (also in `structuredContent`). An error, such as an unknown id, comes back as `isError: true`.

### C5 scoring

The scoring follows `coach-copilot/public/index.html` (`updateScore`, `checkTriggers`, `CUE_GAP = 3`):

- **Tagging order.** Participant lines are tagged first, 4 at a time. Then the coach lines are tagged, with `previous` carrying the participant flags. `/api/turn` uses those flags to raise `missed_concern`.
- **Score.** 30 points for 2 reflections per question. 20 points for 40% complex reflections. 20 points for 50% open questions. 30 points for MI-consistent moves vs persuade/confront. The total is rounded once, and the score is `null` below 4 coach lines.
- **Limit.** A transcript can have at most 40 lines, because each line is one Workers AI call.

## Run locally

`wrangler dev` runs the Worker on your machine and calls the deployed module Workers through remote service bindings. You need `npx wrangler login` on the Cloudflare account that hosts the modules.

```sh
npm ci
npx wrangler dev --port 8799            # http://localhost:8799/mcp ; stop it with Ctrl-C
node e2e/run.mjs http://localhost:8799/mcp
```

## Deploy

```sh
npm run typecheck
npm run deploy                          # wrangler deploy -> emerge-mcp.raava.dev + challenge-mcp.zay-259.workers.dev
```

## E2E against the live site

```sh
npm ci
npm run e2e                             # = node e2e/run.mjs https://emerge-mcp.raava.dev/mcp
npm run e2e:domain                      # optional raw curl check of the custom domain
```

The E2E does the following:
- Connects with the official MCP client and runs `initialize` and `tools/list`.
- Checks the schemas and annotations of every tool.
- Calls every tool, including the error cases, and the demo tool on `?tools=demo`.
- Checks the risky paths: missed-concern flag carrying, the C1 live model, and the triage cap.
- Checks the honesty fields: per-row horizon and scale in triage, the nested-CV C1 headline, `subgroups` for every module, C5's 477-call validation and its n = 1 label, and errors without upstream paths.
- Runs the search fixtures (`e2e/search-fixtures.mjs`), for example every "night shift" hit must match the phrase in a tag or the headline, not just the two words anywhere.
- Injects failures (`?fault=llm-down`, `?fault=llm-slow`) and checks every fallback (see **Resilience**).
- Checks auth: an unknown bearer key gets 401. With `MCP_KEY` set, it also checks the keyed path.
- Probes the rate limit last, with calls that fail to parse after the limit check, so they never reach a model. This spends this IP's budget for a minute.

It exits 1 if any check fails. Each run writes `runs/<stamp>.json` and `runs/latest.md`.

One run sends a 7-line transcript and one stored call of 33 lines to the C5 model, plus one cue. Do not loop it; the rate limit stops a second run within the same minute anyway.

## Reproduce from a fresh clone (Cloudflare Container)

`reproduce/` is a Worker with a Durable Object that starts a `node:22` Cloudflare Container. The container does the following:
1. Clones this repo at `ref`.
2. Runs `npm ci`.
3. Runs the E2E against the live site.
4. Returns each step's exit code and output, plus `runs/latest.md`.

```sh
(cd reproduce && npm ci && npx wrangler deploy && npx wrangler secret put REPRO_TOKEN)
curl -s -X POST https://challenge-mcp-reproduce.zay-259.workers.dev/run \
  -H "authorization: Bearer $REPRO_TOKEN" -d '{"ref":"main"}' > /tmp/reproduce.json
node scripts/reproduce-md.mjs /tmp/reproduce.json   # -> runs/reproduce-<stamp>.md
```

The token keeps strangers from spending the live C5 model calls.
