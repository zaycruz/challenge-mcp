# Challenge MCP

**Ask Claude or ChatGPT to score a coaching call, and the C5 Co-pilot answers in 4 seconds: 55/100, the same score the supervisor gave.**

A care-team lead can review any coach's call from the chat window they already use. They can also ask who to call today, or how a model was validated, and get an answer from C1, C3, C4 and C5 in one place.

| Result (live, through this server) | Number | Baseline | 95% CI |
|---|---|---|---|
| Coach score on supervisor-labelled call CALL05559 | **55** / 100 | supervisor: 55 | single call, no CI |
| Coach-move agreement with the supervisor | **0.94** (17 of 18 lines) | 0.22 (always the most common label) | 0.74 to 0.99 |
| Participant-talk agreement with the supervisor | **0.87** (13 of 15 lines) | 0.53 (always the most common label) | 0.62 to 0.96 |

These numbers come from one stored call: the shortest one, picked so that the E2E stays light on the live model. They show the pipeline works end to end. They are not a validation of the C5 model across many calls. The CIs are Wilson intervals over lines. The baseline always guesses the supervisor's most common label in the call. Source: `runs/2026-10-17T16-35-29-023Z.json`. The latest E2E artifact, with every check and every tool call, is [`runs/latest.md`](runs/latest.md); `https://emerge-mcp.raava.dev/e2e` links to it as well.

### Reproduce in 3 commands

```sh
git clone https://github.com/zaycruz/challenge-mcp && cd challenge-mcp
npm ci
npm run e2e        # live site; writes runs/<stamp>.json and runs/latest.md
```

To connect a client, add `https://emerge-mcp.raava.dev/mcp` as a custom connector in claude.ai or in ChatGPT Developer mode. It uses Streamable HTTP and needs no auth.

**Auth.** The endpoint is open on purpose, so judges can connect without a key. The data is synthetic, or de-identified MEPS for C1. Three tools call a live model: `score_conversation`, `coaching_cue` and `glucose_advice`. Together they are limited to 10 calls per minute per client IP, using a Workers rate-limit binding. Over the limit, the tool returns `isError` and a message saying when to retry. Error messages name the module and the HTTP status, never an upstream path.

---

<!-- fold: reference below -->

## Endpoints

- MCP endpoint: `https://emerge-mcp.raava.dev/mcp` (Streamable HTTP, stateless, no auth)
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
- There is no auth (see **Auth** above). The module APIs are already public, and the data is synthetic. C1 uses real, de-identified MEPS survey rows. The model-backed tools are rate-limited per IP.

## Survivor ids do not join across modules

The modules use separate cohorts: `c1-S…` (199), `c3-P0…` with 5 digits (60), `c4-N…` (50) and `c5-P0…` with 4 digits (26). The live rosters share no ids in any pair (checked 2026-10-17). `patient_overview` says this and shows the person's rank in their own module. It does not guess matches from age, sex or cancer type. The cross-module tool is `triage_today`, a merged alert worklist.

## Tools (12 by default, all `readOnlyHint: true`)

| Tool | Question it answers |
|---|---|
| `triage_today` | Who should the care team call today? A short ranked list (10 rows, at most 25). C3 urgent comes first, then the top alert of each cohort in turn. Each row has its cohort, its own reason, and the `horizon` and `scale` of that cohort's risk (C1: 12 months, C3: 7 days, C4: recent CGM days, C5: latest call). The reply says the cohorts are not joined and their risks are not comparable (`comparableAcrossCohorts: false`) |
| `list_survivors` | Roster for one module, filtered by status, urgent-only (C3) or free text |
| `get_survivor` | One survivor's panel: headline, summary, evidence, recommendations (charts are opt-in) |
| `patient_overview` | One survivor across all modules, with their roster rank, and a statement that ids do not join |
| `module_metrics` | Model card or cohort findings for C1, C3 or C4, trimmed. C1 leads with the nested-CV gain (`headlineGain`: AUROC 0.711 vs 0.672, +0.039, 95% CI -0.015 to 0.091, not significant). It then gives the out-of-fold gain for the chosen forest (+0.053), labelled as optimistic. Every module returns `subgroups`: C1 AUROC and O/E per age, sex, race/ethnicity, insurance and cancer type; C3 recall per group, including language; C4 effects by blood-sugar group, with a note that C4 serves no demographic breakdown |
| `glucose_advice` | C4 advice in plain language, from a model and checked against the evidence |
| `list_coaching_calls` / `get_coaching_call` | Supervisor-labelled C5 calls and transcripts |
| `score_conversation` | Live C5 tagging of a transcript or a `callId`: MI tags, flags, MITI-style score, cue moments, and agreement with the supervisor |
| `coaching_cue` | What the coach should say next. The trigger comes from the Co-pilot's own rules, or from the caller |
| `search` / `fetch` | The pair that ChatGPT deep research and company-knowledge connectors expect |

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

It exits 1 if any check fails. Each run writes `runs/<stamp>.json` and `runs/latest.md`.

One run makes 4 requests to the C5 model: a 7-line transcript, a stored call of 33 lines, one cue and one bad input. Do not loop it.

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
