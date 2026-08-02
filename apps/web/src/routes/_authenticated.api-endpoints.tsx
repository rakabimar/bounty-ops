import { createFileRoute } from "@tanstack/react-router";
import { ApiEndpointsPage } from "@/components/inventory-pages";
import { CoreEndpointsPage } from "@/components/core-detail-inventory";
import { API_MODE } from "@/lib/api-client";
export const Route=createFileRoute("/_authenticated/api-endpoints")({component:()=>API_MODE === "http" ? <CoreEndpointsPage /> : <ApiEndpointsPage />});
