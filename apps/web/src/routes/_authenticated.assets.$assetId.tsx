import { createFileRoute } from "@tanstack/react-router";
import { AssetDetailPage } from "@/components/detail-pages";
import { CoreAssetDetailPage } from "@/components/core-detail-pages";
import { API_MODE } from "@/lib/api-client";
import { EntityWorkspacePanels, WorkspaceSummaryCard } from "@/components/core-workspace-panels";

export const Route = createFileRoute("/_authenticated/assets/$assetId")({
  component: () => {
    const { assetId } = Route.useParams();
    return API_MODE === "http" ? <div className="space-y-5"><CoreAssetDetailPage assetId={assetId} /><WorkspaceSummaryCard entityType="asset" entityId={assetId} statusOptions={["manual_started", "manual_done", "potential_bug", "ignored"]} /><EntityWorkspacePanels entityType="asset" entityId={assetId} /></div> : <AssetDetailPage assetId={assetId} />;
  },
});
