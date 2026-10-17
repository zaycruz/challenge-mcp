# emerge-mcp.raava.dev check 2026-10-17T15:21:35Z
## initialize
{"protocolVersion":"2025-06-18","serverInfo":{"name":"emerge-challenge-mcp","title":"Emerge Hackathon challenge APIs","version":"0.1.0"}}
## tools/list
13 tools: triage_today, list_survivors, get_survivor, patient_overview, module_metrics, glucose_advice, reveal_outcome_demo, list_coaching_calls, get_coaching_call, score_conversation, coaching_cue, search, fetch
## tools/call triage_today {limit:3}
71 survivors need attention (2 urgent, C3 ER/hospital risk in 7 days). Per module: c1 {"alert":41,"watch":41,"ok":117}; c3 {"alert":10,"watch":2,"ok":48}; c4 {"alert":11,"watch":10,"ok":29}; c5 {"alert":9,"watch":6,"ok":11}.
- c3-P02185 [alert, URGENT] P02185 · 42M · lymphoma: Urgent: ER or hospital risk 6% in the next 7 days, about 5x usual
- c3-P03000 [alert, URGENT] P03000 · 49M · kidney: Urgent: ER or hospital risk 10% in the next 7 days, about 9x usual
- c1-S2480BBDE [alert] S2480BBDE · 61F · other: Acute care risk 73% for 2018 (high), driven by ER visits last year
…and 68 more (raise limit).
## GET /mcp (expect 405: stateless, no SSE stream)
405
