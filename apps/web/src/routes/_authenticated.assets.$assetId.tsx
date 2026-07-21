import { createFileRoute } from "@tanstack/react-router";
import { AssetDetailPage } from "@/components/detail-pages";
import { q } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/assets/$assetId")({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(q.assetDetail(params.assetId)),
      context.queryClient.ensureQueryData(q.entityNotes("asset", params.assetId)),
      context.queryClient.ensureQueryData(q.entityChecklist("asset", params.assetId)),
      context.queryClient.ensureQueryData(q.entityRequests("asset", params.assetId)),
    ]);
  },
  component: () => {
    const { assetId } = Route.useParams();
    return <AssetDetailPage assetId={assetId} />;
  },
});
