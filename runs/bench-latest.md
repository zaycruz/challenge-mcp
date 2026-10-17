# challenge-mcp bench 2026-10-17T17:37:45.042Z

Server: https://emerge-mcp.raava.dev/mcp. Client-side wall time per tool call (from this machine), 40 calls. Cost is an estimate: Workers AI list prices x tokens estimated at 4 characters per token; C5 tagging bills input only. Full rows: runs/bench-2026-10-17T17-37-45-042Z.json

| Tool | n | p50 ms | p95 ms | max ms | errors | degraded | est. USD per call |
|---|---|---|---|---|---|---|---|
| glucose_advice (C4 precomputed rewrite) | 8 | 210 | 370 | 370 | 0 | 0 | 0 (no model) |
| glucose_advice (this server's cache) | 8 | 132 | 425 | 425 | 0 | 0 | 0 (no model) |
| score_conversation | 4 | 983 | 1083 | 1083 | 0 | 0 | $0.00077 |
| coaching_cue (live model) | 6 | 2536 | 8293 | 8293 | 0 | 0 | $0.00008 |
| triage_today | 5 | 53 | 146 | 146 | 0 | 0 | 0 (no model) |
| search | 5 | 75 | 121 | 121 | 0 | 0 | 0 (no model) |
| module_metrics | 4 | 98 | 185 | 185 | 0 | 0 | 0 (no model) |