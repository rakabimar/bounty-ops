import type { IntakeSourceDocument, ProgramIntakePlatform, ProgramIntakePreviewRequest } from "@bountyops/shared";
import { parseProgramPolicy } from "../intake-parser.service.js";
import { fetchPlatformSource, pastedTextDocument, platformFromUrl } from "../source-document.service.js";
import type { ProgramIntakeAdapter } from "./program-intake-adapter.js";

class PlatformAdapter implements ProgramIntakeAdapter {
  constructor(public platform: Exclude<ProgramIntakePlatform, "manual">) {}
  canHandle(input: ProgramIntakePreviewRequest) { return input.sourceType === "platform_url" && platformFromUrl(input.url) === this.platform || input.sourceType === "pasted_text" && input.platform === this.platform; }
  async fetchSource(input: ProgramIntakePreviewRequest) { if (input.sourceType === "platform_url") return fetchPlatformSource(input.url); return pastedTextDocument(this.platform, input.text); }
  async parse(source: IntakeSourceDocument) { return parseProgramPolicy(source); }
}
export class HackerOneIntakeAdapter extends PlatformAdapter { constructor() { super("hackerone"); } }
export class BugcrowdIntakeAdapter extends PlatformAdapter { constructor() { super("bugcrowd"); } }
export class YesWeHackIntakeAdapter extends PlatformAdapter { constructor() { super("yeswehack"); } }
export class ManualTextIntakeAdapter implements ProgramIntakeAdapter {
  platform = "manual" as const;
  canHandle(input: ProgramIntakePreviewRequest) { return input.sourceType === "pasted_text" && input.platform === "manual"; }
  async fetchSource(input: ProgramIntakePreviewRequest) { if (input.sourceType !== "pasted_text") throw new Error("Manual adapter requires pasted text"); return pastedTextDocument("manual", input.text); }
  async parse(source: IntakeSourceDocument) { return parseProgramPolicy(source); }
}
export const intakeAdapters: ProgramIntakeAdapter[] = [new HackerOneIntakeAdapter(), new BugcrowdIntakeAdapter(), new YesWeHackIntakeAdapter(), new ManualTextIntakeAdapter()];
