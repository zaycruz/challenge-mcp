// Turns the JSON from the reproduce runner (POST /run) into runs/reproduce-<stamp>.md.
// Usage: node scripts/reproduce-md.mjs <reproduce.json>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const r = JSON.parse(readFileSync(process.argv[2], "utf8"));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const e2e = r.steps.find((s) => s.cmd.includes("e2e/run.mjs"));
const pass = e2e?.output.match(/(\d+)\/(\d+) passed/);
const md = [
  `# Fresh-clone reproduce run ${new Date().toISOString()}`,
  "",
  `- Where: Cloudflare Container (\`${r.image}\`), started by the \`challenge-mcp-reproduce\` Worker (reproduce/). Not this Mac, not Proxmox.`,
  `- Repo: ${r.repo} at \`${r.ref}\``,
  `- Target: ${r.url}`,
  `- Result: ${pass ? `**${pass[1]}/${pass[2]} checks passed**` : "E2E did not finish"} (E2E exit code ${e2e?.exitCode ?? "n/a"})`,
  "",
  "## Environment",
  "```", r.environment, "```",
  "",
  "## Steps",
  ...r.steps.flatMap((s) => [`### \`${s.cmd}\` → exit ${s.exitCode} (${(s.ms / 1000).toFixed(1)} s)`, "```", s.output.trim().slice(-6000), "```"]),
  "",
  "## runs/latest.md from the container",
  "",
  r.latestMd || "(none)",
].join("\n");
mkdirSync("runs", { recursive: true });
writeFileSync(`runs/reproduce-${stamp}.md`, md);
console.log(`runs/reproduce-${stamp}.md: ${pass ? `${pass[1]}/${pass[2]} passed` : "no E2E result"}`);
