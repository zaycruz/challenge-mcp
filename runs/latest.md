# challenge-mcp E2E 2026-10-17T15:21:19.473Z

Server: https://emerge-mcp.raava.dev/mcp (emerge-challenge-mcp 0.1.0). 67/67 checks passed in 16.1 s.
Full run: runs/2026-10-17T15-21-19-473Z.json

| | Check | Detail |
|---|---|---|
| PASS | initialize | {"name":"emerge-challenge-mcp","title":"Emerge Hackathon challenge APIs","version":"0.1.0"} |
| PASS | tools/list has every tool | triage_today, list_survivors, get_survivor, patient_overview, module_metrics, glucose_advice, reveal_outcome_demo, list_coaching_calls, get_coaching_call, score |
| PASS | every tool has a non-empty input schema | all have properties |
| PASS | every tool is marked readOnlyHint |  |
| PASS | every tool has a description of 40+ chars |  |
| PASS | triage_today succeeds (221 ms) |  |
| PASS | triage counts all 4 modules | {"c1":{"alert":41,"watch":41,"ok":117},"c3":{"alert":10,"watch":2,"ok":48},"c4":{"alert":11,"watch":10,"ok":29},"c5":{"alert":9,"watch":6,"ok":11}} |
| PASS | triage lists urgent C3 first | c3-P02185 |
| PASS | list_survivors succeeds (64 ms) |  |
| PASS | list_survivors c1 returns rows | 199 total, first c1-S2480BBDE |
| PASS | list_survivors succeeds (78 ms) |  |
| PASS | list_survivors c3 returns rows | 60 total, first c3-P02185 |
| PASS | list_survivors succeeds (106 ms) |  |
| PASS | list_survivors c4 returns rows | 50 total, first c4-N0072 |
| PASS | list_survivors succeeds (85 ms) |  |
| PASS | list_survivors c5 returns rows | 26 total, first c5-P0002 |
| PASS | list_survivors succeeds (105 ms) |  |
| PASS | list_survivors filters by text and status | 11 matched |
| PASS | list_survivors succeeds (56 ms) |  |
| PASS | list_survivors urgentOnly | 2 urgent |
| PASS | get_survivor succeeds (56 ms) |  |
| PASS | get_survivor c1 has headline + evidence/recommendations | c1-S2480BBDE |
| PASS | get_survivor succeeds (146 ms) |  |
| PASS | get_survivor c3 has headline + evidence/recommendations | c3-P02185 |
| PASS | get_survivor c3 hides the outcome |  |
| PASS | get_survivor succeeds (62 ms) |  |
| PASS | get_survivor c4 has headline + evidence/recommendations | c4-N0072 |
| PASS | get_survivor succeeds (51 ms) |  |
| PASS | get_survivor c5 has headline + evidence/recommendations | c5-P0002 |
| PASS | get_survivor succeeds (43 ms) |  |
| PASS | get_survivor c3 charts trimmed to 14 days |  |
| PASS | get_survivor returns isError (41 ms) | Error: Not found. /api/c1/survivors/c1-NOPE: HTTP 404 survivor not found |
| PASS | get_survivor returns isError (56 ms) | Error: survivorId must start with c1-, c3-, c4- or c5- (got "x9-123") |
| PASS | patient_overview succeeds (50 ms) |  |
| PASS | patient_overview says ids do not join | {"c1":{"enrolled":false},"c3":{"enrolled":true,"survivorId":"c3-P02185","status":"alert","headline":"Urgent: ER or hospital risk 6% in the next 7 days, about 5x |
| PASS | module_metrics succeeds (112 ms) |  |
| PASS | module_metrics c1 is compact | 4124 chars |
| PASS | module_metrics succeeds (67 ms) |  |
| PASS | module_metrics c3 has model and baseline | 0.819 vs 0.808 |
| PASS | module_metrics c3 is compact | 6488 chars |
| PASS | module_metrics succeeds (60 ms) |  |
| PASS | module_metrics c4 is compact | 6092 chars |
| PASS | glucose_advice succeeds (5227 ms) |  |
| PASS | glucose_advice returns advice items | template,ai,ai |
| PASS | reveal_outcome_demo succeeds (47 ms) |  |
| PASS | reveal_outcome_demo returns the outcome |  |
| PASS | list_coaching_calls succeeds (132 ms) |  |
| PASS | list_coaching_calls returns calls | 27 calls |
| PASS | get_coaching_call succeeds (65 ms) |  |
| PASS | get_coaching_call has a transcript | CALL05559, 33 lines |
| PASS | get_coaching_call returns isError (380 ms) | Error: Not found. /api/c5/calls/CALL99999: HTTP 404 call not found |
| PASS | score_conversation succeeds (1665 ms) |  |
| PASS | score_conversation flags the symptom line medical | {"n":2,"speaker":"participant","text":"Not great. I've had a fever since yesterday and my chest feels tight.","tag":"neutral","flag":"medical","confidence":0.08 |
| PASS | score_conversation carries the flag: next coach line is missed_concern | {"n":3,"speaker":"coach","text":"Okay. So did you manage to do the walks after dinner?","tag":"closed question","flag":"missed_concern","confidence":0.311} |
| PASS | score_conversation tags every line | open question / neutral / closed question / neutral / persuade / change / open question |
| PASS | score_conversation scores (4 coach lines) | score 20 |
| PASS | score_conversation finds cue moments | [{"afterLine":2,"trigger":"Participant raised a medical concern. Help the coach respond with care and connect them to the right person today."},{"afterLine":3," |
| PASS | score_conversation succeeds (3636 ms) |  |
| PASS | score_conversation on a stored call compares with the supervisor | {"supervisorScoreFullCall":55,"supervisorScoreSameLines":55,"coachMoveAgreement":0.94,"participantTalkAgreement":0.87,"supervisorNeedsHumanLines":[]} |
| PASS | coaching_cue succeeds (2377 ms) |  |
| PASS | coaching_cue uses the Co-pilot rule for a missed concern | The participant raised a concern and the coach moved on without routing it. Help the coach go back to it now. |
| PASS | coaching_cue returns a cue | Pause the walking-plan topic; reflect and explore the fever and chest tightness with an open question, letting Rosa decide what feels most important to discuss  |
| PASS | score_conversation returns isError (59 ms) | Error: cannot read the speaker in "hello there"; start each line with "coach:" or "participant:" |
| PASS | search succeeds (52 ms) |  |
| PASS | search returns results with id/title/url | 2 results |
| PASS | fetch succeeds (51 ms) |  |
| PASS | fetch returns id/title/text/url |  |

## Tool summaries (first text block of each call)

### triage_today {"limit":10}

```
71 survivors need attention (2 urgent, C3 ER/hospital risk in 7 days). Per module: c1 {"alert":41,"watch":41,"ok":117}; c3 {"alert":10,"watch":2,"ok":48}; c4 {"alert":11,"watch":10,"ok":29}; c5 {"alert":9,"watch":6,"ok":11}.
- c3-P02185 [alert, URGENT] P02185 · 42M · lymphoma: Urgent: ER or hospital risk 6% in the next 7 days, about 5x usual
- c3-P03000 [alert, URGENT] P03000 · 49M · kidney: Urgent: ER or hospital risk 10% in the next 7 days, about 9x usual
- c1-S2480BBDE [alert] S2480BBDE · 61F · other: Acute care risk 73% for 2018 (high), driven by ER visits last year
- c1-S9707145E [alert] S9707145E · 74F · breast: Acute care risk 68% for 2018 (high), driven by ER visits last year
- c1-S13BA2BCD [alert] S13BA2BCD · 67F · other: Acute care risk 65% for 2018 (high), driven by ER visits last year
- c1-S71188550 [alert] S71188550 · 85M · prostate: Acute care risk 57% for 2018 (high), driven by hospital stays last year
- c1-S60B33FC6 [alert] S60B33FC6 · 71F · other: Acute care risk 56% for 2018 (high), driven by ER visits last year
- c1-S0A254803 [alert] S0A254803 · 85F · cervix: Acute care risk 55% for 2018 (high), driven by hospital stays last year
- c1-SAD87CDC6 [alert] SAD87CDC6 · 53F · other: Acute care risk 55% for 2018 (high), driven by ER visits last year
- c1-S54288CF4 [alert] S54288CF4 · 63F · breast: Acute care risk 53% for 2018 (high), driven by home health care
…and 61 more (raise limit).
```
### list_survivors {"module":"c1","limit":3}

```
C1 Care Team Risk: 199 of 199 survivors match ({"alert":41,"watch":41,"ok":117} overall).
- c1-S2480BBDE [alert] S2480BBDE · 61F · other: Acute care risk 73% for 2018 (high), driven by ER visits last year
- c1-S9707145E [alert] S9707145E · 74F · breast: Acute care risk 68% for 2018 (high), driven by ER visits last year
- c1-S13BA2BCD [alert] S13BA2BCD · 67F · other: Acute care risk 65% for 2018 (high), driven by ER visits last year
```
### list_survivors {"module":"c3","limit":3}

```
C3 Bad Week Radar: 60 of 60 survivors match ({"alert":10,"watch":2,"ok":48} overall).
- c3-P02185 [alert, URGENT] P02185 · 42M · lymphoma: Urgent: ER or hospital risk 6% in the next 7 days, about 5x usual
- c3-P03000 [alert, URGENT] P03000 · 49M · kidney: Urgent: ER or hospital risk 10% in the next 7 days, about 9x usual
- c3-P02465 [alert] P02465 · 59M · bladder: Rough patch risk 33% in the next 7 days, driven by sleep
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
C1 Care Team Risk: 11 of 199 survivors match ({"alert":41,"watch":41,"ok":117} overall).
- c1-S9707145E [alert] S9707145E · 74F · breast: Acute care risk 68% for 2018 (high), driven by ER visits last year
- c1-S54288CF4 [alert] S54288CF4 · 63F · breast: Acute care risk 53% for 2018 (high), driven by home health care
- c1-S93CB4E8B [alert] S93CB4E8B · 79F · breast: Acute care risk 49% for 2018 (high), driven by hospital stays last year
- c1-SF969193E [alert] SF969193E · 74F · breast: Acute care risk 46% for 2018 (high), driven by ER visits last year
- c1-SE1AECC69 [alert] SE1AECC69 · 62F · breast: Acute care risk 45% for 2018 (high), driven by hospital stays last year
- c1-S2933E9D5 [alert] S2933E9D5 · 72F · breast: Acute care risk 44% for 2018 (high), driven by depression symptoms
- c1-SB63DCCCD [alert] SB63DCCCD · 66F · breast: Acute care risk 41% for 2018 (high), driven by many office visits
- c1-SACFCEF33 [alert] SACFCEF33 · 68F · breast: Acute care risk 38% for 2018 (high), driven by low physical function
- c1-S07D2544C [alert] S07D2544C · 72F · breast: Acute care risk 38% for 2018 (high), driven by ER visits last year
- c1-SE3556D56 [alert] SE3556D56 · 55F · breast: Acute care risk 38% for 2018 (high), driven by home health care
- c1-S7FA9558D [alert] S7FA9558D · 85F · breast: Acute care risk 37% for 2018 (high), driven by many office visits
```
### list_survivors {"module":"c3","urgentOnly":true}

```
C3 Bad Week Radar: 2 of 60 survivors match ({"alert":10,"watch":2,"ok":48} overall).
- c3-P02185 [alert, URGENT] P02185 · 42M · lymphoma: Urgent: ER or hospital risk 6% in the next 7 days, about 5x usual
- c3-P03000 [alert, URGENT] P03000 · 49M · kidney: Urgent: ER or hospital risk 10% in the next 7 days, about 9x usual
```
### get_survivor {"survivorId":"c1-S2480BBDE"}

```
C1 Care Team Risk · S2480BBDE · 61F · other · ALERT
Acute care risk 73% for 2018 (high), driven by ER visits last year
73% predicted chance of an ER visit or hospital stay in 2018 (average survivor 29%). Status alert: alert from 36%, watch from 29%. Main drivers: 11 ER visit(s) in 2017 (most survivors had none); 12 hospital stay(s) in 2017; Had home health care in 2017.
Next steps:
- [care-team] Add to the proactive outreach list: a nurse call in the next 2 weeks and a clear same-day contact route instead of the ER.
- [care-team] Review last year's ER visits for preventable causes; set a same-day call-back route before the ER.
- [care-team] Schedule a post-discharge style check-in and medication reconciliation.
- [care-team] Confirm home health is still in place and who to call after hours.
```
### get_survivor {"survivorId":"c3-P02185"}

```
C3 Bad Week Radar · P02185 · 42M · lymphoma · ALERT · URGENT
Urgent: ER or hospital risk 6% in the next 7 days, about 5x usual
Urgent: risk of an ER visit or hospital admission in the next 7 days is 6% (urgent line 6%, typical day 1.2%). Risk of a rough patch in the next 7 days: 16% (alert line 11%). The treatment calendar alone gives 9%; wearable signals move it +7 points. Biggest wearable driver: Sleep efficiency 87% vs usual 92%, waking 3.5x a night vs 2.0x, 6.8 h asleep vs 7.1 h.
Next steps:
- [today] Call today. Ask how they feel, about fever, fluids and anything new. If anything is off, have them call their care team now.
- [within 2 days] Check in this week about sleep: nights, naps, worries. Share the sleep tips sheet.
- [this week] Move the next coaching call earlier and plan around the expected low point.
- [this week] Send a short, no-pressure message asking how the week is going; offer a 2-minute call instead of the form.
```
### get_survivor {"survivorId":"c4-N0072"}

```
C4 Glucose Guide · N0072 · 61F · ovarian · ALERT
High most of the day: 63% in range, average 178 mg/dL
61-year-old female, ovarian cancer, 1.7 years after treatment; type 2 diabetes at start; group: coaching; night shift. Average sugar 178 mg/dL in weeks 1-2, 63% of readings in range. Median rise after dinner 108 mg/dL. Synthetic participant (made-up data).
Next steps:
- Only 62.7% of your readings were in the 70-180 range (weeks 1-2); the usual target is more than 70%. Your average was 178.3 mg/dL. Bring this to your next visit.
- You walked after 0 of your scored meals, too few to measure your own effect yet. Across the program, a walk after dinner went with a rise about 18.7 mg/dL smaller in the same person, more than after other meals (13.5 mg/dL). 10 to 19 minutes got most of the gain: 17.1 mg/dL less, against 20.1 for 20-29 minutes and 16.8 for 30+ minutes. A check in real adults (CGMacros) pointed the same way, but it is not proven there yet.
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
### get_survivor {"survivorId":"c3-P02185","includeCharts":true}

```
C3 Bad Week Radar · P02185 · 42M · lymphoma · ALERT · URGENT
Urgent: ER or hospital risk 6% in the next 7 days, about 5x usual
Urgent: risk of an ER visit or hospital admission in the next 7 days is 6% (urgent line 6%, typical day 1.2%). Risk of a rough patch in the next 7 days: 16% (alert line 11%). The treatment calendar alone gives 9%; wearable signals move it +7 points. Biggest wearable driver: Sleep efficiency 87% vs usual 92%, waking 3.5x a night vs 2.0x, 6.8 h asleep vs 7.1 h.
Next steps:
- [today] Call today. Ask how they feel, about fever, fluids and anything new. If anything is off, have them call their care team now.
- [within 2 days] Check in this week about sleep: nights, naps, worries. Share the sleep tips sheet.
- [this week] Move the next coaching call earlier and plan around the expected low point.
- [this week] Send a short, no-pressure message asking how the week is going; offer a 2-minute call instead of the form.
```
### get_survivor {"survivorId":"c1-NOPE"}

```
Error: Not found. /api/c1/survivors/c1-NOPE: HTTP 404 survivor not found
```
### get_survivor {"survivorId":"x9-123"}

```
Error: survivorId must start with c1-, c3-, c4- or c5- (got "x9-123")
```
### patient_overview {"survivorId":"c3-P02185"}

```
P02185 · 42M · lymphoma: ALERT in C3 Bad Week Radar (1 of 60). Urgent: ER or hospital risk 6% in the next 7 days, about 5x usual
Found in: c3. Not found in: c1, c4, c5. The modules use separate cohorts: C1 ids are c1-S…, C3 c3-P0…(5 digits), C4 c4-N…, C5 c5-P0…(4 digits). No id appears in two modules, so one person has data in one module only.
```
### module_metrics {"module":"c1"}

```
C1: logistic model AUROC 0.666 (95% CI 0.61-0.72), Brier 0.192, out-of-fold on 466 development survivors. Held-out status mix {"alert":41,"watch":41,"ok":117}.
```
### module_metrics {"module":"c3"}

```
C3 Radar on held-out patients: week AUC 0.819 vs schedule-only 0.808; rough-patch episode recall 0.664 vs 0.617; ER/admission recall 0.549 vs 0.434; median lead 7 days.
```
### module_metrics {"module":"c4"}

```
C4 cohort (within-person, mg/dL change in post-meal rise): walk after a meal -17.62 [-18.98, -16.26]; late dinner +9.08 [7.05, 11.23]; per 10 g carbs +5.34.
```
### glucose_advice {"survivorId":"c4-N0072"}

```
Plain-language advice for c4-N0072:
- Share these readings with your care team: Only 62.7% of your readings were in the 70-180 range (weeks 1-2); the usual target is more than 70%. Your average was 178.3 mg/dL. Bring this to your next visit. (template)
- Try a 10 to 20 minute walk after dinner: You didn't walk after any of your scored meals, so you haven't seen the effect on your readings yet. Walking after dinner is linked to a rise about 18.7 mg/dL smaller in sugar, with the best results from walks of 10 to 19 minutes.
- Keep meal times steady around your shifts: Since you work nights, traditional rules about late dinners don't apply to you. Just keep your main meal at the same time in your waking day, regardless of the clock.
```
### reveal_outcome_demo {"survivorId":"c3-P02185"}

```
DEMO ONLY (hidden from coaches). Forecast for c3-P02185: alert, urgent, rough-patch risk 0.162. What happened: rough patch did not start in 14 days; ER/admission none in 14 days.
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
Error: Not found. /api/c5/calls/CALL99999: HTTP 404 call not found
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
Cue: Pause the walking-plan topic; reflect and explore the fever and chest tightness with an open question, letting Rosa decide what feels most important to discuss first.
Say: "A fever and tight chest sound concerning — I'm glad you mentioned it. Can you tell me more about how you're feeling right now?"
Why: The participant raised a concern and the coach moved on without routing it. Help the coach go back to it now.
```
### score_conversation {"transcript":"hello there"}

```
Error: cannot read the speaker in "hello there"; start each line with "coach:" or "participant:"
```
### search {"query":"urgent"}

```
{"results":[{"id":"c3-P02185","title":"P02185 · 42M · lymphoma [alert, urgent]: Urgent: ER or hospital risk 6% in the next 7 days, about 5x usual","url":"https://patient-360.raava.dev/#p-c3-P02185"},{"id":"c3-P03000","title":"P03000 · 49M · kidney [alert, urgent]: Urgent: ER or hospital risk 10% in the next 7 days, about 9x usual","url":"https://patient-360.raava.dev/#p-c3-P03000"}]}
```
### fetch {"id":"c3-P02185"}

```
{"id":"c3-P02185","title":"C3 Bad Week Radar: P02185 · 42M · lymphoma","text":"Urgent: ER or hospital risk 6% in the next 7 days, about 5x usual\nUrgent: risk of an ER visit or hospital admission in the next 7 days is 6% (urgent line 6%, typical day 1.2%). Risk of a rough patch in the next 7 days: 16% (alert line 11%). The treatment calendar alone gives 9%; wearable signals move it +7 points. Biggest wearable driver: Sleep efficiency 87% vs usual 92%, waking 3.5x a night vs 2.0x, 6.8 h asleep vs 7.1 h.\n\n{\"module\":\"c3\",\"moduleName\":\"C3 Bad Week Radar\",\"survivorId\":\"c3-P02185\",\"displayName\":\"P02185 · 42M · lymphoma\",\"status\":\"alert\",\"headline\":\"Urgent: ER or hospital risk 6% in the next 7 days, about 5x usual\",\"summary\":\"Urgent: risk of an ER visit or hospital admission in the next 7 days is 6% (urgent line 6%, typical day 1.2%). Risk of a rough patch in the next 7 days: 16% (alert line 11%). The treatment calendar alone gives 9%; wearable signals move it +7 points. Biggest wearable driver: Sleep efficiency 87% vs usual 92%, waking 3.5x a night vs 2.0x, 6.8 h asleep vs 7.1 h.\",\"urgent\":true,\"urgentRisk\":0.06,\"risk\":0.162,\"scheduleRisk\":0.091,\"thresholds\":{\"alert\":0.106,\"watch\":0.068,\"urgent\":0.058},\"profile\":{\"age\":42,\"sex\":\"male\",\"cancerType\":\"lymphoma\",\"stage\":\"I\",\"treatmentPlan\":\"IV chemo every 21 days\",\"device\":\"Fitbit tracker\",\"language\":\"Haitian Creole\",\"livesAlone\":\"no\",\"context\":\"Day 5 of c
```