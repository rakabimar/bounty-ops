import { createFileRoute } from "@tanstack/react-router";
import { FindingDetailPage } from "@/components/detail-pages";
import { CoreFindingDetailPage } from "@/components/core-detail-pages";
import { API_MODE } from "@/lib/api-client";
import { EntityWorkspacePanels, WorkspaceSummaryCard } from "@/components/core-workspace-panels";

export const Route = createFileRoute("/_authenticated/scanner-findings/$findingId")({
  component: () => {
    const { findingId } = Route.useParams();
    return API_MODE === "http" ? <div className="space-y-5"><CoreFindingDetailPage findingId={findingId} /><WorkspaceSummaryCard entityType="scanner_finding" entityId={findingId} statusOptions={["new", "reviewed", "interesting", "false_positive", "potential_bug", "ignored"]} /><EntityWorkspacePanels entityType="scanner_finding" entityId={findingId} /></div> : <FindingDetailPage findingId={findingId} />;
  },
});
