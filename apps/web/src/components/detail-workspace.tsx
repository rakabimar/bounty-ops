import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Check, ChevronDown, ChevronRight, Copy, ExternalLink, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api-client";
import { priorityFromScore } from "@/lib/bounty-types";
import type { AssetStatus, ChecklistItem, EntityType, EvidenceRequest, Priority, ResearchNote, ScannerFindingStatus } from "@/lib/bounty-types";
import { StatusBadge } from "./status-badge";
import { q } from "@/lib/queries";

// ============================================================================
// Layout primitives
// ============================================================================

export function DetailWorkspaceLayout({
  header,
  bento,
  tabs,
  sidebar,
}: {
  header: ReactNode;
  bento: ReactNode;
  tabs: ReactNode;
  sidebar: ReactNode;
}) {
  return (
    <div className="space-y-5">
      {header}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4 min-w-0">
          {bento}
          {tabs}
        </div>
        <div className="space-y-4">{sidebar}</div>
      </div>
    </div>
  );
}

export function DetailHeader({
  eyebrow,
  breadcrumb,
  title,
  subtitle,
  badges,
  meta,
  actions,
}: {
  eyebrow: string;
  breadcrumb: { label: string; to?: string; params?: Record<string, string> }[];
  title: string;
  subtitle?: string;
  badges?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {breadcrumb.map((b, i) => (
          <span key={`${b.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3" />}
            {b.to ? (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              <Link to={b.to as any} params={b.params as never} className="hover:text-primary">{b.label}</Link>
            ) : (
              <span>{b.label}</span>
            )}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-semibold tracking-[.22em] text-primary">{eyebrow}</p>
          <h1 className="mt-1 truncate font-mono text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 truncate text-sm text-muted-foreground">{subtitle}</p>}
          {badges && <div className="mt-2 flex flex-wrap gap-1.5">{badges}</div>}
          {meta && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">{meta}</div>}
        </div>
        <div className="shrink-0">{actions}</div>
      </div>
    </header>
  );
}

export function BentoGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

export function BentoCard({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">{children}</CardContent>
    </Card>
  );
}

export function KvRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-mono text-foreground/90 truncate max-w-[60%]">{value}</span>
    </div>
  );
}

// ============================================================================
// Risk / Score card
// ============================================================================

export function RiskScoreCard({
  autoScore,
  manualScore,
  finalScore,
  confidence,
  onExplain,
  onManualOverride,
}: {
  autoScore: number;
  manualScore: number | null;
  finalScore: number;
  confidence?: number;
  onExplain?: () => void;
  onManualOverride?: (value: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(manualScore?.toString() ?? "");
  const priority = priorityFromScore(finalScore);
  return (
    <BentoCard title="Risk score">
      <div className="grid grid-cols-3 gap-2 text-center">
        <ScoreCell label="Auto" value={autoScore} />
        <ScoreCell label="Manual" value={manualScore ?? "—"} />
        <ScoreCell label="Final" value={finalScore} highlight />
      </div>
      <div className="flex items-center justify-between gap-2 pt-1">
        <PriorityBadge priority={priority} />
        {confidence !== undefined && <span className="text-[10px] font-mono text-muted-foreground">Conf {confidence}%</span>}
      </div>
      {manualScore !== null && <StatusBadge value="manual override active" />}
      <div className="flex gap-2 pt-1">
        {onExplain && <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={onExplain}>Why this score?</Button>}
        {onManualOverride && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen(o => !o)}>Override</Button>
        )}
      </div>
      {open && onManualOverride && (
        <div className="flex gap-1 pt-1">
          <Input className="h-7 text-xs" type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="empty = auto" />
          <Button size="sm" className="h-7 text-xs" onClick={() => { onManualOverride(value === "" ? null : Number(value)); setOpen(false); }}>Apply</Button>
        </div>
      )}
    </BentoCard>
  );
}

function ScoreCell({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className={`font-mono text-lg font-semibold tabular-nums ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const tone =
    priority === "P1" ? "text-destructive bg-destructive/10" :
    priority === "P2" ? "text-warning bg-warning/10" :
    priority === "Monitor" ? "text-info bg-info/10" :
    "text-muted-foreground bg-muted";
  return <span className={`inline-flex rounded border border-current/20 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${tone}`}>{priority}</span>;
}

// ============================================================================
// Status transition menu
// ============================================================================

export function StatusTransitionMenu({
  current,
  options,
  onChange,
  label = "Status",
}: {
  current: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2">
          <span className="text-xs text-muted-foreground">{label}:</span>
          <StatusBadge value={current} />
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map(o => (
          <DropdownMenuItem key={o.value} onClick={() => onChange(o.value)}>{o.label}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================================
// Sidebar widgets
// ============================================================================

export function ChecklistPanel({
  entityType,
  entityId,
  programId,
  categories,
  compact,
}: {
  entityType: "asset" | "url" | "endpoint";
  entityId: string;
  programId: string;
  categories: string[];
  compact?: boolean;
}) {
  const { data: items } = useSuspenseQuery(q.entityChecklist(entityType, entityId));
  const qc = useQueryClient();
  const [custom, setCustom] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["entity-checklist", entityType, entityId] });

  // Auto-generate on first view if empty
  const generate = useMutation({
    mutationFn: () => api.generateEntityChecklist(entityType, entityId, programId, categories),
    onSuccess: invalidate,
  });
  if (items.length === 0 && categories.length > 0 && !generate.isPending) {
    // fire and forget once
    setTimeout(() => generate.mutate(), 0);
  }

  const list = compact ? items.slice(0, 4) : items;
  const doneCount = items.filter(i => i.status === "done").length;
  const percent = items.length ? Math.round((doneCount / items.length) * 100) : 0;

  const toggle = (item: ChecklistItem) => {
    const next: ChecklistItem["status"] = item.status === "done" ? "todo" : "done";
    api.updateChecklistItem(item.id, { status: next }).then(invalidate);
  };
  const setStatus = (item: ChecklistItem, status: ChecklistItem["status"]) => {
    api.updateChecklistItem(item.id, { status }).then(invalidate);
  };
  const remove = (id: string) => api.deleteChecklistItem(id).then(invalidate);
  const add = () => {
    if (!custom.trim()) return;
    api.addCustomChecklistItem(entityType, entityId, programId, custom.trim()).then(() => { setCustom(""); invalidate(); });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span>Checklist</span>
          <span className="font-mono text-xs text-muted-foreground">{doneCount}/{items.length}</span>
        </CardTitle>
        <Progress value={percent} className="h-1.5" />
      </CardHeader>
      <CardContent className="space-y-1.5">
        {list.map(item => (
          <div key={item.id} className="group flex items-start gap-2 rounded-md border p-2 text-xs">
            <button
              onClick={() => toggle(item)}
              className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border ${item.status === "done" ? "bg-primary text-primary-foreground" : ""}`}
              aria-label="toggle"
            >
              {item.status === "done" && <Check className="size-3" />}
            </button>
            <div className="min-w-0 flex-1">
              <p className={item.status === "done" ? "line-through text-muted-foreground" : ""}>{item.title}</p>
              {item.description && !compact && <p className="mt-0.5 text-[10px] text-muted-foreground">{item.description}</p>}
              {!compact && (
                <div className="mt-1 flex gap-1">
                  {(["todo", "doing", "done", "skipped"] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setStatus(item, s)}
                      className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase ${item.status === s ? "border-primary text-primary" : "text-muted-foreground"}`}
                    >{s}</button>
                  ))}
                </div>
              )}
            </div>
            {!compact && item.isCustom && (
              <button onClick={() => remove(item.id)} className="opacity-0 group-hover:opacity-100"><Trash2 className="size-3 text-muted-foreground" /></button>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="text-xs text-muted-foreground">Generating checklist…</p>}
        {!compact && (
          <div className="flex gap-1 pt-2">
            <Input className="h-7 text-xs" value={custom} onChange={e => setCustom(e.target.value)} placeholder="Add custom item…" />
            <Button size="sm" className="h-7 px-2" onClick={add}><Plus className="size-3" /></Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ResearchNotesPanel({
  entityType,
  entityId,
  programId,
  compact,
}: {
  entityType: EntityType;
  entityId: string;
  programId: string;
  compact?: boolean;
}) {
  const { data: notes } = useSuspenseQuery(q.entityNotes(entityType, entityId));
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["entity-notes", entityType, entityId] });
  const add = () => {
    if (!title.trim() && !body.trim()) return;
    api.addEntityNote({ programId, entityType, entityId, title: title || "Note", body, tags: [] }).then(() => {
      setTitle(""); setBody(""); invalidate(); toast.success("Note added");
    });
  };
  const remove = (id: string) => api.deleteEntityNote(id).then(invalidate);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Input className="h-7 text-xs" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" />
        <Textarea className="min-h-16 text-xs" value={body} onChange={e => setBody(e.target.value)} placeholder="Markdown supported…" />
        <Button size="sm" className="h-7 w-full" onClick={add}><Plus className="size-3" /> Add note</Button>
        <div className="space-y-2 pt-1">
          {(compact ? notes.slice(0, 3) : notes).map(n => (
            <NotePreview key={n.id} note={n} onDelete={remove} />
          ))}
          {notes.length === 0 && <p className="text-xs text-muted-foreground">No notes yet.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function NotePreview({ note, onDelete }: { note: ResearchNote; onDelete: (id: string) => void }) {
  return (
    <div className="group rounded-md border p-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <b className="truncate">{note.title}</b>
        <button onClick={() => onDelete(note.id)} className="opacity-0 group-hover:opacity-100"><Trash2 className="size-3 text-muted-foreground" /></button>
      </div>
      <p className="mt-1 text-muted-foreground whitespace-pre-wrap">{note.body}</p>
      <div className="mt-1 flex items-center justify-between">
        <div className="flex gap-1">{note.tags.map(t => <StatusBadge key={t} value={t} />)}</div>
        <span className="font-mono text-[10px] text-muted-foreground">{note.updatedAt}</span>
      </div>
    </div>
  );
}

export function QuickActionsPanel({ actions }: { actions: { label: string; icon?: ReactNode; onClick: () => void }[] }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Quick actions</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 gap-1.5">
        {actions.map(a => (
          <Button key={a.label} variant="outline" size="sm" className="h-8 justify-start text-xs" onClick={a.onClick}>
            {a.icon}{a.label}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Content widgets
// ============================================================================

export function ChangesTimeline({ changes }: { changes: { id: string; type: string; summary: string; oldValue?: string; newValue?: string; source: string; importance: string; createdAt: string }[] }) {
  if (changes.length === 0) return <Empty text="No recorded changes." />;
  return (
    <div className="space-y-2">
      {changes.map(c => (
        <div key={c.id} className="grid grid-cols-[auto_1fr_auto] gap-3 rounded-md border p-3 text-sm">
          <div className="flex flex-col items-center pt-1">
            <span className={`size-2 rounded-full ${c.importance === "high" ? "bg-destructive" : c.importance === "medium" ? "bg-warning" : "bg-muted-foreground"}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusBadge value={c.type} />
              <span className="font-medium">{c.summary}</span>
            </div>
            {(c.oldValue || c.newValue) && (
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {c.oldValue && <><s>{c.oldValue}</s> → </>}
                {c.newValue}
              </p>
            )}
            <p className="mt-1 text-[10px] font-mono text-muted-foreground">source: {c.source}</p>
          </div>
          <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">{c.createdAt}</span>
        </div>
      ))}
    </div>
  );
}

export function RawMetadataAccordion({ sections }: { sections: { title: string; data: unknown }[] }) {
  return (
    <div className="space-y-2">
      {sections.map(s => <RawSection key={s.title} title={s.title} data={s.data} />)}
    </div>
  );
}

function RawSection({ title, data }: { title: string; data: unknown }) {
  const [open, setOpen] = useState(false);
  const json = JSON.stringify(data, null, 2);
  return (
    <div className="rounded-md border">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between p-3 text-sm">
        <span className="font-mono">{title}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(json); toast.success("JSON copied"); }}
            className="rounded border px-2 py-0.5 text-[10px] font-mono uppercase hover:bg-accent"
          ><Copy className="inline size-3" /> Copy</button>
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </div>
      </button>
      {open && (
        <pre className="max-h-96 overflow-auto border-t bg-muted/40 p-3 font-mono text-[11px] leading-5">{json}</pre>
      )}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{text}</p>;
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  return (
    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => { navigator.clipboard.writeText(value); toast.success("Copied"); }}>
      <Copy className="size-3" />{label}
    </Button>
  );
}

export function ExternalLinkButton({ url }: { url: string }) {
  return (
    <Button asChild variant="ghost" size="sm" className="h-7 gap-1 text-xs">
      <a href={url} target="_blank" rel="noreferrer"><ExternalLink className="size-3" />Open</a>
    </Button>
  );
}

export function BackLink({ to, params, label }: { to: string; params?: Record<string, string>; label: string }) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Link to={to as any} params={params as never} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
      <ArrowLeft className="size-3" />{label}
    </Link>
  );
}

// ============================================================================
// Tables shared by detail pages
// ============================================================================

export function ScannerFindingsTable({ findings }: { findings: { id: string; severity: string; tool: string; templateId?: string; name: string; matchedUrl?: string; status: ScannerFindingStatus; firstSeenAt: string; lastSeenAt: string }[] }) {
  if (findings.length === 0) return <Empty text="No scanner findings." />;
  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs">
            <tr>
              <th className="p-3">Severity</th><th>Tool</th><th>Template</th><th>Name</th><th>Matched URL</th><th>Status</th><th>Last seen</th><th></th>
            </tr>
          </thead>
          <tbody>
            {findings.map(f => (
              <tr key={f.id} className="border-t">
                <td className="p-3"><StatusBadge value={f.severity} /></td>
                <td className="font-mono text-xs">{f.tool}</td>
                <td className="font-mono text-xs">{f.templateId ?? "—"}</td>
                <td>{f.name}</td>
                <td className="font-mono text-xs truncate max-w-[20ch]">{f.matchedUrl ?? "—"}</td>
                <td><StatusBadge value={f.status} /></td>
                <td className="font-mono text-[10px] text-muted-foreground">{f.lastSeenAt}</td>
                <td className="p-2">
                  <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                    <Link to="/scanner-findings/$findingId" params={{ findingId: f.id }}>Detail</Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export function DiscoveredEndpointsTable({ endpoints }: { endpoints: { id: string; method: string; path: string; fullUrl: string; statusCode?: number; authRequired: string; source: string; categories: string[]; parameters: unknown[]; finalScore: number; priority: Priority; lastSeenAt: string }[] }) {
  if (endpoints.length === 0) return <Empty text="No endpoints discovered yet." />;
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs">
            <tr>
              <th className="p-3">Method</th><th>Path</th><th>Status</th><th>Auth</th><th>Source</th><th>Categories</th><th>Params</th><th>Score</th><th>Priority</th><th></th>
            </tr>
          </thead>
          <tbody>
            {endpoints.map(e => (
              <tr key={e.id} className="border-t">
                <td className="p-3"><StatusBadge value={e.method} /></td>
                <td className="font-mono text-xs">{e.path}</td>
                <td className="font-mono text-xs">{e.statusCode ?? "—"}</td>
                <td><StatusBadge value={e.authRequired} /></td>
                <td className="font-mono text-[10px] text-muted-foreground">{e.source}</td>
                <td className="text-xs">{e.categories.join(", ")}</td>
                <td className="font-mono text-xs">{e.parameters.length}</td>
                <td className="font-mono text-xs"><b className="text-primary">{e.finalScore}</b></td>
                <td><PriorityBadge priority={e.priority} /></td>
                <td className="p-2 flex gap-1">
                  <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                    <Link to="/endpoints/$endpointId" params={{ endpointId: e.id }}>Detail</Link>
                  </Button>
                  <CopyButton value={e.fullUrl} label="" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export function RelatedUrlsTable({ urls }: { urls: { id: string; url: string; statusCode: number; title: string; categories: string[]; finalScore: number; source: string; firstSeen: string; lastSeen: string }[] }) {
  if (urls.length === 0) return <Empty text="No URLs discovered yet." />;
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs">
            <tr>
              <th className="p-3">URL</th><th>Status</th><th>Title</th><th>Categories</th><th>Score</th><th>Source</th><th>Last seen</th><th></th>
            </tr>
          </thead>
          <tbody>
            {urls.map(u => (
              <tr key={u.id} className="border-t">
                <td className="p-3 font-mono text-xs truncate max-w-[40ch]">{u.url}</td>
                <td><StatusBadge value={String(u.statusCode)} /></td>
                <td className="text-xs">{u.title}</td>
                <td className="text-xs">{u.categories.join(", ")}</td>
                <td className="font-mono text-xs"><b className="text-primary">{u.finalScore}</b></td>
                <td className="font-mono text-[10px] text-muted-foreground">{u.source}</td>
                <td className="font-mono text-[10px] text-muted-foreground">{u.lastSeen}</td>
                <td className="p-2 flex gap-1">
                  <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                    <Link to="/urls/$urlId" params={{ urlId: u.id }}>Detail</Link>
                  </Button>
                  <ExternalLinkButton url={u.url} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Evidence requests table
// ============================================================================

export function EvidenceRequestsPanel({
  entityType,
  entityId,
  programId,
  assetId,
  urlId,
  endpointId,
  findingId,
}: {
  entityType: EntityType;
  entityId: string;
  programId: string;
  assetId?: string;
  urlId?: string;
  endpointId?: string;
  findingId?: string;
}) {
  const { data: requests } = useSuspenseQuery(q.entityRequests(entityType, entityId));
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<EvidenceRequest>>({ method: "GET", url: "", title: "" });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["entity-requests", entityType, entityId] });
  const save = () => {
    if (!form.title || !form.url) { toast.error("Title and URL required"); return; }
    api.addEntityRequest({
      programId, entityType, entityId,
      assetId, urlId, endpointId, findingId,
      title: form.title!, method: form.method ?? "GET", url: form.url!,
      statusCode: form.statusCode, requestHeaders: form.requestHeaders, requestBody: form.requestBody,
      responseHeaders: form.responseHeaders, responseBody: form.responseBody,
      note: form.note, tags: form.tags ?? [],
    } as Omit<EvidenceRequest, "id" | "createdAt">).then(() => { invalidate(); setOpen(false); setForm({ method: "GET", url: "", title: "" }); toast.success("Request saved"); });
  };
  const remove = (id: string) => api.deleteEntityRequest(id).then(invalidate);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(o => !o)}><Plus className="size-3" />Add interesting request</Button>
      </div>
      {open && (
        <Card>
          <CardContent className="grid gap-2 p-4 sm:grid-cols-2">
            <Input placeholder="Title" value={form.title ?? ""} onChange={e => setForm({ ...form, title: e.target.value })} />
            <Select value={form.method ?? "GET"} onValueChange={v => setForm({ ...form, method: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Input className="sm:col-span-2 font-mono" placeholder="Full URL or path" value={form.url ?? ""} onChange={e => setForm({ ...form, url: e.target.value })} />
            <Input type="number" placeholder="Status code" value={form.statusCode ?? ""} onChange={e => setForm({ ...form, statusCode: Number(e.target.value) })} />
            <Input placeholder="Tags (comma separated)" onChange={e => setForm({ ...form, tags: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} />
            <Textarea className="sm:col-span-2 font-mono text-xs" placeholder="Request headers" value={form.requestHeaders ?? ""} onChange={e => setForm({ ...form, requestHeaders: e.target.value })} />
            <Textarea className="font-mono text-xs" placeholder="Request body" value={form.requestBody ?? ""} onChange={e => setForm({ ...form, requestBody: e.target.value })} />
            <Textarea className="font-mono text-xs" placeholder="Response body" value={form.responseBody ?? ""} onChange={e => setForm({ ...form, responseBody: e.target.value })} />
            <Textarea className="sm:col-span-2" placeholder="Note" value={form.note ?? ""} onChange={e => setForm({ ...form, note: e.target.value })} />
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save}>Save</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {requests.length === 0 ? <Empty text="No interesting requests saved." /> : requests.map(r => (
        <Card key={r.id}>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <StatusBadge value={r.method} />
                <span className="font-mono text-xs truncate">{r.url}</span>
                {r.statusCode && <StatusBadge value={String(r.statusCode)} />}
              </div>
              <div className="flex items-center gap-1">
                <span className="font-mono text-[10px] text-muted-foreground">{r.createdAt}</span>
                <button onClick={() => remove(r.id)}><Trash2 className="size-3 text-muted-foreground" /></button>
              </div>
            </div>
            <p className="font-medium text-sm">{r.title}</p>
            {r.note && <p className="text-xs text-muted-foreground">{r.note}</p>}
            {r.requestHeaders && <pre className="rounded bg-muted/40 p-2 font-mono text-[11px] leading-5 overflow-auto">{r.requestHeaders}</pre>}
            {r.requestBody && <pre className="rounded bg-muted/40 p-2 font-mono text-[11px] leading-5 overflow-auto">{r.requestBody}</pre>}
            {r.responseBody && <pre className="rounded bg-muted/40 p-2 font-mono text-[11px] leading-5 overflow-auto">{r.responseBody}</pre>}
            <div className="flex gap-1">{r.tags.map(t => <StatusBadge key={t} value={t} />)}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// Status options
// ============================================================================

export const assetStatusOptions: { value: AssetStatus; label: string }[] = [
  { value: "new", label: "New" }, { value: "live", label: "Live" }, { value: "triaged", label: "Triaged" },
  { value: "promising", label: "Promising" }, { value: "manual_started", label: "Manual started" },
  { value: "manual_done", label: "Manual done" }, { value: "potential_bug", label: "Potential Bug" },
  { value: "reported", label: "Reported" }, { value: "duplicate", label: "Duplicate" },
  { value: "monitor", label: "Monitor" }, { value: "ignored", label: "Ignored / Not interesting" },
  { value: "out_of_scope", label: "Out of scope" },
];

export const findingStatusOptions: { value: ScannerFindingStatus; label: string }[] = [
  { value: "new", label: "New" }, { value: "reviewed", label: "Reviewed" },
  { value: "interesting", label: "Interesting" }, { value: "false_positive", label: "False positive" },
  { value: "potential_bug", label: "Potential Bug" }, { value: "ignored", label: "Ignored" },
];

// Tabs container helper
export function DetailTabs({ tabs }: { tabs: { value: string; label: string; content: ReactNode }[] }) {
  const def = tabs[0]?.value;
  return (
    <Tabs defaultValue={def}>
      <TabsList className="flex flex-wrap h-auto">
        {tabs.map(t => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
      </TabsList>
      {tabs.map(t => (
        <TabsContent key={t.value} value={t.value} className="mt-4">{t.content}</TabsContent>
      ))}
    </Tabs>
  );
}

// Score explanation drawer
export function ScoreExplanationDrawer({
  events,
  open,
  onClose,
}: {
  events: { ruleName: string; scoreDelta: number; reason: string; timestamp: string }[];
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <Card className="max-h-[80vh] w-full max-w-md overflow-auto" onClick={e => e.stopPropagation()}>
        <CardHeader><CardTitle className="text-sm">Why this score?</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {events.map(e => (
            <div key={`${e.ruleName}-${e.timestamp}`} className="rounded-md border p-3 text-sm">
              <div className="flex justify-between"><b>{e.ruleName}</b><span className="text-primary">+{e.scoreDelta}</span></div>
              <p className="text-xs text-muted-foreground">{e.reason} · {e.timestamp}</p>
            </div>
          ))}
          <Button className="w-full" variant="outline" onClick={onClose}>Close</Button>
        </CardContent>
      </Card>
    </div>
  );
}

// re-exports for routes
export { useMemo };
