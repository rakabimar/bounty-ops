import { createFileRoute } from "@tanstack/react-router";
import { EndpointDetailPage } from "@/components/detail-pages";
import { CoreEndpointDetailPage } from "@/components/core-detail-pages";
import { API_MODE } from "@/lib/api-client";

export const Route = createFileRoute("/_authenticated/endpoints/$endpointId")({
  component: () => {
    const { endpointId } = Route.useParams();
    return API_MODE === "http" ? <CoreEndpointDetailPage endpointId={endpointId} /> : <EndpointDetailPage endpointId={endpointId} />;
  },
});
