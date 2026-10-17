# challenge-mcp E2E 2026-10-17T18:36:56.451Z

Server: https://emerge-mcp.raava.dev/mcp (emerge-challenge-mcp 0.4.3, commit 5177cc8, deploy 55e973a3-9318-43ba-bb41-a700922ee9f7). 117/117 checks passed in 39.4 s.
Full run: runs/2026-10-17T18-36-56-451Z.json

| | Check | Detail |
|---|---|---|
| PASS | initialize | {"name":"emerge-challenge-mcp","title":"Emerge Hackathon challenge APIs","version":"0.4.3"} |
| PASS | tools/list has every tool | triage_today, list_survivors, get_survivor, patient_overview, module_metrics, glucose_advice, list_coaching_calls, get_coaching_call, score_conversation, coachi |
| PASS | every tool has a non-empty input schema | all have properties |
| PASS | default tools/list hides reveal_outcome_demo |  |
| PASS | every tool is marked readOnlyHint |  |
| PASS | every tool declares an outputSchema (object, with required fields) | all 12 |
| PASS | unknown tool is a JSON-RPC error -32602 naming only the tool | {"jsonrpc":"2.0","id":7,"error":{"code":-32602,"message":"Unknown tool: no_such_tool"}} |
| PASS | every tool has a description of 40+ chars |  |
| PASS | triage_today succeeds (225 ms) |  |
| PASS | triage defaults to a short list (10) | 10 of 65 |
| PASS | triage counts all 4 cohorts | {"c1":{"alert":40,"watch":43,"ok":116},"c3":{"alert":5,"watch":4,"ok":51},"c4":{"alert":11,"watch":10,"ok":29},"c5":{"alert":9,"watch":6,"ok":11}} |
| PASS | triage lists urgent C3 first | c3-P03000 |
| PASS | triage rows have rank, cohort and their own reason |  |
| PASS | triage mixes cohorts in the top 10 | c3,c3,c1,c3,c4,c5,c1,c3,c4,c5 |
| PASS | triage says cohorts are not joined |  |
| PASS | triage rows carry horizon and scale | c3: next 7 days; c1: next 12 months; c4: recent CGM days; c5: latest coaching call |
| PASS | triage says risks are not comparable across cohorts |  |
| PASS | triage_today succeeds (103 ms) |  |
| PASS | triage caps at 25 |  |
| PASS | triage_today returns isError (113 ms) | Bad arguments for triage_today: Too big: expected number to be <=25 at limit. See the tool's input schema in tools/list. |
| PASS | list_survivors succeeds (103 ms) |  |
| PASS | list_survivors c1 returns rows | 199 total, first c1-S71188550 |
| PASS | list_survivors succeeds (71 ms) |  |
| PASS | list_survivors c3 returns rows | 60 total, first c3-P03000 |
| PASS | list_survivors succeeds (142 ms) |  |
| PASS | list_survivors c4 returns rows | 50 total, first c4-N0072 |
| PASS | list_survivors succeeds (144 ms) |  |
| PASS | list_survivors c5 returns rows | 26 total, first c5-P0002 |
| PASS | list_survivors succeeds (98 ms) |  |
| PASS | list_survivors filters by text and status | 11 matched |
| PASS | list_survivors succeeds (112 ms) |  |
| PASS | list_survivors urgentOnly | 2 urgent |
| PASS | get_survivor succeeds (134 ms) |  |
| PASS | get_survivor c1 has headline + evidence/recommendations | c1-S71188550 |
| PASS | get_survivor succeeds (212 ms) |  |
| PASS | get_survivor c3 has headline + evidence/recommendations | c3-P03000 |
| PASS | get_survivor c3 hides the outcome |  |
| PASS | get_survivor succeeds (167 ms) |  |
| PASS | get_survivor c4 has headline + evidence/recommendations | c4-N0072 |
| PASS | get_survivor succeeds (206 ms) |  |
| PASS | get_survivor c5 has headline + evidence/recommendations | c5-P0002 |
| PASS | get_survivor succeeds (149 ms) |  |
| PASS | get_survivor c3 charts trimmed to 14 days |  |
| PASS | get_survivor returns isError (269 ms) | Error: Not found. C1 Care Team Risk returned 404: survivor not found |
| PASS | errors do not leak upstream paths | Error: Not found. C1 Care Team Risk returned 404: survivor not found |
| PASS | module_metrics returns isError (214 ms) | Bad arguments for module_metrics: Invalid option: expected one of "c1"/"c3"/"c4"/"c5" at module. See the tool's input schema in tools/list. |
| PASS | bad arguments get a plain message, not the SDK's validation dump | Bad arguments for module_metrics: Invalid option: expected one of "c1"/"c3"/"c4"/"c5" at module. See the tool's input schema in tools/list. |
| PASS | /health ties the server to a commit, a deploy and model ids | {"gitSha":"5177cc8","deployId":"55e973a3-9318-43ba-bb41-a700922ee9f7","deployedAt":"2026-10-17T18:36:32.451114Z"} |
| PASS | get_survivor returns isError (190 ms) | Error: survivorId must start with c1-, c3-, c4- or c5- (got "x9-123") |
| PASS | patient_overview succeeds (261 ms) |  |
| PASS | patient_overview says ids do not join | {"c1":{"enrolled":false},"c3":{"enrolled":true,"survivorId":"c3-P03000","status":"alert","headline":"Urgent review: about 6x the usual ER or hospital risk this  |
| PASS | module_metrics succeeds (65 ms) |  |
| PASS | module_metrics c1 reads the live finalModel | forest AUROC 0.713 |
| PASS | module_metrics c1 gives the gain over baseline with a CI | out-of-fold, forest vs baseline on the same repeated 5-fold CV. Optimistic: the model search chose forest using these folds. Use headlineGain (nested CV) as the |
| PASS | module_metrics c1 leads with the nested-CV gain and names both | C1 live model: Random forest (300 trees (forest). Honest estimate (nested CV, the model search re-run inside each outer fold): AUROC 0.711 vs baseline 0.672, ga |
| PASS | module_metrics c1 has subgroups | 19 rows: age, sex, race_ethnicity, insurance, cancer_type |
| PASS | module_metrics c1 is compact | 9841 chars |
| PASS | module_metrics succeeds (64 ms) |  |
| PASS | module_metrics c3 has model and baseline | 0.827 vs 0.808 |
| PASS | module_metrics c3 has subgroups | 34 rows: Language, Race and ethnicity, Cancer type, Sex, Age, Lives alone, Device |
| PASS | module_metrics c3 subgroups include language |  |
| PASS | module_metrics c3 is compact | 8819 chars |
| PASS | module_metrics succeeds (124 ms) |  |
| PASS | module_metrics c4 has subgroups | 6 rows: blood-sugar group |
| PASS | module_metrics c4 is compact | 8382 chars |
| PASS | module_metrics succeeds (72 ms) |  |
| PASS | module_metrics c5 relays the 477-call validation per supervisor | C5 coach score on 477 held-out supervisor-rated calls: Pearson r 0.751 (95% CI 0.708 to 0.788) vs supervisor A and 0.701 (0.657 to 0.739) vs supervisor B; the t |
| PASS | module_metrics c5 labels this server's own check n = 1 |  |
| PASS | module_metrics c5 subgroups give flags by language | [["English",6,6],["Spanish",7,7]] |
| PASS | glucose_advice succeeds (149 ms) |  |
| PASS | glucose_advice returns advice items | ai,ai,ai |
| PASS | glucose_advice reports timing and model calls | {"ms":26,"modelCalls":0,"retries":0,"failedCalls":0,"cached":true} |
| PASS | glucose_advice succeeds (52 ms) |  |
| PASS | glucose_advice second call is served from cache | {"ms":6,"modelCalls":0,"retries":0,"failedCalls":0,"cached":true} |
| PASS | reveal_outcome_demo returns isError (46 ms) | protocol error: MCP error -32602: Unknown tool: reveal_outcome_demo |
| PASS | ?tools=demo lists reveal_outcome_demo |  |
| PASS | reveal_outcome_demo works on ?tools=demo |  |
| PASS | list_coaching_calls succeeds (62 ms) |  |
| PASS | list_coaching_calls returns calls | 27 calls |
| PASS | get_coaching_call succeeds (63 ms) |  |
| PASS | get_coaching_call has a transcript | CALL05559, 33 lines |
| PASS | get_coaching_call returns isError (98 ms) | Error: Not found. C5 Coach's Co-pilot returned 404: call not found |
| PASS | score_conversation succeeds (1604 ms) |  |
| PASS | score_conversation flags the symptom line medical | {"n":2,"speaker":"participant","text":"Not great. I've had a fever since yesterday and my chest feels tight.","tag":"neutral","flag":"medical","confidence":0.08 |
| PASS | score_conversation carries the flag: next coach line is missed_concern | {"n":3,"speaker":"coach","text":"Okay. So did you manage to do the walks after dinner?","tag":"closed question","flag":"missed_concern","confidence":0.311} |
| PASS | score_conversation tags every line | open question / neutral / closed question / neutral / persuade / change / open question |
| PASS | score_conversation scores (4 coach lines) | score 20 |
| PASS | score_conversation finds cue moments | [{"afterLine":2,"trigger":"Participant raised a medical concern. Help the coach respond with care and connect them to the right person today."},{"afterLine":3," |
| PASS | score_conversation succeeds (7290 ms) |  |
| PASS | score_conversation on a stored call compares with the supervisor | {"supervisorScoreFullCall":55,"supervisorScoreSameLines":55,"coachMoveAgreement":0.94,"participantTalkAgreement":0.87,"supervisorNeedsHumanLines":[]} |
| PASS | coaching_cue succeeds (211 ms) |  |
| PASS | coaching_cue uses the Co-pilot rule for a missed concern | The participant raised a concern and the coach moved on without routing it. Help the coach go back to it now. |
| PASS | coaching_cue returns a cue | Stop the plan talk and acknowledge her symptoms; invite her to say more and consider how she's feeling, e.g. checking in on the fever/chest tightness before any |
| PASS | score_conversation returns isError (65 ms) | Error: cannot read the speaker in "hello there"; start each line with "coach:" or "participant:" |
| PASS | search succeeds (139 ms) |  |
| PASS | search returns results with id/title/url | 2 results |
| PASS | fetch succeeds (34 ms) |  |
| PASS | fetch returns id/title/text/url |  |
| PASS | search succeeds (42 ms) |  |
| PASS | search "night shift": every hit matched the phrase in a tag or the headline, and says so | c4-N0072 (tag "Night shift"); c4-N0731 (tag "Night shift") |
| PASS | search succeeds (87 ms) |  |
| PASS | search "c3-P03000": an exact id comes first | c3-P03000 (id) |
| PASS | search succeeds (81 ms) |  |
| PASS | search "urgent": urgent survivors come first | c3-P03000 (headline); c3-P02185 (headline) |
| PASS | search succeeds (34 ms) |  |
| PASS | search "breast alert": every hit is an alert and mentions breast | c1-S9707145E (all words (breast, alert)); c1-S93CB4E8B (all words (breast, alert)); c1-S54288CF4 (all words (breast, alert)) |
| PASS | search succeeds (29 ms) |  |
| PASS | search "zzqx nothing": no false hits | no results |
| PASS | model down: glucose_advice falls back to C4's template advice | 3 items; C4 Glucose Guide advice model returned 503: injected fault: model down (after 2 tries) |
| PASS | model down: glucose_advice retried once | {"ms":441,"modelCalls":2,"retries":1,"failedCalls":1,"cached":false,"upstreamCached":false} |
| PASS | model down: coaching_cue gives the rule-based fallback cue | Pause the plan. Reflect what the participant just said, ask one open question about it, and offer to connect them with the care team today. |
| PASS | model down: score_conversation says the model failed instead of scoring | Error: The C5 tagging model failed on 4 of 4 lines (after a retry each): C5 Co-pilot model returned 503: injected fault: model down (after 2 tries). No score wa |
| PASS | model hangs: glucose_advice times out (9 s, one retry) and falls back | 18492 ms; C4 Glucose Guide advice model did not answer within 9 s (after 2 tries) |
| PASS | unknown bearer key gets 401 | 401 {"jsonrpc":"2.0","error":{"code":-32001,"message":"Unauthorized: unknown bearer key. Omit the Authorization header to us |
| PASS | a valid bearer key connects and lists tools |  |
| PASS | model-backed tools are rate-limited per IP | limited after 22 probe calls: Error: Rate limit: score_conversation calls a live model. Each anonymous client IP may make 20 such calls per minute (sc |
| PASS | every successful call returns structuredContent (validated by the SDK client against outputSchema) | 35 calls |

## Tool summaries (first text block of each call)

### triage_today {}

```
Top 10 of 65 survivors needing attention (2 urgent). Each row is labelled with its cohort. The four cohorts are separate groups of people and are not joined: the same person never appears in two of them. Risks are not comparable across cohorts: each cohort measures a different outcome over a different horizon on a different scale (see horizon and scale on each row). The order between cohorts is round-robin after C3 urgent, not a ranking by risk.
1. c3-P03000 [alert, URGENT] C3 Bad Week Radar: Urgent review: about 6x the usual ER or hospital risk this week. A prompt to check in, not a prediction (next 7 days)
2. c3-P02185 [alert, URGENT] C3 Bad Week Radar: Urgent review: about 6x the usual ER or hospital risk this week. A prompt to check in, not a prediction (next 7 days)
3. c1-S71188550 [alert] C1 Care Team Risk: Acute care risk 70% for 2018 (high), driven by nights in hospital last year (next 12 months)
4. c3-P02465 [alert] C3 Bad Week Radar: Rough patch risk 51% in the next 7 days, driven by sleep (next 7 days)
5. c4-N0072 [alert] C4 Glucose Guide: High most of the day: 63% in range, average 178 mg/dL (recent CGM days)
6. c5-P0002 [alert] C5 Coach's Co-pilot: Medical concern at 06:18 in call 5: a person must follow up today (latest coaching call)
7. c1-S13BA2BCD [alert] C1 Care Team Risk: Acute care risk 65% for 2018 (high), driven by nights in hospital last year (next 12 months)
8. c3-P02836 [alert] C3 Bad Week Radar: Rough patch risk 34% in the next 7 days, driven by goin
```
### triage_today {"limit":25,"includeWatch":true}

```
Top 25 of 128 survivors needing attention (2 urgent). Each row is labelled with its cohort. The four cohorts are separate groups of people and are not joined: the same person never appears in two of them. Risks are not comparable across cohorts: each cohort measures a different outcome over a different horizon on a different scale (see horizon and scale on each row). The order between cohorts is round-robin after C3 urgent, not a ranking by risk.
1. c3-P03000 [alert, URGENT] C3 Bad Week Radar: Urgent review: about 6x the usual ER or hospital risk this week. A prompt to check in, not a prediction (next 7 days)
2. c3-P02185 [alert, URGENT] C3 Bad Week Radar: Urgent review: about 6x the usual ER or hospital risk this week. A prompt to check in, not a prediction (next 7 days)
3. c1-S71188550 [alert] C1 Care Team Risk: Acute care risk 70% for 2018 (high), driven by nights in hospital last year (next 12 months)
4. c3-P02465 [alert] C3 Bad Week Radar: Rough patch risk 51% in the next 7 days, driven by sleep (next 7 days)
5. c4-N0072 [alert] C4 Glucose Guide: High most of the day: 63% in range, average 178 mg/dL (recent CGM days)
6. c5-P0002 [alert] C5 Coach's Co-pilot: Medical concern at 06:18 in call 5: a person must follow up today (latest coaching call)
7. c1-S13BA2BCD [alert] C1 Care Team Risk: Acute care risk 65% for 2018 (high), driven by nights in hospital last year (next 12 months)
8. c3-P02836 [alert] C3 Bad Week Radar: Rough patch risk 34% in the next 7 days, driven by goi
```
### triage_today {"limit":26}

```
Bad arguments for triage_today: Too big: expected number to be <=25 at limit. See the tool's input schema in tools/list.
```
### list_survivors {"module":"c1","limit":3}

```
C1 Care Team Risk: 199 of 199 survivors match ({"alert":40,"watch":43,"ok":116} overall).
- c1-S71188550 [alert] S71188550 · 85M · prostate: Acute care risk 70% for 2018 (high), driven by nights in hospital last year
- c1-S13BA2BCD [alert] S13BA2BCD · 67F · other: Acute care risk 65% for 2018 (high), driven by nights in hospital last year
- c1-S9707145E [alert] S9707145E · 74F · breast: Acute care risk 65% for 2018 (high), driven by nights in hospital last year
```
### list_survivors {"module":"c3","limit":3}

```
C3 Bad Week Radar: 60 of 60 survivors match ({"alert":5,"watch":4,"ok":51} overall).
- c3-P03000 [alert, URGENT] P03000 · 49M · kidney: Urgent review: about 6x the usual ER or hospital risk this week. A prompt to check in, not a prediction
- c3-P02185 [alert, URGENT] P02185 · 42M · lymphoma: Urgent review: about 6x the usual ER or hospital risk this week. A prompt to check in, not a prediction
- c3-P02465 [alert] P02465 · 59M · bladder: Rough patch risk 51% in the next 7 days, driven by sleep
```
### list_survivors {"module":"c4","limit":3}

```
C4 Glucose Guide: 50 of 50 survivors match ({"alert":11,"watch":10,"ok":29} overall).
- c4-N0072 [alert] N0072 · 61F · ovarian: High most of the day: 63% in range, average 178 mg/dL
- c4-N0085 [alert] N0085 · 67M · melanoma: High most of the day: 64% in range, average 177 mg/dL
- c4-N0632 [alert] N0632 · 76F · colorectal: Frequent lows: 5.3% of readings below 70
```
### list_survivors {"module":"c5","limit":3}

```
C5 Coach's Co-pilot: 26 of 26 survivors match ({"alert":9,"watch":6,"ok":11} overall).
- c5-P0002 [alert] María · 52F · colorectal: Medical concern at 06:18 in call 5: a person must follow up today
- c5-P0117 [alert] Yolanda · 57F · colorectal: Medical concern at 00:21 in call 5: a person must follow up today
- c5-P0268 [alert] Miguel · 48M · kidney: Medical concern at 05:42 in call 5: a person must follow up today
```
### list_survivors {"module":"c1","query":"breast","status":"alert"}

```
C1 Care Team Risk: 11 of 199 survivors match ({"alert":40,"watch":43,"ok":116} overall).
- c1-S9707145E [alert] S9707145E · 74F · breast: Acute care risk 65% for 2018 (high), driven by nights in hospital last year
- c1-S93CB4E8B [alert] S93CB4E8B · 79F · breast: Acute care risk 64% for 2018 (high), driven by nights in hospital last year
- c1-S54288CF4 [alert] S54288CF4 · 63F · breast: Acute care risk 64% for 2018 (high), driven by nights in hospital last year
- c1-SE3556D56 [alert] SE3556D56 · 55F · breast: Acute care risk 56% for 2018 (high), driven by nights in hospital last year
- c1-S07D2544C [alert] S07D2544C · 72F · breast: Acute care risk 56% for 2018 (high), driven by nights in hospital last year
- c1-SE1AECC69 [alert] SE1AECC69 · 62F · breast: Acute care risk 55% for 2018 (high), driven by nights in hospital last year
- c1-SF969193E [alert] SF969193E · 74F · breast: Acute care risk 52% for 2018 (high), driven by ER visits last year
- c1-S9C4B6DE7 [alert] S9C4B6DE7 · 63F · breast: Acute care risk 49% for 2018 (high), driven by ER visits last year
- c1-S1805EC9A [alert] S1805EC9A · 70F · breast: Acute care risk 48% for 2018 (high), driven by nights in hospital last year
- c1-S2933E9D5 [alert] S2933E9D5 · 72F · breast: Acute care risk 47% for 2018 (high), driven by low mental health score
- c1-S7FA9558D [alert] S7FA9558D · 85F · breast: Acute care risk 47% for 2018 (high), driven by age
```
### list_survivors {"module":"c3","urgentOnly":true}

```
C3 Bad Week Radar: 2 of 60 survivors match ({"alert":5,"watch":4,"ok":51} overall).
- c3-P03000 [alert, URGENT] P03000 · 49M · kidney: Urgent review: about 6x the usual ER or hospital risk this week. A prompt to check in, not a prediction
- c3-P02185 [alert, URGENT] P02185 · 42M · lymphoma: Urgent review: about 6x the usual ER or hospital risk this week. A prompt to check in, not a prediction
```
### get_survivor {"survivorId":"c1-S71188550"}

```
C1 Care Team Risk · S71188550 · 85M · prostate · ALERT
Acute care risk 70% for 2018 (high), driven by nights in hospital last year
70% predicted chance of an ER visit or hospital stay in 2018 (average survivor 29%). Status alert: alert from 43%, watch from 29%. Main drivers: $44,900 total health spending in 2017 (median survivor about $6,700); 26 night(s) in hospital in 2017; Age 85 or older (top-coded).
Next steps:
- [care-team] Add to the proactive outreach list: a nurse call in the next 2 weeks and a clear same-day contact route instead of the ER.
- [care-team] High care use last year: review what drove it and whether one team owns the plan.
- [care-team] Nights in hospital last year: confirm a discharge follow-up plan and who to call first.
- [care-team] Older age: a lower bar for proactive check-ins is reasonable.
```
### get_survivor {"survivorId":"c3-P03000"}

```
C3 Bad Week Radar · P03000 · 49M · kidney · ALERT · URGENT
Urgent review: about 6x the usual ER or hospital risk this week. A prompt to check in, not a prediction
Urgent review: their wearable and calendar pattern puts them in the top 3% for ER or hospital risk. Flags like this carry about 6x the usual risk, but most are false alarms: about 1 in 14 is followed by an ER visit or admission within 7 days. Risk of a rough patch in the next 7 days: 8% (alert line 16%). The treatment calendar alone gives 2%; their check-ins move it +0 points and wearable signals +6. Biggest driver: Sleep efficiency 82% vs usual 88%, waking 3.0x a night vs 2.0x, 6.4 h asleep vs 6.9 h.
Next steps:
- [today] Call today. Ask how they feel, about fever, fluids and anything new. If anything is off, have them call their care team now.
- [within 2 days] Check in this week about sleep: nights, naps, worries. Share the sleep tips sheet.
- [this week] Move the next coaching call earlier and plan around the expected low point.
- [this week] Reach out in Spanish, or book an interpreter for the call.
```
### get_survivor {"survivorId":"c4-N0072"}

```
C4 Glucose Guide · N0072 · 61F · ovarian · ALERT
High most of the day: 63% in range, average 178 mg/dL
61-year-old female, ovarian cancer, 1.7 years after treatment; type 2 diabetes at start; group: coaching; night shift. Average sugar 178 mg/dL in weeks 1-2, 63% of readings in range. Median rise after dinner 108 mg/dL. ML forecast for a typical dinner: 106 mg/dL. Synthetic participant (made-up data).
Next steps:
- 10.9% of your readings were above 250 mg/dL (weeks 1-2); the usual target is under 5%. Your average was 178.3 mg/dL. Contact your care team this week rather than waiting for your next visit.
- In real adults (CGMacros), a walk after a meal went with a rise only about 3.2 mg/dL smaller (95% CI -6.9 to 0.5): not distinguishable from zero. You walked after 0 of your scored meals, too few to measure your own effect yet. In the synthetic program, a walk after dinner went with a rise about 18.3 mg/dL smaller in the same person, more than after other meals (14.6 mg/dL). 10 to 19 minutes got most of the gain: 17.5 mg/dL less, against 19.5 for 20-29 minutes and 16.6 for 30+ minutes. If you take insulin or a sulfonylurea (glipizide, glyburide, glimepiride), ask your care team about low sugar before adding walks after meals.
- You work nights, so clock-time rules about late dinners don't fit you. Keep your main meal at the same point in your waking day.
```
### get_survivor {"survivorId":"c5-P0002"}

```
C5 Coach's Co-pilot · María · 52F · colorectal · ALERT
Medical concern at 06:18 in call 5: a person must follow up today
52-year-old female, colorectal cancer. Program focus: movement. Calls in English. Coach Kendra (exercise coach).
Next steps:
- [today] Tell the care team today and log the hand-off.
```
### get_survivor {"survivorId":"c3-P03000","includeCharts":true}

```
C3 Bad Week Radar · P03000 · 49M · kidney · ALERT · URGENT
Urgent review: about 6x the usual ER or hospital risk this week. A prompt to check in, not a prediction
Urgent review: their wearable and calendar pattern puts them in the top 3% for ER or hospital risk. Flags like this carry about 6x the usual risk, but most are false alarms: about 1 in 14 is followed by an ER visit or admission within 7 days. Risk of a rough patch in the next 7 days: 8% (alert line 16%). The treatment calendar alone gives 2%; their check-ins move it +0 points and wearable signals +6. Biggest driver: Sleep efficiency 82% vs usual 88%, waking 3.0x a night vs 2.0x, 6.4 h asleep vs 6.9 h.
Next steps:
- [today] Call today. Ask how they feel, about fever, fluids and anything new. If anything is off, have them call their care team now.
- [within 2 days] Check in this week about sleep: nights, naps, worries. Share the sleep tips sheet.
- [this week] Move the next coaching call earlier and plan around the expected low point.
- [this week] Reach out in Spanish, or book an interpreter for the call.
```
### get_survivor {"survivorId":"c1-NOPE"}

```
Error: Not found. C1 Care Team Risk returned 404: survivor not found
```
### module_metrics {"module":"c9"}

```
Bad arguments for module_metrics: Invalid option: expected one of "c1"|"c3"|"c4"|"c5" at module. See the tool's input schema in tools/list.
```
### get_survivor {"survivorId":"x9-123"}

```
Error: survivorId must start with c1-, c3-, c4- or c5- (got "x9-123")
```
### patient_overview {"survivorId":"c3-P03000"}

```
P03000 · 49M · kidney: ALERT in C3 Bad Week Radar (1 of 60). Urgent review: about 6x the usual ER or hospital risk this week. A prompt to check in, not a prediction
Found in: c3. Not found in: c1, c4, c5. The modules use separate cohorts: C1 ids are c1-S…, C3 c3-P0…(5 digits), C4 c4-N…, C5 c5-P0…(4 digits). No id appears in two modules, so one person has data in one module only.
```
### module_metrics {"module":"c1"}

```
C1 live model: Random forest (300 trees (forest). Honest estimate (nested CV, the model search re-run inside each outer fold): AUROC 0.711 vs baseline 0.672, gain +0.039 (95% CI -0.015 to 0.091, not significant: the CI crosses 0); this is the "nested CV +0.04" in the caveats. Log loss -0.067 (95% CI -0.115 to -0.020, significant). Out-of-fold for the chosen forest (optimistic, because the search saw these folds): AUROC 0.713 (95% CI 0.662 to 0.764) vs baseline 0.659, gain +0.053 (95% CI -0.001 to 0.105). The two baselines differ (0.659 vs 0.672) because they come from different CV runs. Held-out status mix {"alert":40,"watch":43,"ok":116}.
Subgroups: Weaker for: NH Black (AUROC 0.48). Too small to judge: Hispanic, NH Asian, NH other/multiple, Uninsured, colon, lung. C1 has no language field.
```
### module_metrics {"module":"c3"}

```
C3 Radar on held-out patients: week AUC 0.827 vs schedule-only 0.808; rough-patch episode recall 0.476 vs 0.359; ER/admission recall 0.363 vs 0.22; median lead 6 days.
Subgroups: Recall is clearly below the overall 28% (whole CI below it) for: Cancer type sarcoma (13%, CI 0%-26%). Lower, but the CI still reaches the overall (too few patients to be sure): Language Haitian Creole (22%, CI 10%-36%); Cancer type breast (21%, CI 14%-28%). Groups with fewer than 30 rough weeks are marked too few to judge.
```
### module_metrics {"module":"c4"}

```
C4 cohort (within-person, mg/dL change in post-meal rise): walk after a meal -17.77 [-19.19, -16.35]; late dinner +9.21 [7.09, 11.32]; per 10 g carbs +6.46.
Subgroups: C4 serves effects by blood-sugar group only. It serves no age, sex, race/ethnicity or language breakdown, so none is shown.
```
### module_metrics {"module":"c5"}

```
C5 coach score on 477 held-out supervisor-rated calls: Pearson r 0.751 (95% CI 0.708 to 0.788) vs supervisor A and 0.701 (0.657 to 0.739) vs supervisor B; the two supervisors agree at r 0.692 (0.64 to 0.736), so the app is on par with a second supervisor. Flag recall 13/13 (95% CI 0.7719 to 1); false alarms 9 in 25785 lines.
Subgroups: English flags caught 6/6, false alarms 7 in 16696 lines; Spanish flags caught 7/7, false alarms 2 in 9089 lines.
```
### glucose_advice {"survivorId":"c4-N0072"}

```
Plain-language advice for c4-N0072:
- Send these readings to your care team today: Your average blood sugar was 178.3 mg/dL, which is higher than the target. Contact your care team today to discuss your readings.
- Try a 10 to 20 minute walk after dinner: Walking after dinner is linked to a rise about 18.3 mg/dL smaller in blood sugar. Walking 10 to 19 minutes after dinner got most of the gain, with a rise 17.5 mg/dL smaller.
- Keep meal times steady around your shifts: Since you work nights, traditional rules about late dinners don't apply to you. Keep your main meal at the same point in your waking day.
(cached; 26 ms)
```
### glucose_advice {"survivorId":"c4-N0072"}

```
Plain-language advice for c4-N0072:
- Send these readings to your care team today: Your average blood sugar was 178.3 mg/dL, which is higher than the target. Contact your care team today to discuss your readings.
- Try a 10 to 20 minute walk after dinner: Walking after dinner is linked to a rise about 18.3 mg/dL smaller in blood sugar. Walking 10 to 19 minutes after dinner got most of the gain, with a rise 17.5 mg/dL smaller.
- Keep meal times steady around your shifts: Since you work nights, traditional rules about late dinners don't apply to you. Keep your main meal at the same point in your waking day.
(cached; 6 ms)
```
### reveal_outcome_demo {"survivorId":"c3-P03000"}

```
protocol error: MCP error -32602: Unknown tool: reveal_outcome_demo
```
### reveal_outcome_demo (?tools=demo) {"survivorId":"c3-P03000"}

```
DEMO ONLY (hidden from coaches). Forecast for c3-P03000: alert, urgent, rough-patch risk 0.078. What happened: rough patch did not start in 14 days; ER/admission none in 14 days.
```
### list_coaching_calls {"limit":30}

```
27 calls match.
- CALL00646 Yolanda (c5-P0117) 2025-09-02, coach Jean: score 41/100, 1 flagged line(s) [alert]
- CALL02285 Osvaldo (c5-P0407) 2025-03-19, coach Jorge: score 46/100, 1 flagged line(s) [alert]
- CALL01610 Rosa (c5-P0286) 2026-03-30, coach Marisol: score 63/100, 1 flagged line(s) [alert]
- CALL01506 Miguel (c5-P0268) 2025-06-10, coach Marisol: score 64/100, 1 flagged line(s) [alert]
- CALL01808 Chris (c5-P0322) 2025-10-13, coach Yolanda: score 72/100, 1 flagged line(s) [alert]
- CALL02196 Barbara (c5-P0392) 2026-02-09, coach Marisol: score 76/100, 1 flagged line(s) [alert]
- CALL00009 María (c5-P0002) 2025-08-18, coach Kendra: score 81/100, 1 flagged line(s) [alert]
- CALL05423 Donna (c5-P0975) 2025-09-17, coach Beth: score 82/100, 1 flagged line(s) [alert]
- CALL03019 Rosa (c5-P0540) 2025-01-06, coach Rachel: score 93/100, 1 flagged line(s) [alert]
- CALL04924 Jorge (c5-P0886) 2025-05-20, coach Marcus: score 41/100, 0 flagged line(s) [watch]
- CALL03228 Linda (c5-P0576) 2025-04-28, coach Marcus: score 45/100, 0 flagged line(s) [watch]
- CALL04563 Nadège (c5-P0820) 2025-12-23, coach Jean: score 54/100, 0 flagged line(s) [watch]
- CALL05559 Karen (c5-P0998) 2025-04-08, coach Marcus: score 55/100, 0 flagged line(s) [watch]
- CALL04019 Sam (c5-P0719) 2025-07-28, coach Marcus: score 57/100, 0 flagged line(s) [watch]
- CALL02622 Marta (c5-P0468) 2025-11-25, coach Luis: score 58/100, 0 flagged line(s) [watch]
- CALL01697 Fabiola (c5-P0301) 2025-07-07, coach Beth: score
```
### get_coaching_call {"callId":"CALL05559"}

```
CALL05559: Karen with coach Marcus, 2025-04-08, English, goal veggies. Supervisor coach score 55/100. No line needed a person.
```
### get_coaching_call {"callId":"CALL99999"}

```
Error: Not found. C5 Coach's Co-pilot returned 404: call not found
```
### score_conversation {"transcript":"coach: Hi Rosa, how has your week been with the walking plan?\nparticipant: Not great. I've had a fever s

```
Coach score 20/100 over 7 lines.
Questions 2 open / 1 closed; reflections 0 simple / 0 complex; 1 persuade/confront; change talk 1, sustain talk 0.
FLAGS: line 2 medical (participant reports a new or worsening symptom: tell the care team today); line 3 missed_concern (coach did not acknowledge or route the participant's concern)
Cue moments: after line 2: Participant raised a medical concern. Help the coach respond with care and connect them to the right person today. | after line 3: The participant raised a concern and the coach moved on without routing it. Help the coach go back to it now.
```
### score_conversation {"callId":"CALL05559"}

```
Coach score 55/100 over 33 lines of CALL05559.
Questions 5 open / 1 closed; reflections 0 simple / 2 complex; 4 persuade/confront; change talk 6, sustain talk 1.
No flags.
Cue moments: after line 5: The participant voiced change talk and the coach did not reflect or affirm it. | after line 12: The coach just told the participant what to do without asking permission. | after line 18: The coach just told the participant what to do without asking permission. | after line 23: The participant voiced change talk and the coach did not reflect or affirm it. | after line 28: The participant voiced change talk and the coach did not reflect or affirm it.
Supervisor: score 55 on the same lines; coach-move agreement 0.94, talk agreement 0.87.
```
### coaching_cue {"recent":[{"speaker":"coach","text":"Hi Rosa, how has your week been with the walking plan?","tag":"open question"},{"s

```
Cue: Stop the plan talk and acknowledge her symptoms; invite her to say more and consider how she's feeling, e.g. checking in on the fever/chest tightness before anything else.
Say: "Before we talk about walks — a fever and chest tightness sound uncomfortable. Can you tell me more about how you're doing?"
Why: The participant raised a concern and the coach moved on without routing it. Help the coach go back to it now.
```
### score_conversation {"transcript":"hello there"}

```
Error: cannot read the speaker in "hello there"; start each line with "coach:" or "participant:"
```
### search {"query":"urgent"}

```
{"results":[{"id":"c3-P03000","title":"P03000 · 49M · kidney [alert, urgent]: Urgent review: about 6x the usual ER or hospital risk this week. A prompt to check in, not a prediction","url":"https://patient-360.raava.dev/#p-c3-P03000","matched":"headline"},{"id":"c3-P02185","title":"P02185 · 42M · lymphoma [alert, urgent]: Urgent review: about 6x the usual ER or hospital risk this week. A prompt to check in, not a prediction","url":"https://patient-360.raava.dev/#p-c3-P02185","matched":"headline"}]}
```
### fetch {"id":"c3-P03000"}

```
{"id":"c3-P03000","title":"C3 Bad Week Radar: P03000 · 49M · kidney","text":"Urgent review: about 6x the usual ER or hospital risk this week. A prompt to check in, not a prediction\nUrgent review: their wearable and calendar pattern puts them in the top 3% for ER or hospital risk. Flags like this carry about 6x the usual risk, but most are false alarms: about 1 in 14 is followed by an ER visit or admission within 7 days. Risk of a rough patch in the next 7 days: 8% (alert line 16%). The treatment calendar alone gives 2%; their check-ins move it +0 points and wearable signals +6. Biggest driver: Sleep efficiency 82% vs usual 88%, waking 3.0x a night vs 2.0x, 6.4 h asleep vs 6.9 h.\n\n{\"module\":\"c3\",\"moduleName\":\"C3 Bad Week Radar\",\"survivorId\":\"c3-P03000\",\"displayName\":\"P03000 · 49M · kidney\",\"status\":\"alert\",\"headline\":\"Urgent review: about 6x the usual ER or hospital risk this week. A prompt to check in, not a prediction\",\"summary\":\"Urgent review: their wearable and calendar pattern puts them in the top 3% for ER or hospital risk. Flags like this carry about 6x the usual risk, but most are false alarms: about 1 in 14 is followed by an ER visit or admission within 7 days. Risk of a rough patch in the next 7 days: 8% (alert line 16%). The treatment calendar alone gives 2%; their check-ins move it +0 points and wearable signals +6. Biggest driver: Sleep efficiency 82% vs usual 88%, waking 3.0x a night vs 2.0x, 6.4 h asleep vs 6.9 h.\",\"urgent\":true,
```
### search {"query":"night shift"}

```
{"results":[{"id":"c4-N0072","title":"N0072 · 61F · ovarian [alert]: High most of the day: 63% in range, average 178 mg/dL · tags: In range 63%, Night shift, Walks after 0/23 meals","url":"https://patient-360.raava.dev/#p-c4-N0072","matched":"tag \"Night shift\""},{"id":"c4-N0731","title":"N0731 · 44F · colorectal [ok]: Steady: 100% in range · tags: Night shift","url":"https://patient-360.raava.dev/#p-c4-N0731","matched":"tag \"Night shift\""}]}
```
### search {"query":"c3-P03000"}

```
{"results":[{"id":"c3-P03000","title":"P03000 · 49M · kidney [alert, urgent]: Urgent review: about 6x the usual ER or hospital risk this week. A prompt to check in, not a prediction","url":"https://patient-360.raava.dev/#p-c3-P03000","matched":"id"}]}
```
### search {"query":"urgent"}

```
{"results":[{"id":"c3-P03000","title":"P03000 · 49M · kidney [alert, urgent]: Urgent review: about 6x the usual ER or hospital risk this week. A prompt to check in, not a prediction","url":"https://patient-360.raava.dev/#p-c3-P03000","matched":"headline"},{"id":"c3-P02185","title":"P02185 · 42M · lymphoma [alert, urgent]: Urgent review: about 6x the usual ER or hospital risk this week. A prompt to check in, not a prediction","url":"https://patient-360.raava.dev/#p-c3-P02185","matched":"headline"}]}
```
### search {"query":"breast alert"}

```
{"results":[{"id":"c1-S9707145E","title":"S9707145E · 74F · breast [alert]: Acute care risk 65% for 2018 (high), driven by nights in hospital last year","url":"https://patient-360.raava.dev/#p-c1-S9707145E","matched":"all words (breast, alert)"},{"id":"c1-S93CB4E8B","title":"S93CB4E8B · 79F · breast [alert]: Acute care risk 64% for 2018 (high), driven by nights in hospital last year","url":"https://patient-360.raava.dev/#p-c1-S93CB4E8B","matched":"all words (breast, alert)"},{"id":"c1-S54288CF4","title":"S54288CF4 · 63F · breast [alert]: Acute care risk 64% for 2018 (high), driven by nights in hospital last year","url":"https://patient-360.raava.dev/#p-c1-S54288CF4","matched":"all words (breast, alert)"},{"id":"c1-SE3556D56","title":"SE3556D56 · 55F · breast [alert]: Acute care risk 56% for 2018 (high), driven by nights in hospital last year · tags: Few in training: Hispanic","url":"https://patient-360.raava.dev/#p-c1-SE3556D56","matched":"all words (breast, alert)"},{"id":"c1-S07D2544C","title":"S07D2544C · 72F · breast [alert]: Acute care risk 56% for 2018 (high), driven by nights in hospital last year · tags: Human check before outreach, Weak ranking: NH Black","url":"https://patient-360.raava.dev/#p-c1-S07D2544C","matched":"all words (breast, alert)"},{"id":"c1-SE1AECC69","title":"SE1AECC69 · 62F · breast [alert]: Acute care risk 55% for 2018 (high), driven by nights in hospital last year","url":"https://patient-360.raava.dev/#p-c1-SE1AECC69","matched":"all words (breast,
```
### search {"query":"zzqx nothing"}

```
{"results":[]}
```
### glucose_advice [fault=llm-down] {"survivorId":"c4-N0072"}

```
Plain-language advice for c4-N0072 (MODEL UNAVAILABLE, showing C4's template advice):
- Send these readings to your care team this week: 10.9% of your readings were above 250 mg/dL (weeks 1-2); the usual target is under 5%. Your average was 178.3 mg/dL. Contact your care team this week rather than waiting for your next visit. (template-fallback)
- Try a 10 to 20 minute walk after dinner: In real adults (CGMacros), a walk after a meal went with a rise only about 3.2 mg/dL smaller (95% CI -6.9 to 0.5): not distinguishable from zero. You walked after 0 of your scored meals, too few to measure your own effect yet. In the synthetic program, a walk after dinner went with a rise about 18.3 mg/dL smaller in the same person, more than after other meals (14.6 mg/dL). 10 to 19 minutes got most of the gain: 17.5 mg/dL less, against 19.5 for 20-29 minutes and 16.6 for 30+ minutes. If you take insulin or a sulfonylurea (glipizide, glyburide, glimepiride), ask your care team about low sugar before adding walks after meals. (template-fallback)
- Keep meal times steady around your shifts: You work nights, so clock-time rules about late dinners don't fit you. Keep your main meal at the same point in your waking day. (template-fallback)
```
### coaching_cue [fault=llm-down] {"recent":[{"speaker":"coach","text":"Hi Rosa, how has your week been with the walking plan?","tag":"open question"},{"s

```
Cue: Pause the plan. Reflect what the participant just said, ask one open question about it, and offer to connect them with the care team today.
Say: "Before we go on, I want to come back to what you just said. Can you tell me more about how you are feeling?"
Why: The participant raised a concern and the coach moved on without routing it. Help the coach go back to it now.
(Cue model unavailable; this is the rule-based fallback cue.)
```
### score_conversation [fault=llm-down] {"transcript":"coach: How was your week?\nparticipant: Fine.\ncoach: What went well?\nparticipant: The walks."}

```
Error: The C5 tagging model failed on 4 of 4 lines (after a retry each): C5 Co-pilot model returned 503: injected fault: model down (after 2 tries). No score was computed; try again later.
```
### glucose_advice [fault=llm-slow] {"survivorId":"c4-N0072"}

```
Plain-language advice for c4-N0072 (MODEL UNAVAILABLE, showing C4's template advice):
- Send these readings to your care team this week: 10.9% of your readings were above 250 mg/dL (weeks 1-2); the usual target is under 5%. Your average was 178.3 mg/dL. Contact your care team this week rather than waiting for your next visit. (template-fallback)
- Try a 10 to 20 minute walk after dinner: In real adults (CGMacros), a walk after a meal went with a rise only about 3.2 mg/dL smaller (95% CI -6.9 to 0.5): not distinguishable from zero. You walked after 0 of your scored meals, too few to measure your own effect yet. In the synthetic program, a walk after dinner went with a rise about 18.3 mg/dL smaller in the same person, more than after other meals (14.6 mg/dL). 10 to 19 minutes got most of the gain: 17.5 mg/dL less, against 19.5 for 20-29 minutes and 16.6 for 30+ minutes. If you take insulin or a sulfonylurea (glipizide, glyburide, glimepiride), ask your care team about low sugar before adding walks after meals. (template-fallback)
- Keep meal times steady around your shifts: You work nights, so clock-time rules about late dinners don't fit you. Keep your main meal at the same point in your waking day. (template-fallback)
```
### score_conversation (rate limit probe) {"transcript":"hello there"}

```
Error: Rate limit: score_conversation calls a live model. Each anonymous client IP may make 20 such calls per minute (score_conversation, coaching_cue and glucose_advice together). Wait a minute and try again.
```