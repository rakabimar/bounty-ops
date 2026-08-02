import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { AssetDto, Category, HttpServiceDto, Priority, ReasonTag } from "@bountyops/shared";
import { toast } from "sonner";
import { coreApi } from "@/lib/api-client";
import { coreQ } from "@/lib/queries";
import { useSelectedProgram } from "./program-context";
import { DataTable } from "./data-table";
import { PageHeader } from "./page-kit";
import { StatusBadge } from "./status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const textError = (error: unknown) => error instanceof Error ? error.message : "Unable to load recon results.";
const list = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export function ReconAssetsPage() {
  const { selectedProgramId } = useSelectedProgram();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [reasonTag, setReasonTag] = useState("");
  const [priority, setPriority] = useState("");
  const [minScore, setMinScore] = useState("");
  const [manualOnly, setManualOnly] = useState(false);
  const [selected, setSelected] = useState<AssetDto | null>(null);
  const [manualScore, setManualScore] = useState("");
  const filters = {
    programId: selectedProgramId, search: search || undefined, category: category as Category || undefined,
    reasonTag: reasonTag as ReasonTag || undefined, priority: priority as Priority || undefined,
    minScore: minScore === "" ? undefined : Number(minScore), hasManualScore: manualOnly || undefined, limit: 200,
  };
  const query = useQuery(coreQ.assets(filters));
  const detail = useQuery({ ...coreQ.asset(selected?.id ?? ""), enabled: Boolean(selected) });
  const explanation = useQuery({ ...coreQ.scoreExplanation(selected?.id ?? ""), enabled: Boolean(selected) });
  useEffect(() => { setManualScore(explanation.data?.manualScore?.toString() ?? ""); }, [explanation.data?.manualScore, selected?.id]);
  const override = useMutation({
    mutationFn: (value: number | null) => coreApi.updateAssetManualScore(selected!.id, value),
    onSuccess: async (asset) => {
      setSelected(asset);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["core", "assets"] }),
        queryClient.invalidateQueries({ queryKey: ["core", "manual-review"] }),
        queryClient.invalidateQueries({ queryKey: ["core", "assets", asset.id, "score-explanation"] }),
      ]);
      toast.success("Manual score updated");
    },
    onError: (error) => toast.error(textError(error)),
  });

  return <div className="space-y-5">
    <PageHeader title="Asset inventory" description="Prioritized recon assets with config-driven score evidence." />
    <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search assets" />
      <Input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Category" />
      <Input value={reasonTag} onChange={(event) => setReasonTag(event.target.value)} placeholder="Reason tag" />
      <select className="h-9 rounded-md border bg-background px-3 text-sm" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">All priorities</option><option>P1</option><option>P2</option><option>Monitor</option><option>Low</option></select>
      <Input type="number" min={0} value={minScore} onChange={(event) => setMinScore(event.target.value)} placeholder="Min score" />
      <div className="flex items-center gap-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={manualOnly} onChange={(event) => setManualOnly(event.target.checked)} />Manual only</label><Button variant="outline" onClick={() => query.refetch()}>Refresh</Button></div>
    </div>
    {query.isLoading && <p className="text-sm text-muted-foreground">Loading assets...</p>}
    {query.isError && <p className="rounded-lg border border-destructive/40 p-4 text-sm">{textError(query.error)}</p>}
    {query.data?.length === 0 && <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">No assets match these filters.</p>}
    {query.data && query.data.length > 0 && <DataTable rows={query.data} onRow={setSelected} columns={[
      { key: "value", label: "Asset", render: (item) => <span className="font-mono">{item.value}</span> },
      { key: "type", label: "Type", render: (item) => item.type },
      { key: "scope", label: "Scope", render: (item) => <StatusBadge value={item.scopeStatus} /> },
      { key: "priority", label: "Priority", render: (item) => <StatusBadge value={item.priority} /> },
      { key: "score", label: "Score", render: (item) => <span><b className="text-primary">{item.finalScore}</b>{item.manualScore !== null && <span className="ml-1 text-xs text-muted-foreground">manual</span>}</span> },
      { key: "categories", label: "Categories", render: (item) => list(item.categories).join(", ") || "-" },
      { key: "seen", label: "Last seen", render: (item) => new Date(item.lastSeenAt).toLocaleString() },
      { key: "action", label: "", render: (item) => <Button asChild variant="ghost" size="sm"><Link to="/assets/$assetId" params={{ assetId: item.id }}>Target Detail</Link></Button> },
    ]} />}
    <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader><SheetTitle>{selected?.value}</SheetTitle><SheetDescription>Why this score?</SheetDescription></SheetHeader>
        {explanation.isLoading && <p className="mt-6">Loading score explanation...</p>}
        {explanation.isError && <p className="mt-6 text-sm text-destructive">{textError(explanation.error)}</p>}
        {explanation.data && <div className="mt-6 space-y-5 text-sm">
          <div className="grid grid-cols-4 gap-2">{[["Auto", explanation.data.autoScore], ["Manual", explanation.data.manualScore ?? "-"], ["Final", explanation.data.finalScore], ["Priority", explanation.data.priority]].map(([label, value]) => <div key={label} className="rounded-md border p-3 text-center"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-lg font-bold">{value}</div></div>)}</div>
          <p><b>Confidence:</b> {explanation.data.confidence}%</p>
          <div><b>Categories:</b><div className="mt-2 flex flex-wrap gap-1">{explanation.data.categories.map((item) => <StatusBadge key={item} value={item} />)}</div></div>
          <div><b>Reason tags:</b><div className="mt-2 flex flex-wrap gap-1">{explanation.data.reasonTags.map((item) => <StatusBadge key={item} value={item} />)}</div></div>
          <div className="space-y-2"><b>Score events</b>{explanation.data.events.map((item, index) => <div key={`${item.ruleId}-${index}`} className="rounded-md border p-3"><div className="flex justify-between"><span>{item.ruleName ?? item.reasonTag}</span><b className={item.scoreDelta >= 0 ? "text-primary" : "text-destructive"}>{item.scoreDelta >= 0 ? "+" : ""}{item.scoreDelta}</b></div>{item.evidence && <pre className="mt-2 overflow-auto text-xs text-muted-foreground">{JSON.stringify(item.evidence, null, 2)}</pre>}</div>)}</div>
          <div className="rounded-md border p-3"><b>Manual override</b><div className="mt-2 flex gap-2"><Input type="number" min={0} max={100} value={manualScore} onChange={(event) => setManualScore(event.target.value)} placeholder="0-100" /><Button disabled={override.isPending || manualScore === ""} onClick={() => override.mutate(Number(manualScore))}>Set</Button><Button variant="outline" disabled={override.isPending || explanation.data.manualScore === null} onClick={() => override.mutate(null)}>Clear</Button></div></div>
          {detail.data && <p className="text-muted-foreground">{detail.data.dnsRecords.length} DNS records, {detail.data.httpServices.length} HTTP services, {detail.data.changes.length} changes</p>}
        </div>}
      </SheetContent>
    </Sheet>
  </div>;
}

export function ReconLiveHostsPage() {
  const { selectedProgramId } = useSelectedProgram(); const [search, setSearch] = useState("");
  const query = useQuery(coreQ.httpServices({ programId: selectedProgramId, search: search || undefined, limit: 200 }));
  return <div className="space-y-5"><PageHeader title="Live hosts" description="HTTP services parsed from real httpx JSONL output." /><div className="flex gap-2"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search URL, host, or title" /><Button variant="outline" onClick={() => query.refetch()}>Refresh</Button></div>{query.isLoading && <p className="text-sm text-muted-foreground">Loading services...</p>}{query.isError && <p className="rounded-lg border border-destructive/40 p-4 text-sm">{textError(query.error)}</p>}{query.data?.length === 0 && <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">No live HTTP services have been stored yet.</p>}{query.data && query.data.length > 0 && <DataTable rows={query.data as HttpServiceDto[]} columns={[
    { key: "url", label: "URL", render: (item) => <a className="font-mono text-xs hover:text-primary" href={item.url} target="_blank" rel="noreferrer">{item.url}</a> }, { key: "status", label: "HTTP", render: (item) => <StatusBadge value={String(item.statusCode ?? "failed")} /> }, { key: "title", label: "Title", render: (item) => item.title ?? "-" }, { key: "tech", label: "Technologies", render: (item) => list(item.technologies).join(", ") || "-" }, { key: "server", label: "Server", render: (item) => item.webserver ?? "-" }, { key: "seen", label: "Last seen", render: (item) => new Date(item.lastSeenAt).toLocaleString() },
  ]} />}</div>;
}
