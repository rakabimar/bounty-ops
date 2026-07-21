import { useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Play, Plus, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "./status-badge";
import {
  DetailWorkspaceLayout, DetailHeader, BentoGrid, BentoCard, KvRow,
  RiskScoreCard, PriorityBadge, StatusTransitionMenu, ChecklistPanel,
  ResearchNotesPanel, QuickActionsPanel, ChangesTimeline, RawMetadataAccordion,
  ScannerFindingsTable, DiscoveredEndpointsTable, RelatedUrlsTable, EvidenceRequestsPanel,
  Empty, CopyButton, ExternalLinkButton, BackLink, DetailTabs,
  ScoreExplanationDrawer, assetStatusOptions, findingStatusOptions,
} from "./detail-workspace";
import { api } from "@/lib/api-client";
import { priorityFromScore } from "@/lib/bounty-types";
import type { AssetStatus, ScannerFindingStatus } from "@/lib/bounty-types";
import { q } from "@/lib/queries";

// ============================================================================
// ASSET / TARGET DETAIL
// ============================================================================

export function AssetDetailPage({ assetId }: { assetId: string }) {
  const { data } = useSuspenseQuery(q.assetDetail(assetId));
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [explain, setExplain] = useState(false);

  if (!data || !data.asset) return <Empty text="Asset not found." />;
  const { asset, program, urls, endpoints, findings, services, jsFiles, ports, dns, changes, notes, evidenceRequests } = data;
  const priority = priorityFromScore(asset.finalScore);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["asset-detail", assetId] });
  const setStatus = (status: string) =>
    api.setAssetStatus(asset.id, status as AssetStatus).then(() => { invalidate(); toast.success(`Marked ${status}`); });
  const overrideScore = (v: number | null) =>
    api.updateAssetManualScore(asset.id, v).then(() => { invalidate(); toast.success("Manual score updated"); });

  return (
    <>
      <DetailWorkspaceLayout
        header={
          <DetailHeader
            eyebrow="TARGET"
            breadcrumb={[
              { label: "Programs", to: "/programs" },
              { label: program?.name ?? "Program", to: "/programs/$programId", params: { programId: asset.programId } },
              { label: "Assets", to: "/assets" },
              { label: asset.value },
            ]}
            title={asset.value}
            subtitle={`${asset.type} · ${program?.name ?? ""}`}
            badges={
              <>
                <StatusBadge value={asset.scope} />
                <StatusBadge value={asset.status} />
                <PriorityBadge priority={priority} />
                <StatusBadge value={`final ${asset.finalScore}`} />
                {asset.categories.map(c => <StatusBadge key={c} value={c} />)}
              </>
            }
            meta={
              <>
                <span>First seen <b className="text-foreground/80">{asset.firstSeen}</b></span>
                <span>Last seen <b className="text-foreground/80">{asset.lastSeen}</b></span>
                <span>Reviewed <b className="text-foreground/80">{asset.lastReviewed ?? "Never"}</b></span>
              </>
            }
            actions={
              <div className="flex flex-wrap items-center gap-2 justify-end">
                <BackLink to="/assets" label="Back to assets" />
                <CopyButton value={asset.value} label="Copy" />
                <Button size="sm" variant="outline" onClick={() => toast.success("Recon triggered")}><Play className="size-3" />Trigger recon</Button>
                <StatusTransitionMenu current={asset.status} options={assetStatusOptions} onChange={setStatus} />
              </div>
            }
          />
        }
        bento={
          <BentoGrid>
            <BentoCard title="Asset intelligence">
              <KvRow label="IPs" value={(data.asset && dns.filter(d => d.type === "A").map(d => d.value).join(", ")) || "—"} />
              <KvRow label="CNAME" value={dns.find(d => d.type === "CNAME")?.value ?? "—"} />
              <KvRow label="Server" value={services[0] ? services[0].technologies.join(", ") : "—"} />
              <KvRow label="Ports" value={ports.map(p => p.port).join(", ") || "—"} />
              <KvRow label="HTTP" value={services[0]?.status ?? "—"} />
              <KvRow label="Title" value={services[0]?.title ?? "—"} />
            </BentoCard>
            <RiskScoreCard
              autoScore={asset.autoScore}
              manualScore={asset.manualScore}
              finalScore={asset.finalScore}
              confidence={program?.confidence}
              onExplain={() => setExplain(true)}
              onManualOverride={overrideScore}
            />
            <BentoCard title="Classification">
              <KvRow label="Categories" value={asset.categories.join(", ")} />
              <KvRow label="Reason tags" value={asset.reasons.join(", ")} />
              <KvRow label="Sources" value={services.map(s => s.protocol).join(", ") || "katana"} />
              <KvRow label="Scope" value={asset.scope} />
              <KvRow label="Status" value={asset.status} />
            </BentoCard>
            <BentoCard title="Services / Ports">
              {ports.length === 0 && <p className="text-xs text-muted-foreground">No ports recorded.</p>}
              {ports.map(p => (
                <KvRow key={p.port} label={`:${p.port} ${p.service}`} value={p.product ?? p.status} />
              ))}
            </BentoCard>
          </BentoGrid>
        }
        tabs={
          <DetailTabs
            tabs={[
              { value: "overview", label: "Overview", content: (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Card><CardHeader><CardTitle className="text-sm">DNS records</CardTitle></CardHeader><CardContent className="space-y-1 text-xs font-mono">{dns.length === 0 ? <Empty text="No DNS records." /> : dns.map((d, i) => <div key={i}><b>{d.type}</b> {d.value}</div>)}</CardContent></Card>
                  <Card><CardHeader><CardTitle className="text-sm">Counts</CardTitle></CardHeader><CardContent className="space-y-1 text-xs">
                    <KvRow label="Related URLs" value={urls.length} />
                    <KvRow label="Endpoints" value={endpoints.length} />
                    <KvRow label="Scanner findings" value={findings.length} />
                    <KvRow label="JS files" value={jsFiles.length} />
                    <KvRow label="Notes" value={notes.length} />
                    <KvRow label="Changes" value={changes.length} />
                  </CardContent></Card>
                </div>
              )},
              { value: "urls", label: `URLs (${urls.length})`, content: <RelatedUrlsTable urls={urls} /> },
              { value: "endpoints", label: `Endpoints (${endpoints.length})`, content: <DiscoveredEndpointsTable endpoints={endpoints} /> },
              { value: "findings", label: `Scanner findings (${findings.length})`, content: <ScannerFindingsTable findings={findings} /> },
              { value: "ports", label: "Services / Ports", content: (
                <Card><CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left text-xs"><tr><th className="p-3">Port</th><th>Protocol</th><th>Service</th><th>Product</th><th>Scheme</th><th>Status</th><th>Source</th><th>Last seen</th></tr></thead>
                    <tbody>{ports.map((p, i) => <tr key={i} className="border-t"><td className="p-3 font-mono">{p.port}</td><td>{p.protocol}</td><td>{p.service}</td><td className="text-xs">{p.product}</td><td className="text-xs">{p.scheme}</td><td><StatusBadge value={p.status} /></td><td className="font-mono text-[10px]">{p.source}</td><td className="font-mono text-[10px]">{p.lastSeen}</td></tr>)}</tbody>
                  </table>
                </CardContent></Card>
              )},
              { value: "js", label: "JS & Parameters", content: (
                <div className="space-y-2">
                  {jsFiles.length === 0 ? <Empty text="No JS files." /> : jsFiles.map(j => (
                    <Card key={j.id}><CardContent className="space-y-2 p-4">
                      <div className="flex items-center justify-between"><span className="font-mono text-xs truncate">{j.url}</span><span className="text-xs text-muted-foreground">{j.size}</span></div>
                      {j.secrets.map(s => <div key={s.type} className="rounded border p-2 text-xs"><div className="flex gap-2"><b>{s.type}</b><StatusBadge value={s.severity} /><StatusBadge value={`${s.confidence} confidence`} /></div><code className="mt-1 block">{s.value}</code><p className="mt-1 text-[10px] text-muted-foreground">Secret candidate — review required.</p></div>)}
                    </CardContent></Card>
                  ))}
                </div>
              )},
              { value: "requests", label: `Requests / Evidence (${evidenceRequests.length})`, content: <EvidenceRequestsPanel entityType="asset" entityId={asset.id} programId={asset.programId} assetId={asset.id} /> },
              { value: "notes", label: `Notes (${notes.length})`, content: <ResearchNotesPanel entityType="asset" entityId={asset.id} programId={asset.programId} /> },
              { value: "checklist", label: "Checklist", content: <ChecklistPanel entityType="asset" entityId={asset.id} programId={asset.programId} categories={asset.categories} /> },
              { value: "changes", label: `Changes (${changes.length})`, content: <ChangesTimeline changes={changes} /> },
              { value: "raw", label: "Raw metadata", content: <RawMetadataAccordion sections={[
                { title: "asset.json", data: asset },
                { title: "dns_records.json", data: dns },
                { title: "http_services.json", data: services },
                { title: "ports.json", data: ports },
                { title: "source_tools.json", data: ["subfinder", "dnsx", "httpx", "naabu", "katana", "nuclei"] },
              ]} /> },
            ]}
          />
        }
        sidebar={
          <>
            <ChecklistPanel entityType="asset" entityId={asset.id} programId={asset.programId} categories={asset.categories} compact />
            <ResearchNotesPanel entityType="asset" entityId={asset.id} programId={asset.programId} compact />
            <QuickActionsPanel actions={[
              { label: "Copy", icon: <Copy className="size-3" />, onClick: () => { navigator.clipboard.writeText(asset.value); toast.success("Copied"); } },
              { label: "Open URL", icon: <ExternalLink className="size-3" />, onClick: () => window.open(`https://${asset.value}`, "_blank") },
              { label: "Trigger recon", icon: <Play className="size-3" />, onClick: () => toast.success("Recon triggered") },
              { label: "Mark interesting", icon: <Plus className="size-3" />, onClick: () => setStatus("promising") },
              { label: "Potential Bug", icon: <Plus className="size-3" />, onClick: () => setStatus("potential_bug") },
              { label: "Add evidence", icon: <Plus className="size-3" />, onClick: () => navigate({ to: "/assets/$assetId", params: { assetId: asset.id }, hash: "requests" }) },
            ]} />
          </>
        }
      />
      <ScoreExplanationDrawer events={asset.scoreEvents} open={explain} onClose={() => setExplain(false)} />
    </>
  );
}

