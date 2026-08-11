import { spawn } from "node:child_process";
import type { ToolName } from "@bountyops/shared";
import type { FastifyInstance } from "fastify";

const checks: Array<{ name: ToolName; args: string[][]; acceptNonZero?: boolean }> = [
  { name: "subfinder", args: [["-version"]] }, { name: "dnsx", args: [["-version"]] }, { name: "httpx", args: [["-version"]] },
  { name: "gau", args: [["--version"], ["-version"]] }, { name: "waybackurls", args: [["-h"], ["--help"]], acceptNonZero: true },
  { name: "katana", args: [["-version"]] }, { name: "nuclei", args: [["-version"]] },
];

function attempt(name: ToolName, args: string[], acceptNonZero = false): Promise<{ spawned: boolean; ok: boolean; output: string; error: string | null }> {
  return new Promise((resolve) => {
    const child = spawn(name, args, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; let settled = false;
    const finish = (value: { spawned: boolean; ok: boolean; output: string; error: string | null }) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
    const capture = (chunk: Buffer) => { if (output.length < 8_000) output += chunk.toString("utf8"); };
    child.stdout.on("data", capture); child.stderr.on("data", capture);
    child.on("error", (error: NodeJS.ErrnoException) => finish({ spawned: false, ok: false, output, error: error.code === "ENOENT" ? "Tool not found in PATH" : "Availability check failed" }));
    child.on("close", (code) => finish({ spawned: true, ok: code === 0 || acceptNonZero, output, error: code === 0 || acceptNonZero ? null : `Version command exited with code ${code ?? "unknown"}` }));
    const timer = setTimeout(() => { child.kill("SIGTERM"); finish({ spawned: true, ok: false, output, error: "Availability check timed out" }); }, 5_000);
  });
}

async function availability(definition: typeof checks[number]) {
  let lastError = "Availability check failed";
  for (const args of definition.args) {
    const result = await attempt(definition.name, args, definition.acceptNonZero);
    if (!result.spawned) return { name: definition.name, available: false, version: null, error: result.error };
    if (result.ok) return { name: definition.name, available: true, version: result.output.trim().split(/\r?\n/).find(Boolean)?.slice(0, 500) ?? null, error: null };
    lastError = result.error ?? lastError;
  }
  return { name: definition.name, available: false, version: null, error: lastError };
}

export async function toolsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/tools/health", { preHandler: app.requireAuth }, async () => Promise.all(checks.map(availability)));
}
