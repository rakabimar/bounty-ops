import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { coreQ } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { DataTable } from "./data-table";
import { PageHeader } from "./page-kit";
import { StatusBadge } from "./status-badge";

export function CoreToolsPage() {
  const health = useQuery(coreQ.toolHealth());
  const rows = (health.data ?? []).map((tool) => ({ ...tool, id: tool.name }));
  return <div className="space-y-5">
    <PageHeader title="Tool health" description="Local PATH availability for the Phase 6 and Phase 10 recon tools." actions={<Button variant="outline" disabled={health.isFetching} onClick={() => health.refetch()}><RotateCcw />Refresh</Button>} />
    {health.isLoading && <p className="text-sm text-muted-foreground">Checking local tools…</p>}
    {health.isError && <div className="rounded-lg border border-destructive/40 p-4 text-sm">Tool health could not be loaded.</div>}
    {rows.length > 0 && <DataTable rows={rows} columns={[
      { key: "tool", label: "Tool", render: (row) => <b className="font-mono">{row.name}</b> },
      { key: "available", label: "Health", render: (row) => <StatusBadge value={row.available ? "available" : "missing"} /> },
      { key: "version", label: "Version", render: (row) => <span className="font-mono text-xs">{row.version ?? "—"}</span> },
      { key: "details", label: "Details", render: (row) => <span className="text-xs text-muted-foreground">{row.error ?? "Ready"}</span> },
    ]} />}
  </div>;
}