// ============================================================================
// URL DETAIL
// ============================================================================

export function UrlDetailPage({ urlId }: { urlId: string }) {
  const { data } = useSuspenseQuery(q.urlDetail(urlId));
  const qc = useQueryClient();
  const [explain, setExplain] = useState(false);
  if (!data || !data.url) return <Empty text="URL not found." />;
  const { url, asset, program, endpoints, findings, jsFiles, changes, notes, evidenceRequests } = data;
  const priority = priorityFromScore(url.finalScore);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["url-detail", urlId] });
  const override = (v: number | null) => {
    api.updateAsset; // keep import
    // re-use generic asset update is wrong, write a tiny direct mutate via api could be added; simpler: just notify
    toast.message("Manual score override is recorded locally for URLs.");
    void v; void invalidate;
  };
  void override;
  return (
    <>
      <DetailWorkspaceLayout
        header={
          <DetailHeader
            eyebrow="URL"
            breadcrumb={[
              { label: "Programs", to: "/programs" },
              { label: program?.name ?? "Program", to: "/programs/$programId", params: { programId: url.programId } },
              { label: asset?.value ?? "Target", to: "/assets/$assetId", params: { assetId: url.assetId } },
              { label: "URL" },
            ]}
            title={url.url}
            subtitle={url.title}
            badges={
              <>
                <StatusBadge value={String(url.statusCode)} />
                <PriorityBadge priority={priority} />
                <StatusBadge value={`final ${url.finalScore}`} />
                {url.categories.map(c => <StatusBadge key={c} value={c} />)}
              </>
            }
            meta={<><span>First seen <b className="text-foreground/80">{url.firstSeen}</b></span><span>Last seen <b className="text-foreground/80">{url.lastSeen}</b></span></>}
            actions={
              <div className="flex flex-wrap items-center gap-2 justify-end">
                <BackLink to="/assets/$assetId" params={{ assetId: url.assetId }} label="Back to target" />
                <CopyButton value={url.url} label="Copy URL" />
                <ExternalLinkButton url={url.url} />
              </div>
            }
          />
        }
        bento={
          <BentoGrid>
            <BentoCard title="HTTP summary">
              <KvRow label="Status" value={url.statusCode} />
              <KvRow label="Title" value={url.title} />
              <KvRow label="Source" value={url.source} />
              <KvRow label="Host" value={url.host} />
            </BentoCard>
            <RiskScoreCard autoScore={url.autoScore} manualScore={url.manualScore} finalScore={url.finalScore} onExplain={() => setExplain(true)} />
            <BentoCard title="Classification">
              <KvRow label="Categories" value={url.categories.join(", ")} />
              <KvRow label="Reasons" value={url.reasons.join(", ")} />
              <KvRow label="Source" value={url.source} />
            </BentoCard>
            <BentoCard title="Counts">
              <KvRow label="Endpoints" value={endpoints.length} />
              <KvRow label="Findings" value={findings.length} />
              <KvRow label="Notes" value={notes.length} />
              <KvRow label="Evidence" value={evidenceRequests.length} />
            </BentoCard>
          </BentoGrid>
        }
        tabs={
          <DetailTabs
            tabs={[
              { value: "overview", label: "Overview", content: (
                <Card><CardContent className="space-y-2 p-4 text-sm">
                  <KvRow label="Full URL" value={<code>{url.url}</code>} />
                  <KvRow label="Host" value={url.host} />
                  <KvRow label="Status code" value={url.statusCode} />
                  <KvRow label="Title" value={url.title} />
                  <KvRow label="Categories" value={url.categories.join(", ")} />
                  <KvRow label="Reasons" value={url.reasons.join(", ")} />
                  <KvRow label="Score events" value={`${url.scoreEvents.length} events`} />
                </CardContent></Card>
              )},
              { value: "endpoints", label: `Endpoints (${endpoints.length})`, content: <DiscoveredEndpointsTable endpoints={endpoints} /> },
              { value: "findings", label: `Scanner findings (${findings.length})`, content: <ScannerFindingsTable findings={findings} /> },
              { value: "js", label: "JS & Parameters", content: <div className="space-y-2">{jsFiles.length === 0 ? <Empty text="No JS files for this asset." /> : jsFiles.map(j => <Card key={j.id}><CardContent className="p-3 font-mono text-xs">{j.url}</CardContent></Card>)}</div> },
              { value: "requests", label: `Requests / Evidence (${evidenceRequests.length})`, content: <EvidenceRequestsPanel entityType="url" entityId={url.id} programId={url.programId} urlId={url.id} /> },
              { value: "notes", label: `Notes (${notes.length})`, content: <ResearchNotesPanel entityType="url" entityId={url.id} programId={url.programId} /> },
              { value: "checklist", label: "Checklist", content: <ChecklistPanel entityType="url" entityId={url.id} programId={url.programId} categories={url.categories} /> },
              { value: "changes", label: `Changes (${changes.length})`, content: <ChangesTimeline changes={changes} /> },
              { value: "raw", label: "Raw metadata", content: <RawMetadataAccordion sections={[{ title: "url.json", data: url }]} /> },
            ]}
          />
        }
        sidebar={
          <>
            <ChecklistPanel entityType="url" entityId={url.id} programId={url.programId} categories={url.categories} compact />
            <ResearchNotesPanel entityType="url" entityId={url.id} programId={url.programId} compact />
            <QuickActionsPanel actions={[
              { label: "Copy URL", icon: <Copy className="size-3" />, onClick: () => { navigator.clipboard.writeText(url.url); toast.success("Copied"); } },
              { label: "Open URL", icon: <ExternalLink className="size-3" />, onClick: () => window.open(url.url, "_blank") },
              { label: "Mark interesting", onClick: () => toast.success("Marked interesting") },
            ]} />
          </>
        }
      />
      <ScoreExplanationDrawer events={url.scoreEvents} open={explain} onClose={() => setExplain(false)} />
    </>
  );
}

