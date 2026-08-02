import { createFileRoute } from "@tanstack/react-router";
import { ProgramDetailPage } from "@/components/core-program-pages";
import { ScopeGuardHttpPanel } from "@/components/scope-guard-panel";
import { coreQ } from "@/lib/queries";
export const Route=createFileRoute("/_authenticated/programs/$programId")({loader:({context,params})=>context.queryClient.ensureQueryData(coreQ.program(params.programId)),component:()=>{const {programId}=Route.useParams();return <div className="space-y-5"><ScopeGuardHttpPanel programId={programId}/><ProgramDetailPage id={programId}/></div>}});
