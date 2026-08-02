import { createFileRoute } from "@tanstack/react-router";
import { UrlDetailPage } from "@/components/detail-pages";
import { CoreUrlDetailPage } from "@/components/core-detail-pages";
import { API_MODE } from "@/lib/api-client";

export const Route = createFileRoute("/_authenticated/urls/$urlId")({
  component: () => {
    const { urlId } = Route.useParams();
    return API_MODE === "http" ? <CoreUrlDetailPage urlId={urlId} /> : <UrlDetailPage urlId={urlId} />;
  },
});