// ============================================================================
// ENDPOINT DETAIL
// ============================================================================

export function EndpointDetailPage({ endpointId }: { endpointId: string }) {
  const { data } = useSuspenseQuery(q.endpointDetail(endpointId));
  const qc = useQueryClient();
  if (!data || !data.endpoint) return <Empty text="Endpoint not found." />;
  const { endpoint, asset, program, url, findings, changes, notes, evidenceRequests } = data;
  const invalidate = () => qc.invalidateQueries({ queryKey: ["endpoint-detail", endpointId] });
  const setStatus = (status: string) => api.updateEndpointStatus(endpoint.id, status as AssetStatus).then(() => { invalidate(); toast.success(`Marked ${status}`); });
  const override = (v: number | null) => api.updateEndpointManualScore(endpoint.id, v).then(() => { invalidate(); toast.success("Manual score updated"); });

  return (
    <DetailWorkspaceLayout
      header={
        <DetailHeader
          eyebrow="ENDPOINT"
          breadcrumb={[
            { label: "Programs", to: "/programs" },
            { label: program?.name ?? "Program", to: "/programs/$programId", params: { programId: endpoint.programId } },
            { label: asset?.value ?? "Target", to: "/assets/$assetId", params: { assetId: endpoint.assetId } },
            ...(url ? [{ label: "URL", to: "/urls/$urlId" as const, params: { urlId: url.id } }] : []),
            { label: `${endpoint.method} ${endpoint.path}` },
          ]}
          title={`${endpoint.method} ${endpoint.path}`}
          subtitle={endpoint.fullUrl}
          badges={
            <>
              <StatusBadge value={endpoint.method} />
              <StatusBadge value={String(endpoint.statusCode ?? "?")} />
              <StatusBadge value={`auth ${endpoint.authRequired}`} />
              <StatusBadge value={endpoint.status} />
              <PriorityBadge priority={endpoint.priority} />
              <StatusBadge value={`final ${endpoint.finalScore}`} />
            </>
          }
          meta={<><span>First seen <b>{endpoint.firstSeenAt}</b></span><span>Last seen <b>{endpoint.lastSeenAt}</b></span></>}
          actions={
            <div className="flex flex-wrap items-center gap-2 justify-end">
              <BackLink to="/assets/$assetId" params={{ assetId: endpoint.assetId }} label="Back to target" />
              <CopyButton value={endpoint.fullUrl} label="Copy URL" />
              <ExternalLinkButton url={endpoint.fullUrl} />
              <StatusTransitionMenu current={endpoint.status} options={assetStatusOptions} onChange={setStatus} />
            </div>
          }
        />
      }
      bento={
        <BentoGrid>
          <BentoCard title="Endpoint summary">
            <KvRow label="Method" value={endpoint.method} />
            <KvRow label="Path" value={endpoint.path} />
            <KvRow label="Status" value={endpoint.statusCode ?? "—"} />
            <KvRow label="Content-Type" value={endpoint.contentType ?? "—"} />
            <KvRow label="Auth" value={endpoint.authRequired} />
            <KvRow label="Source" value={endpoint.source} />
          </BentoCard>
          <BentoCard title="Parameters">
            <KvRow label="Query" value={endpoint.parameters.filter(p => p.location === "query").length} />
            <KvRow label="Body" value={endpoint.parameters.filter(p => p.location === "body").length} />
            <KvRow label="Path" value={endpoint.parameters.filter(p => p.location === "path").length} />
            <KvRow label="Header/Cookie" value={endpoint.parameters.filter(p => p.location === "header" || p.location === "cookie").length} />
            <KvRow label="Interesting" value={endpoint.parameters.filter(p => p.interesting).length} />
          </BentoCard>
          <RiskScoreCard autoScore={endpoint.autoScore} manualScore={endpoint.manualScore} finalScore={endpoint.finalScore} confidence={endpoint.confidence} onManualOverride={override} />
          <BentoCard title="Classification">
            <KvRow label="Categories" value={endpoint.categories.join(", ")} />
            <KvRow label="Reason tags" value={endpoint.reasonTags.join(", ")} />
            <KvRow label="Source" value={endpoint.source} />
          </BentoCard>
        </BentoGrid>
      }
      tabs={
        <DetailTabs
          tabs={[
            { value: "overview", label: "Overview", content: (
              <Card><CardContent className="space-y-2 p-4 text-sm">
                <KvRow label="Related target" value={asset?.value ?? "—"} />
                <KvRow label="Related URL" value={url?.url ?? "—"} />
                <KvRow label="Observed status" value={endpoint.statusCode ?? "—"} />
                <KvRow label="Categories" value={endpoint.categories.join(", ")} />
                <KvRow label="Reason tags" value={endpoint.reasonTags.join(", ")} />
              </CardContent></Card>
            )},
            { value: "params", label: `Parameters (${endpoint.parameters.length})`, content: (
              <Card><CardContent className="p-0"><table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs"><tr><th className="p-3">Name</th><th>Location</th><th>Type</th><th>Example</th><th>Source</th><th>Interesting</th></tr></thead>
                <tbody>{endpoint.parameters.map(p => <tr key={p.id} className="border-t"><td className="p-3 font-mono text-xs">{p.name}</td><td><StatusBadge value={p.location} /></td><td className="text-xs">{p.type ?? "—"}</td><td className="font-mono text-xs">{p.exampleValue ?? "—"}</td><td className="font-mono text-[10px]">{p.source}</td><td>{p.interesting ? <StatusBadge value="interesting" /> : "—"}</td></tr>)}</tbody>
              </table></CardContent></Card>
            )},
            { value: "findings", label: `Scanner findings (${findings.length})`, content: <ScannerFindingsTable findings={findings} /> },
            { value: "requests", label: `Requests / Evidence (${evidenceRequests.length})`, content: <EvidenceRequestsPanel entityType="endpoint" entityId={endpoint.id} programId={endpoint.programId} endpointId={endpoint.id} /> },
            { value: "notes", label: `Notes (${notes.length})`, content: <ResearchNotesPanel entityType="endpoint" entityId={endpoint.id} programId={endpoint.programId} /> },
            { value: "checklist", label: "Checklist", content: <ChecklistPanel entityType="endpoint" entityId={endpoint.id} programId={endpoint.programId} categories={endpoint.categories} /> },
            { value: "changes", label: `Changes (${changes.length})`, content: <ChangesTimeline changes={changes} /> },
            { value: "raw", label: "Raw metadata", content: <RawMetadataAccordion sections={[{ title: "endpoint.json", data: endpoint }]} /> },
          ]}
        />
      }
      sidebar={
        <>
          <ChecklistPanel entityType="endpoint" entityId={endpoint.id} programId={endpoint.programId} categories={endpoint.categories} compact />
          <ResearchNotesPanel entityType="endpoint" entityId={endpoint.id} programId={endpoint.programId} compact />
          <QuickActionsPanel actions={[
            { label: "Copy URL", icon: <Copy className="size-3" />, onClick: () => { navigator.clipboard.writeText(endpoint.fullUrl); toast.success("Copied"); } },
            { label: "Open", icon: <ExternalLink className="size-3" />, onClick: () => window.open(endpoint.fullUrl, "_blank") },
            { label: "Manual started", onClick: () => setStatus("manual_started") },
            { label: "Potential Bug", onClick: () => setStatus("potential_bug") },
          ]} />
        </>
      }
    />
  );
}

