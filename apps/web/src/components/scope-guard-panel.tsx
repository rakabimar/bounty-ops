import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { RECON_JOB_TYPES, type ReconJobType, type ScopeGuardPreflightResult } from "@bountyops/shared";
import { AlertTriangle, CheckCircle2, Play, XCircle } from "lucide-react";
import type { Program, Rules, ScopeAsset } from "@/lib/bounty-types";
import { coreApi } from "@/lib/api-client";
import { coreQ } from "@/lib/queries";
import { StatusBadge } from "./status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

export function ScopeGuardHttpPanel({ programId }: { programId: string }) {
  const summary = useQuery(coreQ.scopeGuardSummary(programId));
  const [target, setTarget] = useState("");
  const [jobType, setJobType] = useState<ReconJobType>("http_probe");
  const [result, setResult] = useState<ScopeGuardPreflightResult | null>(null);
  const preflight = useMutation({
    mutationFn: () => coreApi.runScopeGuardPreflight({ programId, target, jobType }),
    onSuccess: setResult,
  });
  const error = summary.error ?? preflight.error;

  return (
    <Card className={result?.decision === "blocked" ? "border-destructive/30" : "border-primary/30"}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span>Scope Guard</span>
          {result ? <StatusBadge value={result.decision} /> : summary.data ? <StatusBadge value={summary.data.automationAllowed} /> : null}
        </CardTitle>
        <p className="text-xs text-muted-foreground">Backend preflight only. No recon command or queue job is started.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary.isLoading ? <p className="text-sm text-muted-foreground">Loading policy summary…</p> : summary.data ? (
          <div className="grid gap-2 text-xs sm:grid-cols-4">
            <GuardMetric label="In scope" value={summary.data.inScopeCount} />
            <GuardMetric label="Out of scope" value={summary.data.outOfScopeCount} />
            <GuardMetric label="Effective RPS" value={summary.data.rateLimitRps} />
            <GuardMetric label="Concurrency" value={summary.data.maxConcurrency} />
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-end">
          <div className="space-y-2"><Label>Target</Label><Input value={target} onChange={(event) => setTarget(event.target.value)} placeholder="https://api.example.com/path" /></div>
          <div className="space-y-2"><Label>Job type</Label><Select value={jobType} onValueChange={(value) => setJobType(value as ReconJobType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RECON_JOB_TYPES.map((value) => <SelectItem key={value} value={value}>{value.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select></div>
          <Button disabled={!target.trim() || preflight.isPending} onClick={() => preflight.mutate()}><Play />{preflight.isPending ? "Checking…" : "Run preflight"}</Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error instanceof Error ? error.message : "Scope Guard request failed"}</p> : null}
        {result ? (
          <div className="rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><b>{result.normalizedTarget.normalized}</b><span className="font-mono text-xs">{result.effectiveRateLimitRps} RPS · {result.effectiveMaxConcurrency} concurrent</span></div>
            <p className="mt-2 text-xs text-muted-foreground">{result.reasons.join(" · ")}</p>
            {result.requiredHeaders.length ? <p className="mt-2 text-xs">Required headers: {result.requiredHeaders.map((header) => header.name).join(", ")}</p> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function GuardMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-md border p-2"><span className="text-muted-foreground">{label}</span><b className="mt-1 block font-mono">{value}</b></div>;
}
