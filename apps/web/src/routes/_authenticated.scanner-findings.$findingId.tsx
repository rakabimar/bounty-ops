import { createFileRoute } from "@tanstack/react-router";
import { FindingDetailPage } from "@/components/detail-pages";
import { q } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/scanner-findings/$findingId")({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(q.findingDetail(params.findingId)),
      context.queryClient.ensureQueryData(q.entityNotes("scanner_finding", params.findingId)),
      context.queryClient.ensureQueryData(q.entityRequests("scanner_finding", params.findingId)),
    ]);
  },
  component: () => {
    const { findingId } = Route.useParams();
    return <FindingDetailPage findingId={findingId} />;
  },
});
