import { createFileRoute } from "@tanstack/react-router";
import { EndpointDetailPage } from "@/components/detail-pages";
import { CoreEndpointDetailPage } from "@/components/core-detail-pages";
import { API_MODE } from "@/lib/api-client";
import { EntityWorkspacePanels, WorkspaceSummaryCard } from "@/components/core-workspace-panels";

export const Route = createFileRoute("/_authenticated/endpoints/$endpointId")({
  component: () => {
    const { endpointId } = Route.useParams();
    return API_MODE === "http" ? <div className="space-y-5"><CoreEndpointDetailPage endpointId={endpointId} /><WorkspaceSummaryCard entityType="endpoint" entityId={endpointId} statusOptions={["manual_started", "manual_done", "potential_bug", "ignored"]} /><EntityWorkspacePanels entityType="endpoint" entityId={endpointId} /></div> : <EndpointDetailPage endpointId={endpointId} />;
  },
});
