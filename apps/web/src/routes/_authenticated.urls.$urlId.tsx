import { createFileRoute } from "@tanstack/react-router";
import { UrlDetailPage } from "@/components/detail-pages";
import { q } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/urls/$urlId")({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(q.urlDetail(params.urlId)),
      context.queryClient.ensureQueryData(q.entityNotes("url", params.urlId)),
      context.queryClient.ensureQueryData(q.entityChecklist("url", params.urlId)),
      context.queryClient.ensureQueryData(q.entityRequests("url", params.urlId)),
    ]);
  },
  component: () => {
    const { urlId } = Route.useParams();
    return <UrlDetailPage urlId={urlId} />;
  },
});
