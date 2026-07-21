import { createFileRoute } from "@tanstack/react-router";
import { ProgramsPage } from "@/components/core-program-pages";
import { coreQ } from "@/lib/queries";
export const Route=createFileRoute("/_authenticated/programs")({loader:({context})=>context.queryClient.ensureQueryData(coreQ.programs()),component:ProgramsPage});
