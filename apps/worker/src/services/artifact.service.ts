import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { createGzip } from "node:zlib";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import type { ToolName } from "@bountyops/shared";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const safeSegment = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, "_");

export interface ArtifactPaths { directory: string; stdoutPath: string; stderrPath: string }

export function artifactRoot(): string {
  const configured = process.env.ARTIFACT_DIR?.trim() || "./data/artifacts";
  return path.resolve(repositoryRoot, configured);
}

export async function createArtifactPaths(programId: string, jobRunId: string, toolName: ToolName): Promise<ArtifactPaths> {
  const root = artifactRoot();
  const directory = path.resolve(root, safeSegment(programId), safeSegment(jobRunId), safeSegment(toolName));
  if (directory !== root && !directory.startsWith(`${root}${path.sep}`)) throw new Error("Artifact path escaped ARTIFACT_DIR");
  await mkdir(directory, { recursive: true });
  return { directory, stdoutPath: path.join(directory, "stdout.jsonl"), stderrPath: path.join(directory, "stderr.log") };
}

async function gzipFile(source: string): Promise<string> {
  const target = `${source}.gz`;
  await pipeline(createReadStream(source), createGzip(), createWriteStream(target));
  await unlink(source);
  return target;
}

export async function compressArtifacts(paths: ArtifactPaths): Promise<{ stdoutPath: string; stderrPath: string }> {
  const [stdoutPath, stderrPath] = await Promise.all([gzipFile(paths.stdoutPath), gzipFile(paths.stderrPath)]);
  return { stdoutPath, stderrPath };
}
