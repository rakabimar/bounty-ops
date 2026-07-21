import { createFileRoute } from "@tanstack/react-router";
import { NotificationsPage } from "@/components/core-admin-pages";
import { coreQ } from "@/lib/queries";
export const Route=createFileRoute("/_authenticated/notifications")({loader:({context})=>context.queryClient.ensureQueryData(coreQ.settings()),component:NotificationsPage});
