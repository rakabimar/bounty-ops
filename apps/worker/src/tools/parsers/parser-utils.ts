import { createReadStream } from "node:fs";
import readline from "node:readline";

export async function readLines(path: string, visitor: (line: string) => void): Promise<void> {
  const stream = createReadStream(path, { encoding: "utf8" });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of lines) if (line.trim()) visitor(line.trim());
}
