import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/core-admin-pages";
import { coreQ } from "@/lib/queries";
export const Route=createFileRoute("/_authenticated/settings")({loader:({context})=>context.queryClient.ensureQueryData(coreQ.settings()),component:SettingsPage});
