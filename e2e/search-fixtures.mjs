// Fixture queries for the search tool: what a care-team user or ChatGPT would type, and what a good answer looks like.
// Each `ok(results)` must hold on the live rosters. Ids come from `ids` (the first survivor of each module).
export const searchFixtures = (ids) => [
  { query: "night shift", want: "every hit matched the phrase in a tag or the headline, and says so",
    ok: (r) => r.length > 0 && r.every((x) => /^tag |^headline$/.test(x.matched) && /night shift/i.test(x.title)) },
  { query: ids.c3, want: "an exact id comes first",
    ok: (r) => r[0]?.id === ids.c3 && r[0]?.matched === "id" },
  { query: "urgent", want: "urgent survivors come first",
    ok: (r) => r.length > 0 && /urgent/.test(r[0].title) },
  { query: "breast alert", want: "every hit is an alert and mentions breast",
    ok: (r) => r.length > 0 && r.every((x) => /\[alert/.test(x.title) && /breast/i.test(x.title)) },
  { query: "zzqx nothing", want: "no false hits",
    ok: (r) => r.length === 0 },
];
