import { createFileRoute } from "@tanstack/react-router";
import { AssetDetailPage } from "@/components/detail-pages";
import { CoreAssetDetailPage } from "@/components/core-detail-pages";
import { API_MODE } from "@/lib/api-client";

export const Route = createFileRoute("/_authenticated/assets/$assetId")({
  component: () => {
    const { assetId } = Route.useParams();
    return API_MODE === "http" ? <CoreAssetDetailPage assetId={assetId} /> : <AssetDetailPage assetId={assetId} />;
  },
});