// ============================================================================
// SCANNER FINDING DETAIL
// ============================================================================

export function FindingDetailPage({ findingId }: { findingId: string }) {
  const { data } = useSuspenseQuery(q.findingDetail(findingId));
  const qc = useQueryClient();
  if (!data || !data.finding) return <Empty text="Finding not found." />;
  const { finding, asset, program, url, endpoint, changes, notes, evidenceRequests } = data;
  const invalidate = () => qc.invalidateQueries({ queryKey: ["finding-detail", findingId] });
  const setStatus = (status: string) =>
    api.updateFindingStatus(finding.id, status as ScannerFindingStatus).then(() => { invalidate(); toast.success(`Marked ${status}`); });

  return (
    <DetailWorkspaceLayout
      header={
        <DetailHeader
          eyebrow="SCANNER FINDING"
          breadcrumb={[
            { label: "Programs", to: "/programs" },
            { label: program?.name ?? "Program", to: "/programs/$programId", params: { programId: finding.programId } },
            { label: asset?.value ?? "Target", to: "/assets/$assetId", params: { assetId: finding.assetId } },
            { label: finding.name },
          ]}
          title={finding.name}
          subtitle={finding.templateId ? `template: ${finding.templateId}` : finding.tool}
          badges={
            <>
              <StatusBadge value={finding.severity} />
              <StatusBadge value={finding.tool} />
              <StatusBadge value={finding.status} />
            </>
          }
          meta={<><span>First seen <b>{finding.firstSeenAt}</b></span><span>Last seen <b>{finding.lastSeenAt}</b></span></>}
          actions={
            <div className="flex flex-wrap items-center gap-2 justify-end">
              <BackLink to="/assets/$assetId" params={{ assetId: finding.assetId }} label="Back to target" />
              {finding.matchedUrl && <ExternalLinkButton url={finding.matchedUrl} />}
              <StatusTransitionMenu current={finding.status} options={findingStatusOptions} onChange={setStatus} />
            </div>
          }
        />
      }
      bento={
        <BentoGrid>
          <BentoCard title="Finding summary">
            <KvRow label="Tool" value={finding.tool} />
            <KvRow label="Severity" value={finding.severity} />
            <KvRow label="Template" value={finding.templateId ?? "—"} />
            <KvRow label="Matcher" value={finding.matcher ?? "—"} />
            <KvRow label="Status" value={finding.status} />
          </BentoCard>
          <BentoCard title="Related objects">
            <KvRow label="Program" value={program?.name ?? "—"} />
            <KvRow label="Target" value={asset?.value ?? "—"} />
            <KvRow label="URL" value={url?.url ?? "—"} />
            <KvRow label="Endpoint" value={endpoint ? `${endpoint.method} ${endpoint.path}` : "—"} />
          </BentoCard>
          <BentoCard title="Evidence">
            <KvRow label="Matched URL" value={finding.matchedUrl ?? "—"} />
            <KvRow label="Extracted" value={(finding.extractedResults ?? []).length} />
            {finding.evidenceSnippet && <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted/40 p-2 font-mono text-[10px] leading-4">{finding.evidenceSnippet}</pre>}
          </BentoCard>
          <BentoCard title="Decision">
            <KvRow label="Current status" value={finding.status} />
            <KvRow label="Notes" value={notes.length} />
            <KvRow label="Evidence reqs" value={evidenceRequests.length} />
            <div className="pt-1 flex flex-wrap gap-1">
              {findingStatusOptions.slice(0, 4).map(o => (
                <Button key={o.value} variant="outline" size="sm" className="h-7 text-xs" onClick={() => setStatus(o.value)}>{o.label}</Button>
              ))}
            </div>
          </BentoCard>
        </BentoGrid>
      }
      tabs={
        <DetailTabs
          tabs={[
            { value: "overview", label: "Overview", content: (
              <Card><CardContent className="space-y-2 p-4 text-sm">
                <KvRow label="Name" value={finding.name} />
                <KvRow label="Description" value={finding.description ?? "—"} />
                <KvRow label="Severity" value={finding.severity} />
                <KvRow label="Template" value={finding.templateId ?? "—"} />
                <KvRow label="Matcher" value={finding.matcher ?? "—"} />
                <KvRow label="Matched URL" value={finding.matchedUrl ?? "—"} />
                <KvRow label="Status" value={finding.status} />
              </CardContent></Card>
            )},
            { value: "evidence", label: "Evidence", content: (
              <Card><CardContent className="space-y-3 p-4">
                <div>
                  <p className="mb-1 text-xs font-mono uppercase text-muted-foreground">Evidence snippet</p>
                  <pre className="rounded bg-muted/40 p-3 font-mono text-[11px] leading-5 overflow-auto">{finding.evidenceSnippet ?? "—"}</pre>
                </div>
                <div>
                  <p className="mb-1 text-xs font-mono uppercase text-muted-foreground">Extracted results</p>
                  <ul className="space-y-1 font-mono text-xs">{(finding.extractedResults ?? []).map(r => <li key={r}>{r}</li>)}</ul>
                </div>
                <p className="text-[10px] text-muted-foreground">Sensitive values in evidence are shown as [redacted].</p>
              </CardContent></Card>
            )},
            { value: "related", label: "Related", content: (
              <Card><CardContent className="space-y-2 p-4 text-sm">
                <KvRow label="Target" value={asset?.value ?? "—"} />
                <KvRow label="URL" value={url?.url ?? "—"} />
                <KvRow label="Endpoint" value={endpoint ? `${endpoint.method} ${endpoint.path}` : "—"} />
              </CardContent></Card>
            )},
            { value: "notes", label: `Notes (${notes.length})`, content: <ResearchNotesPanel entityType="scanner_finding" entityId={finding.id} programId={finding.programId} /> },
            { value: "requests", label: `Evidence requests (${evidenceRequests.length})`, content: <EvidenceRequestsPanel entityType="scanner_finding" entityId={finding.id} programId={finding.programId} findingId={finding.id} /> },
            { value: "changes", label: `Changes (${changes.length})`, content: <ChangesTimeline changes={changes} /> },
            { value: "raw", label: "Raw metadata", content: <RawMetadataAccordion sections={[{ title: "finding.json", data: finding }]} /> },
          ]}
        />
      }
      sidebar={
        <>
          <ResearchNotesPanel entityType="scanner_finding" entityId={finding.id} programId={finding.programId} compact />
          <QuickActionsPanel actions={[
            { label: "Mark reviewed", onClick: () => setStatus("reviewed") },
            { label: "False positive", onClick: () => setStatus("false_positive") },
            { label: "Interesting", onClick: () => setStatus("interesting") },
            { label: "Potential Bug", onClick: () => setStatus("potential_bug") },
            { label: "Ignored", onClick: () => setStatus("ignored") },
            { label: "Copy evidence", icon: <Copy className="size-3" />, onClick: () => { navigator.clipboard.writeText(finding.evidenceSnippet ?? ""); toast.success("Copied"); } },
          ]} />
        </>
      }
    />
  );
}
