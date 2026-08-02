import { createFileRoute } from "@tanstack/react-router";
import { CoreJobsPage } from "@/components/core-jobs-page";
import { coreQ } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/jobs")({
  loader: ({ context }) => context.queryClient.ensureQueryData(coreQ.jobs()),
  component: CoreJobsPage,
});
