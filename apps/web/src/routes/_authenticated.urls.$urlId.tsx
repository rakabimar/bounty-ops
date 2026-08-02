import { createFileRoute } from "@tanstack/react-router";
import { UrlDetailPage } from "@/components/detail-pages";
import { CoreUrlDetailPage } from "@/components/core-detail-pages";
import { API_MODE } from "@/lib/api-client";
import { EntityWorkspacePanels, WorkspaceSummaryCard } from "@/components/core-workspace-panels";

export const Route = createFileRoute("/_authenticated/urls/$urlId")({
  component: () => {
    const { urlId } = Route.useParams();
    return API_MODE === "http" ? <div className="space-y-5"><CoreUrlDetailPage urlId={urlId} /><WorkspaceSummaryCard entityType="url" entityId={urlId} statusOptions={["manual_started", "manual_done", "potential_bug", "ignored"]} /><EntityWorkspacePanels entityType="url" entityId={urlId} /></div> : <UrlDetailPage urlId={urlId} />;
  },
});
