import { createFileRoute } from "@tanstack/react-router";
import { ProgramDetailPage } from "@/components/core-program-pages";
import { coreQ } from "@/lib/queries";
export const Route=createFileRoute("/_authenticated/programs/$programId")({loader:({context,params})=>context.queryClient.ensureQueryData(coreQ.program(params.programId)),component:()=>{const {programId}=Route.useParams();return <ProgramDetailPage id={programId}/>}});
