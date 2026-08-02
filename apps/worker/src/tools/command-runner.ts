import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import type { ArtifactPaths } from "../services/artifact.service.js";

export class ToolMissingError extends Error {
  constructor(public readonly binary: string) {
    super(`Required tool '${binary}' was not found in PATH`);
    this.name = "ToolMissingError";
  }
}

export interface CommandResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  stdoutPath: string;
  stderrPath: string;
  stdoutLinesCount: number;
  stderrLinesCount: number;
}

interface RunCommandOptions {
  stdinLines?: string[];
  timeoutMs?: number;
  env?: Record<string, string>;
  artifacts: ArtifactPaths;
}

export function runCommand(command: string, args: string[], options: RunCommandOptions): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const stdout = createWriteStream(options.artifacts.stdoutPath, { flags: "w" });
    const stderr = createWriteStream(options.artifacts.stderrPath, { flags: "w" });
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdoutNewlines = 0;
    let stderrNewlines = 0;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutEndsWithNewline = false;
    let stderrEndsWithNewline = false;
    let settled = false;
    const timeout = setTimeout(() => child.kill("SIGTERM"), options.timeoutMs ?? 15 * 60_000);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      const text = chunk.toString("utf8");
      stdoutNewlines += text.split("\n").length - 1;
      stdoutEndsWithNewline = text.endsWith("\n");
      stdout.write(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      const text = chunk.toString("utf8");
      stderrNewlines += text.split("\n").length - 1;
      stderrEndsWithNewline = text.endsWith("\n");
      stderr.write(chunk);
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      stdout.end();
      stderr.end();
      reject(error.code === "ENOENT" ? new ToolMissingError(command) : error);
    });
    child.on("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      Promise.all([
        new Promise<void>((done) => stdout.end(done)),
        new Promise<void>((done) => stderr.end(done)),
      ]).then(() => resolve({
          exitCode,
          signal,
          durationMs: Date.now() - started,
          stdoutPath: options.artifacts.stdoutPath,
          stderrPath: options.artifacts.stderrPath,
          stdoutLinesCount: stdoutNewlines + (stdoutBytes > 0 && !stdoutEndsWithNewline ? 1 : 0),
          stderrLinesCount: stderrNewlines + (stderrBytes > 0 && !stderrEndsWithNewline ? 1 : 0),
        }), reject);
    });
    if (options.stdinLines?.length) child.stdin.end(`${options.stdinLines.join("\n")}\n`);
    else child.stdin.end();
  });
}
