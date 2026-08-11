import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MANUAL_APPROVAL_JOB_TYPES, OPTIONAL_TARGET_JOB_TYPES, RECON_JOB_TYPES, type JobDto, type ReconJobType } from "@bountyops/shared";
import { Terminal } from "lucide-react";
import { toast } from "sonner";
import { ApiError, coreApi } from "@/lib/api-client";
import { coreQ } from "@/lib/queries";
import { useSelectedProgram } from "./program-context";
import { DataTable } from "./data-table";
import { PageHeader } from "./page-kit";
import { StatusBadge } from "./status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

const display = (value: string) => value.replaceAll("_", " ");
const message = (error: unknown) => error instanceof ApiError ? error.message : "The job request could not be completed.";
const phase10Help: Partial<Record<ReconJobType, string>> = {
  url_archive: "Historical URL collection with gau and waybackurls; no active probing.",
  crawl: "Standard katana crawl only; headless mode is disabled.",
  nuclei_safe: "Safe nuclei tags only. Results are Scanner Findings, not confirmed vulnerabilities.",
};

export function CoreJobsPage() {
  const queryClient = useQueryClient();
  const { selectedProgramId } = useSelectedProgram();
  const programs = useQuery(coreQ.programs());
  const programId = selectedProgramId ?? programs.data?.find((program) => program.status === "active")?.id;
  const jobs = useQuery({ ...coreQ.jobs(programId ? { programId } : {}), refetchInterval: (query) => (query.state.data as JobDto[] | undefined)?.some((job) => job.status === "queued" || job.status === "running") ? 1_000 : 5_000 });
  const health = useQuery({ ...coreQ.queueHealth(), refetchInterval: 5_000 });
  const [type, setType] = useState<ReconJobType>("http_probe");
  const [target, setTarget] = useState("");
  const [manualApproved, setManualApproved] = useState(false);
  const [config, setConfig] = useState("{}");
  const [selected, setSelected] = useState<JobDto | null>(null);
  const logs = useQuery({ ...coreQ.jobLogs(selected?.id ?? ""), enabled: Boolean(selected), refetchInterval: selected?.status === "queued" || selected?.status === "running" ? 1_000 : false });
  const manualType = MANUAL_APPROVAL_JOB_TYPES.includes(type as never);
  const targetOptional = OPTIONAL_TARGET_JOB_TYPES.includes(type as never);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["core", "jobs"] });
  };
  const create = useMutation({
    mutationFn: async () => {
      if (!programId) throw new ApiError(400, "BAD_REQUEST", "Select a program first.");
      if (!targetOptional && !target.trim()) throw new ApiError(400, "BAD_REQUEST", "Target is required for this job type.");
      let parsed: unknown;
      try { parsed = config.trim() ? JSON.parse(config) : {}; } catch { throw new ApiError(400, "BAD_REQUEST", "Config must be valid JSON."); }
      return coreApi.createJob({ programId, type, target: target.trim() || undefined, config: parsed, manualApproved });
    },
    onSuccess: async (job) => { await refresh(); setSelected(job); toast[job.status === "blocked" ? "error" : "success"](job.status === "blocked" ? "Job blocked by Scope Guard" : "Recon job queued"); },
    onError: (error) => toast.error(message(error)),
  });
  const cancel = useMutation({ mutationFn: coreApi.cancelJob, onSuccess: async (job) => { await refresh(); setSelected(job); toast.success("Job cancelled"); }, onError: (error) => toast.error(message(error)) });
  const retry = useMutation({ mutationFn: (id: string) => coreApi.retryJob(id, { manualApproved }), onSuccess: async (job) => { await refresh(); setSelected(job); toast.success(job.status === "blocked" ? "Retry remains blocked" : "Retry queued"); }, onError: (error) => toast.error(message(error)) });
  const rows = useMemo(() => jobs.data ?? [], [jobs.data]);

  return <div className="space-y-5">
    <PageHeader title="Recon jobs" description="Scope-Guarded recon orchestration. Phase 10 supports URL archives, standard crawling, and safe Scanner Findings." />
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <b>Queue: recon-jobs</b>
        <span className="text-muted-foreground">Redis {health.data?.redis ?? (health.isError ? "error" : "checking")} · {health.data?.counts.waiting ?? 0} waiting · {health.data?.counts.active ?? 0} active</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div><Label>Job type</Label><Select value={type} onValueChange={(value) => { setType(value as ReconJobType); setManualApproved(false); }}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{RECON_JOB_TYPES.map((item) => <SelectItem key={item} value={item}>{display(item)}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Target {targetOptional && "(optional)"}</Label><Input className="mt-1" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="https://api.example.com" /></div>
        <div className="md:col-span-2"><Label>Config JSON</Label><Textarea className="mt-1 min-h-10 font-mono" value={config} onChange={(event) => setConfig(event.target.value)} /></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {manualType && <label className="flex items-center gap-2 text-sm"><Checkbox checked={manualApproved} onCheckedChange={(checked) => setManualApproved(checked === true)} />Manual approval confirmed</label>}
        <Button disabled={create.isPending || !programId} onClick={() => create.mutate()}>{create.isPending ? "Validating…" : "Create recon job"}</Button>
      </div>
      {phase10Help[type] && <p className="mt-3 text-xs text-muted-foreground">{phase10Help[type]}</p>}
    </div>
    {jobs.isLoading && <p className="text-sm text-muted-foreground">Loading jobs…</p>}
    {jobs.isError && <div className="rounded-lg border border-destructive/40 p-4 text-sm"><p>{message(jobs.error)}</p><Button className="mt-2" variant="outline" size="sm" onClick={() => jobs.refetch()}>Retry</Button></div>}
    {!jobs.isLoading && !jobs.isError && rows.length === 0 && <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">No jobs yet. Create a Scope-Guarded job above.</p>}
    {rows.length > 0 && <DataTable rows={rows} onRow={setSelected} columns={[
      { key: "type", label: "Job type", render: (job) => <b>{display(job.type)}</b> },
      { key: "target", label: "Target", render: (job) => <span className="font-mono text-xs">{job.target ?? "Program scope"}</span> },
      { key: "status", label: "Status", render: (job) => <StatusBadge value={job.status} /> },
      { key: "stage", label: "Stage", render: (job) => display(job.stage ?? "unknown") },
      { key: "created", label: "Created", render: (job) => new Date(job.createdAt).toLocaleString() },
      { key: "duration", label: "Duration", render: (job) => job.runs?.[0]?.durationMs == null ? "—" : `${job.runs[0].durationMs} ms` },
      { key: "actions", label: "", render: (job) => <div className="flex gap-1" onClick={(event) => event.stopPropagation()}><Button size="sm" variant="ghost" onClick={() => setSelected(job)}><Terminal />Logs</Button>{["queued", "running"].includes(job.status) && <Button size="sm" variant="ghost" disabled={cancel.isPending} onClick={() => cancel.mutate(job.id)}>Cancel</Button>}{["failed", "cancelled", "blocked"].includes(job.status) && <Button size="sm" variant="ghost" disabled={retry.isPending} onClick={() => retry.mutate(job.id)}>Retry</Button>}</div> },
    ]} />}
    <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><SheetContent className="w-full overflow-y-auto sm:max-w-xl"><SheetHeader><SheetTitle>{selected ? display(selected.type) : "Job"} logs</SheetTitle><SheetDescription>Worker lifecycle for {selected?.id}; safe findings remain unverified until manual review.</SheetDescription></SheetHeader>{selected?.runs?.[0]?.resultSummary!=null&&<div className="mt-6 rounded-md border p-3"><p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Result summary</p><pre className="overflow-auto whitespace-pre-wrap font-mono text-xs">{JSON.stringify(selected.runs[0].resultSummary,null,2)}</pre></div>}<pre className="mt-4 overflow-auto whitespace-pre-wrap rounded-md bg-sidebar p-4 font-mono text-xs leading-6 text-sidebar-foreground">{logs.isLoading ? "Loading logs…" : logs.isError ? message(logs.error) : (logs.data?.logs ?? []).map((line) => `${line.timestamp} [${line.level}] ${line.message}`).join("\n") || "No logs yet."}</pre></SheetContent></Sheet>
  </div>;
}
