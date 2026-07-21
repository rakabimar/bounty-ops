import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { Program, Rules, ScopeAsset } from "@/lib/bounty-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function getScopeGuard(program: Program | undefined, rules: Rules | undefined, scopes: ScopeAsset[]) {
  const checks = [
    { label:"Program active", ok:program?.status==="active", warning:false },
    { label:"Automation allowed", ok:rules?.automation==="yes"||rules?.automation==="limited", warning:rules?.automation==="limited" },
    { label:"Aggressive allowed", ok:rules?.aggressive===true, warning:rules?.aggressive===false, optional:true },
    { label:"In-scope assets configured", ok:scopes.some(x=>x.scope==="in_scope"), warning:false },
    { label:"No out-of-scope conflicts", ok:!scopes.some(x=>x.conflict), warning:false },
    { label:"Required headers configured", ok:(rules?.headers.filter(x=>x.enabled).length??0)>0, warning:true, optional:true },
    { label:"Rate limit configured", ok:(rules?.rateLimit??0)>0, warning:false },
    { label:"Max concurrency configured", ok:(rules?.concurrency??0)>0, warning:false },
  ];
  const safe=checks.filter(x=>!x.optional).every(x=>x.ok)&&rules?.validated===true;
  return {checks,safe};
}

export function ScopeGuardPanel({program,rules,scopes}:{program:Program|undefined;rules:Rules|undefined;scopes:ScopeAsset[]}) {
  const {checks,safe}=getScopeGuard(program,rules,scopes);
  const blockers=checks.filter(x=>!x.ok&&!x.optional).map(x=>x.label);
  return <Card className={safe?"border-success/30":"border-destructive/30"}><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base">{safe?<CheckCircle2 className="text-success"/>:<XCircle className="text-destructive"/>}{safe?"Safe to run recon":"Not safe to run recon"}</CardTitle><p className="text-xs text-muted-foreground">{safe?"Program policy, scope, and execution limits pass the safety gate.":`Blocked by: ${blockers.join(", ")||"rules require validation"}.`}</p></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{checks.map(check=><div key={check.label} className="flex items-center gap-2 rounded-md border p-2 text-xs">{check.ok?<CheckCircle2 className="size-4 text-success"/>:check.warning?<AlertTriangle className="size-4 text-warning"/>:<XCircle className="size-4 text-destructive"/>}<span>{check.label}</span></div>)}</CardContent></Card>;
}