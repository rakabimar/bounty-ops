import { createFileRoute } from "@tanstack/react-router";
import { AuditLogsPage } from "@/components/core-admin-pages";
export const Route=createFileRoute("/_authenticated/audit-logs")({component:AuditLogsPage});
