import { createFileRoute } from "@tanstack/react-router";
import { CoreToolsPage } from "@/components/core-tools-page";
import { ToolsPage } from "@/components/triage-settings-pages";
import { API_MODE } from "@/lib/api-client";
import { coreQ, q } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/tools")({
  loader: ({ context }) => API_MODE === "http"
    ? context.queryClient.ensureQueryData(coreQ.toolHealth())
    : context.queryClient.ensureQueryData(q.tools()),
  component: () => API_MODE === "http" ? <CoreToolsPage /> : <ToolsPage />,
});
