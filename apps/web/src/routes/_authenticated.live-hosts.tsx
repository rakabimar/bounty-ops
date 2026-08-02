import { createFileRoute } from "@tanstack/react-router";
import { ReconLiveHostsPage } from "@/components/recon-results-pages";
import { coreQ } from "@/lib/queries";
export const Route=createFileRoute("/_authenticated/live-hosts")({loader:({context})=>context.queryClient.ensureQueryData(coreQ.httpServices()),component:ReconLiveHostsPage});
