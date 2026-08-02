import { createFileRoute } from "@tanstack/react-router";
import { ReconAssetsPage } from "@/components/recon-results-pages";
import { coreQ } from "@/lib/queries";
export const Route = createFileRoute("/_authenticated/assets/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(coreQ.assets()),
  component: ReconAssetsPage,
});
