import type { DeterministicIntakeResult, IntakeSourceDocument, ProgramIntakePlatform, ProgramIntakePreviewRequest } from "@bountyops/shared";

export interface ProgramIntakeAdapter {
  platform: ProgramIntakePlatform;
  canHandle(input: ProgramIntakePreviewRequest): boolean;
  fetchSource?(input: ProgramIntakePreviewRequest): Promise<IntakeSourceDocument>;
  parse(source: IntakeSourceDocument): Promise<DeterministicIntakeResult>;
}
