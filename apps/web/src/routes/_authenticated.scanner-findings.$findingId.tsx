import { createFileRoute } from "@tanstack/react-router";
import { FindingDetailPage } from "@/components/detail-pages";
import { CoreFindingDetailPage } from "@/components/core-detail-pages";
import { API_MODE } from "@/lib/api-client";

export const Route = createFileRoute("/_authenticated/scanner-findings/$findingId")({
  component: () => {
    const { findingId } = Route.useParams();
    return API_MODE === "http" ? <CoreFindingDetailPage findingId={findingId} /> : <FindingDetailPage findingId={findingId} />;
  },
});
