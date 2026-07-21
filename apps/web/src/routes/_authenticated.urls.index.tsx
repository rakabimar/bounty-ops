import { createFileRoute } from "@tanstack/react-router";
import { UrlsPage } from "@/components/inventory-pages";
import { q } from "@/lib/queries";
export const Route = createFileRoute("/_authenticated/urls/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(q.urls()),
  component: UrlsPage,
});
