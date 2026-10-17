# challenge-mcp numbers 2026-10-17T18:39:27.437Z

Regenerated from the module APIs directly; compared with https://emerge-mcp.raava.dev/mcp (module_metrics; commit a95f6d9, deploy d8b028c4-f3f8-4bd3-ba77-3739ccccee2d) and README.md. 15/15 match.

| | Number | Regenerated | Live MCP | In README |
|---|---|---|---|---|
| OK | C1 nested-CV AUROC (model) | 0.711 | 0.711 | yes |
| OK | C1 nested-CV AUROC (baseline) | 0.672 | 0.672 | yes |
| OK | C1 nested-CV gain | 0.039 | 0.039 | yes |
| OK | C1 nested-CV gain 95% CI | [-0.015,0.091] | [-0.015,0.091] | yes |
| OK | C1 out-of-fold gain (forest, optimistic) | 0.053 | 0.053 | yes |
| OK | C1 subgroups flagged weak | ["NH Black"] | ["NH Black"] | n/a |
| OK | C3 recall by language | ["English 0.267","Haitian Creole 0.217","Spanish 0.31"] | ["English 0.267","Haitian Creole 0.217","Spanish 0.31"] | n/a |
| OK | C5 r vs supervisor A | 0.751 | 0.751 | yes |
| OK | C5 r vs supervisor B | 0.701 | 0.701 | yes |
| OK | C5 r supervisor A vs B (baseline) | 0.692 | 0.692 | yes |
| OK | C5 calls in the validation | 477 | 477 | yes |
| OK | C5 flags by language | ["English 6/6 caught, 7/16696 false-alarm lines","Spanish 7/7 caught, 2/9089 false-alarm lines"] | ["English 6/6 caught, 7/16696 false-alarm lines","Spanish 7/7 caught, 2/9089 false-alarm lines"] | n/a |
| OK | C5 flag recall | "13/13" | "13/13" | yes |
| OK | n=1 check (CALL05559, 2026-10-17T18-38-48-736Z.json): coach agreement | "17/18 = 0.94, CI 0.74-0.99, majority 0.22" | n/a | yes |
| OK | n=1 check (CALL05559, 2026-10-17T18-38-48-736Z.json): participant agreement | "13/15 = 0.87, CI 0.62-0.96, majority 0.53" | n/a | yes |