/**
 * POST /run {ref?, url?}  (Authorization: Bearer $REPRO_TOKEN)
 * Starts a fresh node:22 container, clones github.com/zaycruz/challenge-mcp at `ref` (default main), runs
 * `npm ci`, `node e2e/run.mjs <url>` and `node scripts/reproduce-numbers.mjs <url>`, and returns each step's exit code and output plus runs/latest.md and runs/numbers-latest.md.
 * The token only stops strangers from spending the live C5 model calls the E2E makes.
 */
import { DurableObject } from "cloudflare:workers";

interface Env { RUNNER: DurableObjectNamespace<Runner>; REPRO_TOKEN: string }

const REPO = "https://github.com/zaycruz/challenge-mcp.git";
const IMAGE = "docker.io/library/node:22-bookworm";

export class Runner extends DurableObject<Env> {
  async run(ref: string, url: string) {
    const c = this.ctx.container;
    if (!c) throw new Error("container binding is not configured");
    if (!c.running) c.start({ image: Object.values(c.images ?? {})[0] ?? IMAGE, entrypoint: ["sleep", "infinity"], enableInternet: true });
    const steps: { cmd: string; exitCode: number; ms: number; output: string }[] = [];
    const sh = async (cmd: string) => {
      const t0 = Date.now();
      // The container may still be booting on the first command.
      for (let i = 0; ; i++) {
        try {
          const p = await c.exec(["/bin/bash", "-lc", `mkdir -p /work && cd /work && ${cmd}`], { cwd: "/", stderr: "combined" });
          const out = await p.output();
          const step = { cmd, exitCode: out.exitCode, ms: Date.now() - t0, output: new TextDecoder().decode(out.stdout).slice(-20_000) };
          steps.push(step);
          return step;
        } catch (e) {
          if (i >= 30) throw new Error(`exec "${cmd.slice(0, 40)}" failed after ${i} tries: ${e instanceof Error ? e.message : e}`);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    };
    const env = await sh("uname -srm; cat /etc/os-release | head -1; node --version; npm --version; git --version; nproc");
    const clone = await sh(`rm -rf repo && git clone --quiet ${REPO} repo && cd repo && git checkout --quiet ${ref} && git log -1 --format='%H %s'`);
    let latest = "", numbers = "";
    if (clone.exitCode === 0) {
      const ci = await sh("cd repo && npm ci --no-audit --no-fund 2>&1 | tail -5");
      if (ci.exitCode === 0) {
        await sh(`cd repo && node e2e/run.mjs ${url}`);
        latest = (await sh("cat repo/runs/latest.md")).output;
        // Every README headline number, regenerated from the module APIs and diffed against the live server.
        await sh(`cd repo && node scripts/reproduce-numbers.mjs ${url}`);
        numbers = (await sh("cat repo/runs/numbers-latest.md")).output;
      }
    }
    await c.destroy().catch(() => {});
    return { repo: REPO, ref, url, image: IMAGE, environment: env.output.trim(), steps, latestMd: latest, numbersMd: numbers };
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const u = new URL(req.url);
    if (u.pathname !== "/run" || req.method !== "POST") return new Response("POST /run", { status: 404 });
    if (!env.REPRO_TOKEN || req.headers.get("authorization") !== `Bearer ${env.REPRO_TOKEN}`) return new Response("unauthorized", { status: 401 });
    const body = (await req.json().catch(() => ({}))) as { ref?: string; url?: string };
    const ref = /^[\w./-]{1,64}$/.test(body.ref ?? "") ? body.ref! : "main";
    const url = /^https:\/\/[\w.-]+\/mcp$/.test(body.url ?? "") ? body.url! : "https://emerge-mcp.raava.dev/mcp";
    const stub = env.RUNNER.getByName(`run-${Date.now()}`);
    try {
      return Response.json(await stub.run(ref, url));
    } catch (e) {
      return Response.json({ error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }, { status: 500 });
    }
  },
};
