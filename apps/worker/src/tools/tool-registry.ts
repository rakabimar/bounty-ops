import type { ReconStage, ToolName } from "@bountyops/shared";

export interface ToolDefinition {
  name: ToolName;
  binary: string;
  stage: ReconStage;
  versionArgs: string[];
}

export const TOOL_REGISTRY: Record<ToolName, ToolDefinition> = {
  subfinder: { name: "subfinder", binary: "subfinder", stage: "passive", versionArgs: ["-version"] },
  dnsx: { name: "dnsx", binary: "dnsx", stage: "active_light", versionArgs: ["-version"] },
  httpx: { name: "httpx", binary: "httpx", stage: "active_light", versionArgs: ["-version"] },
};
