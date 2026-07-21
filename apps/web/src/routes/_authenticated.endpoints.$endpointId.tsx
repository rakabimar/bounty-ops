import { createFileRoute } from "@tanstack/react-router";
import { EndpointDetailPage } from "@/components/detail-pages";
import { q } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/endpoints/$endpointId")({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(q.endpointDetail(params.endpointId)),
      context.queryClient.ensureQueryData(q.entityNotes("endpoint", params.endpointId)),
      context.queryClient.ensureQueryData(q.entityChecklist("endpoint", params.endpointId)),
      context.queryClient.ensureQueryData(q.entityRequests("endpoint", params.endpointId)),
    ]);
  },
  component: () => {
    const { endpointId } = Route.useParams();
    return <EndpointDetailPage endpointId={endpointId} />;
  },
});
