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
  gau: { name: "gau", binary: "gau", stage: "passive", versionArgs: ["--version"] },
  waybackurls: { name: "waybackurls", binary: "waybackurls", stage: "passive", versionArgs: ["-h"] },
  katana: { name: "katana", binary: "katana", stage: "active_medium", versionArgs: ["-version"] },
  nuclei: { name: "nuclei", binary: "nuclei", stage: "active_medium", versionArgs: ["-version"] },
};
