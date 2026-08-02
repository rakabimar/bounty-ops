import { spawn } from "node:child_process";
import type { FastifyInstance } from "fastify";

const tools = ["subfinder", "dnsx", "httpx"] as const;

function availability(name: typeof tools[number]): Promise<{ name: string; available: boolean; version: string | null; error: string | null }> {
  return new Promise((resolve) => {
    const child = spawn(name, ["-version"], { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; let settled = false;
    const finish = (value: { name: string; available: boolean; version: string | null; error: string | null }) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
    child.stdout.on("data", (chunk: Buffer) => { if (output.length < 8_000) output += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { if (output.length < 8_000) output += chunk.toString("utf8"); });
    child.on("error", (error: NodeJS.ErrnoException) => finish({ name, available: false, version: null, error: error.code === "ENOENT" ? "Tool not found in PATH" : "Availability check failed" }));
    child.on("close", (code) => finish({ name, available: code === 0, version: output.trim().split(/\r?\n/).find(Boolean)?.slice(0, 500) ?? null, error: code === 0 ? null : `Version command exited with code ${code ?? "unknown"}` }));
    const timer = setTimeout(() => { child.kill("SIGTERM"); finish({ name, available: false, version: null, error: "Availability check timed out" }); }, 5_000);
  });
}

export async function toolsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/tools/health", { preHandler: app.requireAuth }, async () => Promise.all(tools.map(availability)));
}
