import { createFileRoute } from "@tanstack/react-router";
import { AssetsPage } from "@/components/inventory-pages";
import { q } from "@/lib/queries";
export const Route = createFileRoute("/_authenticated/assets/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(q.assets()),
  component: AssetsPage,
});
