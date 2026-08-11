import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ApiEndpointDto, UrlDto } from "@bountyops/shared";
import { coreQ } from "@/lib/queries";
import { useSelectedProgram } from "./program-context";
import { PageHeader } from "./page-kit";
import { DataTable } from "./data-table";
import { StatusBadge } from "./status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function CoreUrlsPage() {
  const { selectedProgramId } = useSelectedProgram();
  const [search, setSearch] = useState("");
  const query = useQuery(coreQ.urls({ programId: selectedProgramId, search: search || undefined, limit: 200 }));
  return <div className="space-y-5">
    <PageHeader title="URLs / Pages" description="Real URLs collected from archives and standard crawling." />
    <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search URLs, paths, or titles" />
    {query.isLoading && <p>Loading URLs...</p>}
    {query.isError && <p className="text-destructive">{query.error instanceof Error ? query.error.message : "Unable to load URLs"}</p>}
    {query.data?.length === 0 && <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">No URLs stored yet.</p>}
    {query.data && query.data.length > 0 && <DataTable rows={query.data} columns={[
      { key: "url", label: "URL", render: (item: UrlDto) => <span className="font-mono text-xs">{item.url}</span> },
      { key: "http", label: "HTTP", render: (item: UrlDto) => item.statusCode ?? "-" },
      { key: "source", label: "Source", render: (item: UrlDto) => <span className="text-xs">{Array.isArray(item.sourceTools) ? item.sourceTools.join(", ") : "-"}</span> },
      { key: "status", label: "State", render: (item: UrlDto) => <StatusBadge value={item.status} /> },
      { key: "priority", label: "Priority", render: (item: UrlDto) => <StatusBadge value={item.priority} /> },
      { key: "score", label: "Score", render: (item: UrlDto) => item.finalScore },
      { key: "action", label: "", render: (item: UrlDto) => <Button asChild variant="ghost" size="sm"><Link to="/urls/$urlId" params={{ urlId: item.id }}>URL Detail</Link></Button> },
    ]} />}
  </div>;
}

export function CoreEndpointsPage() {
  const { selectedProgramId } = useSelectedProgram();
  const [search, setSearch] = useState("");
  const query = useQuery(coreQ.endpoints({ programId: selectedProgramId, search: search || undefined, limit: 200 }));
  return <div className="space-y-5">
    <PageHeader title="API endpoints" description="Real endpoints inferred from standard crawl output and manual fixtures." />
    <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search endpoint path or URL" />
    {query.isLoading && <p>Loading endpoints...</p>}
    {query.isError && <p className="text-destructive">{query.error instanceof Error ? query.error.message : "Unable to load endpoints"}</p>}
    {query.data?.length === 0 && <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">No endpoints stored yet.</p>}
    {query.data && query.data.length > 0 && <DataTable rows={query.data} columns={[
      { key: "method", label: "Method", render: (item: ApiEndpointDto) => <StatusBadge value={item.method} /> },
      { key: "path", label: "Path", render: (item: ApiEndpointDto) => <span className="font-mono text-xs">{item.path}</span> },
      { key: "source", label: "Source", render: (item: ApiEndpointDto) => item.source },
      { key: "auth", label: "Auth", render: (item: ApiEndpointDto) => <StatusBadge value={item.authRequired} /> },
      { key: "params", label: "Params", render: (item: ApiEndpointDto) => item.parametersCount ?? 0 },
      { key: "priority", label: "Priority", render: (item: ApiEndpointDto) => <StatusBadge value={item.priority} /> },
      { key: "action", label: "", render: (item: ApiEndpointDto) => <Button asChild variant="ghost" size="sm"><Link to="/endpoints/$endpointId" params={{ endpointId: item.id }}>Endpoint Detail</Link></Button> },
    ]} />}
  </div>;
}
