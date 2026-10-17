# Challenge MCP (C6)

A remote MCP server over the Emerge Hackathon challenge APIs. Use it from ChatGPT and Claude.

- MCP endpoint: `https://emerge-mcp.raava.dev/mcp` (Streamable HTTP, stateless, no auth)
- Fallback: `https://challenge-mcp.zay-259.workers.dev/mcp`
- `GET /` gives the connect instructions. `GET /health` gives the version.

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
- There is no auth. The module APIs are already public, and the data is synthetic. C1 uses real, de-identified MEPS survey rows.

## Survivor ids do not join across modules

The modules use separate cohorts: `c1-S…` (199), `c3-P0…` with 5 digits (60), `c4-N…` (50) and `c5-P0…` with 4 digits (26). The live rosters share no ids in any pair (checked 2026-10-17). `patient_overview` says this and shows the person's rank in their own module. It does not guess matches from age, sex or cancer type. The cross-module tool is `triage_today`, a merged alert worklist.

## Tools (all `readOnlyHint: true`)

| Tool | Question it answers |
|---|---|
| `triage_today` | Who should the care team call today, across every module? (C3 urgent first) |
| `list_survivors` | Roster for one module, filtered by status, urgent-only (C3) or free text |
| `get_survivor` | One survivor's panel: headline, summary, evidence, recommendations (charts are opt-in) |
| `patient_overview` | One survivor across all modules, with their roster rank, and a statement that ids do not join |
| `module_metrics` | Model card or cohort findings for C1, C3 or C4, trimmed |
| `glucose_advice` | C4 advice in plain language, from a model and checked against the evidence |
| `reveal_outcome_demo` | Demo only: what happened after the C3 forecast. Never in a coach view |
| `list_coaching_calls` / `get_coaching_call` | Supervisor-labelled C5 calls and transcripts |
| `score_conversation` | Live C5 tagging of a transcript or a `callId`: MI tags, flags, MITI-style score, cue moments, and agreement with the supervisor |
| `coaching_cue` | What the coach should say next. The trigger comes from the Co-pilot's own rules, or from the caller |
| `search` / `fetch` | The pair that ChatGPT deep research and company-knowledge connectors expect |

Each result has a short text summary, then the compact JSON (also in `structuredContent`). An error, such as an unknown id, comes back as `isError: true`.

### C5 scoring

The scoring follows `coach-copilot/public/index.html` (`updateScore`, `checkTriggers`, `CUE_GAP = 3`):

- **Tagging order.** Participant lines are tagged first, 4 at a time. Then the coach lines are tagged, with `previous` carrying the participant flags. `/api/turn` uses those flags to raise `missed_concern`.
- **Score.** 30 points for 2 reflections per question. 20 points for 40% complex reflections. 20 points for 50% open questions. 30 points for MI-consistent moves vs persuade/confront. The total is rounded once, and the score is `null` below 4 coach lines.
- **Limit.** A transcript can have at most 40 lines, because each line is one Workers AI call.

## Run

```sh
npm install
npm run deploy                 # wrangler deploy -> emerge-mcp.raava.dev + workers.dev
npm run e2e                    # official MCP client vs the deployment: initialize, tools/list, every tool -> runs/
npm run e2e:domain             # raw JSON-RPC curl check of the custom domain
```

The E2E makes 4 C5 model requests (one 7-line transcript, one stored call of 33 lines, one cue, one bad input). Do not loop it.
