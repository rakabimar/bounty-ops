import { createFileRoute } from "@tanstack/react-router";
import { UrlsPage } from "@/components/inventory-pages";
import { CoreUrlsPage } from "@/components/core-detail-inventory";
import { API_MODE } from "@/lib/api-client";
export const Route = createFileRoute("/_authenticated/urls/")({
  component: () => API_MODE === "http" ? <CoreUrlsPage /> : <UrlsPage />,
});
