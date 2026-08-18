import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Archive, Bell, Plus, Save, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AUTOMATION_ALLOWED_VALUES,
  PLATFORMS,
  PROGRAM_STATUSES,
  SCOPE_ASSET_TYPES,
  SUPPORTED_NOTIFICATION_EVENT_TYPES,
} from "@bountyops/shared";
import { coreApi } from "@/lib/api-client";
import { coreQ } from "@/lib/queries";
import type {
  CreateHeaderInput,
  CreateProgramInput,
  CreateScopeInput,
  ProgramDto,
  ProgramHeaderDto,
  ProgramRulesDto,
  ProgramScopeDto,
  UpdateRulesInput,
} from "@/lib/api-types";
import { useSelectedProgram } from "./program-context";
import { ReconHistoryPanel, SchedulesPanel } from "./core-recon-over-time";
import { ProgramIntakeDialog, ProgramPolicySyncPanel } from "./core-program-intake";
import { DataTable } from "./data-table";
import { Empty, PageHeader, SearchBox } from "./page-kit";
import { StatusBadge } from "./status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

function QueryState({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <p className="text-sm text-destructive">{message}</p>
        <Button variant="outline" onClick={retry}>
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The request could not be completed.";
const date = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString() : "Never";

const blankProgram: CreateProgramInput = {
  platform: "custom",
  name: "",
  handle: "",
  programUrl: "",
  status: "active",
  huntingStatus: "ongoing",
  rawPolicyText: "",
};

export function ProgramsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateProgramInput>(blankProgram);
  const programs = useQuery(
    coreQ.programs({
      search: search || undefined,
      status: status === "all" ? undefined : (status as ProgramDto["status"]),
    }),
  );
  const create = useMutation({
    mutationFn: coreApi.createProgram,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["core", "programs"] });
      setOpen(false);
      setForm(blankProgram);
      toast.success("Program created");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const changeStatus = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: ProgramDto["status"];
    }) => coreApi.updateProgram(id, { status }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["core", "programs"] }),
    onError: (error) => toast.error(errorMessage(error)),
  });
  const submit = () => {
    if (!form.name.trim()) {
      toast.error("Program name is required");
      return;
    }
    create.mutate({
      ...form,
      name: form.name.trim(),
      handle: form.handle?.trim() || undefined,
      programUrl: form.programUrl?.trim() || undefined,
    });
  };
  const programRows = programs.data ?? [];
  /* The original compact generated return is retained below for reference while the formatted equivalent is used.
  return <div className="space-y-5"><PageHeader title="Programs" description="Manage platform programs, hunting state, scope, and policy metadata." actions={<Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus/>Add program</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Add program</DialogTitle><DialogDescription>Create the program record now; scope and rules can be refined from its detail page.</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><Field label="Name"><Input required value={form.name} onChange={event=>setForm({...form,name:event.target.value})}/></Field><Field label="Platform"><Select value={form.platform} onValueChange={value=>setForm({...form,platform:value as CreateProgramInput["platform"]})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{PLATFORMS.map(value=><SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Field><Field label="Handle"><Input value={form.handle} onChange={event=>setForm({...form,handle:event.target.value})}/></Field><Field label="Program URL"><Input type="url" value={form.programUrl} onChange={event=>setForm({...form,programUrl:event.target.value})} placeholder="https://…"/></Field><div className="sm:col-span-2"><Field label="Raw policy text"><Textarea value={form.rawPolicyText} onChange={event=>setForm({...form,rawPolicyText:event.target.value})}/></Field></div></div><DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button disabled={create.isPending} onClick={submit}>{create.isPending?"Creating…":"Create program"}</Button></DialogFooter></DialogContent></Dialog>}</PageHeader><div className="flex flex-wrap gap-3"><SearchBox value={search} onChange={setSearch} placeholder="Search programs…"/><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-40"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{PROGRAM_STATUSES.map(value=><SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>{programs.isLoading?<Empty text="Loading programs…"/>:programs.isError?<QueryState message={errorMessage(programs.error)} retry={()=>programs.refetch()}/>:programs.data.length===0?<Empty text="No programs found. Add one to begin."/>:<DataTable rows={programs.data} columns={[{key:"name",label:"Program",render:program=><div><Link to="/programs/$programId" params={{programId:program.id}} className="font-medium hover:text-primary">{program.name}</Link><p className="text-xs text-muted-foreground">{program.handle||program.programUrl||"No handle"}</p></div>},{key:"platform",label:"Platform",render:program=><StatusBadge value={program.platform}/>},{key:"status",label:"Status",render:program=><StatusBadge value={program.status}/>},{key:"hunting",label:"Hunting",render:program=><StatusBadge value={program.huntingStatus}/>},{key:"scope",label:"Scopes",render:program=>program.scopesCount??0},{key:"headers",label:"Headers",render:program=>program.headersCount??0},{key:"rules",label:"Rules",render:program=><StatusBadge value={program.hasRules?"configured":"missing"}/>},{key:"updated",label:"Updated",render:program=><span className="text-xs">{date(program.updatedAt)}</span>},{key:"action",label:"",render:program=><Button size="sm" variant="ghost" disabled={changeStatus.isPending} onClick={event=>{event.stopPropagation();changeStatus.mutate({id:program.id,status:program.status==="active"?"paused":"active"})}}>{program.status==="active"?"Pause":"Activate"}</Button>}]} />}</div>;
  */
  return (
    <div className="space-y-5">
      <PageHeader
        title="Programs"
        description="Manage platform programs, hunting state, scope, and policy metadata."
        actions={
          <div className="flex gap-2"><ProgramIntakeDialog /><Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus />
                Add program
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add program</DialogTitle>
                <DialogDescription>
                  Create the program record now; scope and rules can be refined
                  from its detail page.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name">
                  <Input
                    required
                    value={form.name}
                    onChange={(event) =>
                      setForm({ ...form, name: event.target.value })
                    }
                  />
                </Field>
                <Field label="Platform">
                  <Select
                    value={form.platform}
                    onValueChange={(value) =>
                      setForm({
                        ...form,
                        platform: value as CreateProgramInput["platform"],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Handle">
                  <Input
                    value={form.handle}
                    onChange={(event) =>
                      setForm({ ...form, handle: event.target.value })
                    }
                  />
                </Field>
                <Field label="Program URL">
                  <Input
                    type="url"
                    value={form.programUrl}
                    onChange={(event) =>
                      setForm({ ...form, programUrl: event.target.value })
                    }
                    placeholder="https://example.com"
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Raw policy text">
                    <Textarea
                      value={form.rawPolicyText}
                      onChange={(event) =>
                        setForm({ ...form, rawPolicyText: event.target.value })
                      }
                    />
                  </Field>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button disabled={create.isPending} onClick={submit}>
                  {create.isPending ? "Creating…" : "Create program"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog></div>
        }
      />
      <div className="flex flex-wrap gap-3">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search programs…"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {PROGRAM_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {programs.isLoading ? (
        <Empty text="Loading programs…" />
      ) : programs.isError ? (
        <QueryState
          message={errorMessage(programs.error)}
          retry={() => programs.refetch()}
        />
      ) : programRows.length === 0 ? (
        <Empty text="No programs found. Add one to begin." />
      ) : (
        <DataTable
          rows={programRows}
          columns={[
            {
              key: "name",
              label: "Program",
              render: (program) => (
                <div>
                  <Link
                    to="/programs/$programId"
                    params={{ programId: program.id }}
                    className="font-medium hover:text-primary"
                  >
                    {program.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {program.handle || program.programUrl || "No handle"}
                  </p>
                </div>
              ),
            },
            {
              key: "platform",
              label: "Platform",
              render: (program) => <StatusBadge value={program.platform} />,
            },
            {
              key: "status",
              label: "Status",
              render: (program) => <StatusBadge value={program.status} />,
            },
            {
              key: "hunting",
              label: "Hunting",
              render: (program) => (
                <StatusBadge value={program.huntingStatus} />
              ),
            },
            {
              key: "scope",
              label: "Scopes",
              render: (program) => program.scopesCount ?? 0,
            },
            {
              key: "headers",
              label: "Headers",
              render: (program) => program.headersCount ?? 0,
            },
            {
              key: "rules",
              label: "Rules",
              render: (program) => (
                <StatusBadge
                  value={program.hasRules ? "configured" : "missing"}
                />
              ),
            },
            {
              key: "updated",
              label: "Updated",
              render: (program) => (
                <span className="text-xs">{date(program.updatedAt)}</span>
              ),
            },
            {
              key: "action",
              label: "",
              render: (program) => (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={changeStatus.isPending}
                  onClick={(event) => {
                    event.stopPropagation();
                    changeStatus.mutate({
                      id: program.id,
                      status: program.status === "active" ? "paused" : "active",
                    });
                  }}
                >
                  {program.status === "active" ? "Pause" : "Activate"}
                </Button>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

export function ProgramDetailPage({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const detail = useQuery(coreQ.program(id));
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (detail.data) {
      setName(detail.data.name);
      setUrl(detail.data.programUrl ?? "");
    }
  }, [detail.data]);
  const update = useMutation({
    mutationFn: () =>
      coreApi.updateProgram(id, {
        name: name.trim(),
        programUrl: url.trim() || undefined,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["core", "program", id] }),
        queryClient.invalidateQueries({ queryKey: ["core", "programs"] }),
      ]);
      setEditing(false);
      toast.success("Program updated");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const archive = useMutation({
    mutationFn: () => coreApi.archiveProgram(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["core", "program", id] }),
        queryClient.invalidateQueries({ queryKey: ["core", "programs"] }),
      ]);
      toast.success("Program archived");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  if (detail.isLoading) return <Empty text="Loading program…" />;
  if (detail.isError)
    return (
      <QueryState
        message={errorMessage(detail.error)}
        retry={() => detail.refetch()}
      />
    );
  const program = detail.data!;
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={program.platform.toUpperCase()}
        title={program.name}
        description={`${program.scopes.length} scoped assets · Updated ${date(program.updatedAt)}`}
        actions={
          <div className="flex gap-2">
            <StatusBadge value={program.status} />
            <Button
              variant="outline"
              onClick={() => setEditing((value) => !value)}
            >
              Edit
            </Button>
            <Button
              variant="destructive"
              disabled={archive.isPending || program.status === "archived"}
              onClick={() => {
                if (confirm("Archive this program?")) archive.mutate();
              }}
            >
              <Archive />
              Archive
            </Button>
          </div>
        }
      />
      {editing && (
        <Card>
          <CardContent className="grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto]">
            <Field label="Name">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label="Program URL">
              <Input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </Field>
            <Button
              className="self-end"
              disabled={!name.trim() || update.isPending}
              onClick={() => update.mutate()}
            >
              <Save />
              Save
            </Button>
          </CardContent>
        </Card>
      )}
      <Tabs defaultValue="overview">
        <TabsList className="h-auto max-w-full justify-start overflow-x-auto">
          {[
            "Overview",
            "Scope",
            "Rules",
            "Headers",
            "Schedules",
            "History",
            "Notifications",
            "Policy Sync",
            "Assets",
            "Jobs",
            "URLs",
          ].map((label) => (
            <TabsTrigger key={label} value={label.toLowerCase()}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Program metadata</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Row label="Platform" value={program.platform} />
                <Row label="Handle" value={program.handle || "—"} />
                <Row label="Hunting" value={program.huntingStatus} />
                <Row label="URL" value={program.programUrl || "—"} />
                <Row
                  label="Last synchronized"
                  value={date(program.lastSyncedAt)}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Core readiness</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Row label="Scopes" value={String(program.scopes.length)} />
                <Row
                  label="Required headers"
                  value={String(program.headers.length)}
                />
                <Row
                  label="Rules"
                  value={program.rules ? "Configured" : "Missing"}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="scope">
          <ScopeManager programId={id} embedded />
        </TabsContent>
        <TabsContent value="rules">
          <RulesManager programId={id} embedded />
        </TabsContent>
        <TabsContent value="headers">
          <HeadersManager programId={id} />
        </TabsContent>
        <TabsContent value="schedules">
          <SchedulesPanel programId={id} />
        </TabsContent>
        <TabsContent value="history">
          <ReconHistoryPanel programId={id} />
        </TabsContent>
        <TabsContent value="notifications">
          <ProgramNotificationPreferences programId={id} />
        </TabsContent>
        <TabsContent value="policy sync">
          <ProgramPolicySyncPanel programId={id} programUrl={program.programUrl} />
        </TabsContent>
        {["assets", "jobs", "urls"].map((tab) => (
          <TabsContent key={tab} value={tab}>
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Open the dedicated {tab} page for live data.
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

const notificationGroups = {
  Discoveries: [
    "new_subdomain", "new_live_host", "high_score_asset", "api_docs_discovered",
    "graphql_discovered", "staging_dev_discovered",
  ],
  Scanner: [
    "scanner_finding_high", "scanner_finding_critical", "scanner_finding_resolved",
    "scanner_finding_reappeared",
  ],
  Workflow: ["priority_promoted", "job_failed", "schedule_blocked", "scope_changed"],
} as const;

function ProgramNotificationPreferences({ programId }: { programId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery(coreQ.notificationPreferences(programId));
  const [enabled, setEnabled] = useState(false);
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [minImportance, setMinImportance] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  useEffect(() => {
    if (!query.data) return;
    setEnabled(query.data.enabled);
    setTelegramEnabled(query.data.telegramEnabled);
    setMinImportance(query.data.minImportance);
    setEventTypes(query.data.eventTypes);
  }, [query.data]);
  const save = useMutation({
    mutationFn: () => coreApi.updateProgramNotificationPreferences(programId, { enabled, telegramEnabled, minImportance, eventTypes }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["core", "notification-preferences", programId] });
      toast.success("Notification preferences saved");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const toggleEvent = (eventType: string, checked: boolean) => setEventTypes((current) => checked ? [...new Set([...current, eventType])] : current.filter((item) => item !== eventType));
  if (query.isLoading) return <Empty text="Loading notification preferences…" />;
  if (query.isError) return <QueryState message={errorMessage(query.error)} retry={() => query.refetch()} />;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bell className="size-4" />Telegram notifications</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <ToggleRow label="Enable notifications for this program" value={enabled} set={setEnabled} />
          <ToggleRow label="Telegram channel" value={telegramEnabled} set={setTelegramEnabled} />
        </div>
        <Field label="Minimum importance">
          <Select value={minImportance} onValueChange={(value) => setMinImportance(value as typeof minImportance)}>
            <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{["low", "medium", "high", "critical"].map((value) => <SelectItem key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <div className="grid gap-5 md:grid-cols-3">
          {Object.entries(notificationGroups).map(([group, values]) => (
            <div key={group} className="space-y-2 rounded-lg border p-4">
              <p className="font-medium">{group}</p>
              {values.filter((value) => SUPPORTED_NOTIFICATION_EVENT_TYPES.includes(value)).map((value) => (
                <label key={value} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={eventTypes.includes(value)} onChange={(event) => toggleEvent(value, event.target.checked)} />
                  <span>{value.replaceAll("_", " ")}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Notifications are generated from BountyOps change events. Scanner findings are not confirmed vulnerabilities.</p>
        <Button disabled={save.isPending} onClick={() => save.mutate()}><Save />{save.isPending ? "Saving…" : "Save preferences"}</Button>
      </CardContent>
    </Card>
  );
}

function ToggleRow({ label, value, set }: { label: string; value: boolean; set: (value: boolean) => void }) {
  return <div className="flex items-center justify-between rounded-lg border p-4"><Label>{label}</Label><Switch checked={value} onCheckedChange={set} /></div>;
}

export function ScopePage() {
  const { selectedProgramId } = useSelectedProgram();
  return (
    <div className="space-y-5">
      <PageHeader
        title="Scope manager"
        description="Manage normalized in-scope and out-of-scope targets for the selected program."
      />
      {selectedProgramId ? (
        <ScopeManager programId={selectedProgramId} />
      ) : (
        <Empty text="Select a program from the top navigation to manage its scope." />
      )}
    </div>
  );
}

function ScopeManager({
  programId,
  embedded = false,
}: {
  programId: string;
  embedded?: boolean;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({ ...coreQ.scopes(programId), initialData: [] });
  const [form, setForm] = useState<CreateScopeInput>({
    asset: "",
    assetType: "domain",
    isInScope: true,
    bountyEligible: true,
    notes: "",
  });
  const [editing, setEditing] = useState<string | null>(null);
  const scopeRows = query.data ?? [];
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["core", "scopes", programId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["core", "program", programId],
      }),
      queryClient.invalidateQueries({ queryKey: ["core", "programs"] }),
    ]);
  const save = useMutation({
    mutationFn: () =>
      editing
        ? coreApi.updateProgramScope(programId, editing, form)
        : coreApi.createProgramScope(programId, form),
    onSuccess: async () => {
      await invalidate();
      setEditing(null);
      setForm({
        asset: "",
        assetType: "domain",
        isInScope: true,
        bountyEligible: true,
        notes: "",
      });
      toast.success(editing ? "Scope updated" : "Scope created");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => coreApi.deleteProgramScope(programId, id),
    onSuccess: async () => {
      await invalidate();
      toast.success("Scope deleted");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const edit = (scope: ProgramScopeDto) => {
    setEditing(scope.id);
    setForm({
      asset: scope.asset,
      assetType: scope.assetType,
      isInScope: scope.isInScope,
      bountyEligible: scope.bountyEligible,
      notes: scope.notes,
    });
  };
  return (
    <div className="space-y-4">
      {!embedded && (
        <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
          <ShieldAlert className="size-5 text-warning" />
          <b>Scope changes affect future automation safety checks.</b>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{editing ? "Edit scope" : "Add scope"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Asset">
            <Input
              value={form.asset}
              onChange={(event) =>
                setForm({ ...form, asset: event.target.value })
              }
              placeholder="*.example.com"
            />
          </Field>
          <Field label="Asset type">
            <Select
              value={form.assetType}
              onValueChange={(value) =>
                setForm({
                  ...form,
                  assetType: value as CreateScopeInput["assetType"],
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCOPE_ASSET_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Toggle
            label="In scope"
            value={form.isInScope}
            set={(value) => setForm({ ...form, isInScope: value })}
          />
          <Toggle
            label="Bounty eligible"
            value={form.bountyEligible}
            set={(value) => setForm({ ...form, bountyEligible: value })}
          />
          <div className="sm:col-span-2 lg:col-span-3">
            <Field label="Notes">
              <Input
                value={form.notes ?? ""}
                onChange={(event) =>
                  setForm({ ...form, notes: event.target.value })
                }
              />
            </Field>
          </div>
          <div className="flex items-end gap-2">
            <Button
              disabled={!form.asset.trim() || save.isPending}
              onClick={() => save.mutate()}
            >
              <Save />
              {editing ? "Update" : "Add"}
            </Button>
            {editing && (
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setForm({
                    asset: "",
                    assetType: "domain",
                    isInScope: true,
                    bountyEligible: true,
                    notes: "",
                  });
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      {query.isLoading ? (
        <Empty text="Loading scope…" />
      ) : query.isError ? (
        <QueryState
          message={errorMessage(query.error)}
          retry={() => query.refetch()}
        />
      ) : query.data.length === 0 ? (
        <Empty text="No scope entries yet." />
      ) : (
        <DataTable
          rows={query.data}
          columns={[
            {
              key: "asset",
              label: "Asset",
              render: (scope) => (
                <div>
                  <span className="font-mono text-sm">{scope.asset}</span>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {scope.normalizedAsset}
                  </p>
                </div>
              ),
            },
            {
              key: "type",
              label: "Type",
              render: (scope) => <StatusBadge value={scope.assetType} />,
            },
            {
              key: "scope",
              label: "Scope",
              render: (scope) => (
                <StatusBadge
                  value={scope.isInScope ? "in_scope" : "out_of_scope"}
                />
              ),
            },
            {
              key: "bounty",
              label: "Bounty",
              render: (scope) => (
                <StatusBadge
                  value={scope.bountyEligible ? "eligible" : "not eligible"}
                />
              ),
            },
            {
              key: "notes",
              label: "Notes",
              render: (scope) => scope.notes || "—",
            },
            {
              key: "actions",
              label: "",
              render: (scope) => (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => edit(scope)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (confirm("Delete this scope entry?"))
                        remove.mutate(scope.id);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

export function RulesPage() {
  const { selectedProgramId } = useSelectedProgram();
  return (
    <div className="space-y-5">
      <PageHeader
        title="Rules of engagement"
        description="Configure hard automation limits for the selected program."
      />
      {selectedProgramId ? (
        <RulesManager programId={selectedProgramId} />
      ) : (
        <Empty text="Select a program from the top navigation to manage its rules." />
      )}
    </div>
  );
}

function RulesManager({
  programId,
  embedded = false,
}: {
  programId: string;
  embedded?: boolean;
}) {
  const queryClient = useQueryClient();
  const query = useQuery(coreQ.rules(programId));
  const [form, setForm] = useState<UpdateRulesInput>({
    automationAllowed: "unknown",
    aggressiveAllowed: false,
    rateLimitRps: null,
    maxConcurrency: null,
    forbiddenActions: [],
    authTestingAllowed: false,
    dosTestingAllowed: false,
    notes: "",
  });
  const [forbidden, setForbidden] = useState("");
  useEffect(() => {
    if (query.data) {
      setForm({
        automationAllowed: query.data.automationAllowed,
        aggressiveAllowed: query.data.aggressiveAllowed,
        rateLimitRps: query.data.rateLimitRps,
        maxConcurrency: query.data.maxConcurrency,
        forbiddenActions: (query.data.forbiddenActions ?? []).filter(
          (value): value is string => typeof value === "string",
        ),
        authTestingAllowed: query.data.authTestingAllowed,
        dosTestingAllowed: query.data.dosTestingAllowed,
        notes: query.data.notes,
      });
      setForbidden(
        (query.data.forbiddenActions ?? [])
          .filter((value) => typeof value === "string")
          .join(", "),
      );
    }
  }, [query.data]);
  const save = useMutation({
    mutationFn: () =>
      coreApi.updateProgramRules(programId, {
        ...form,
        forbiddenActions: forbidden
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["core", "rules", programId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["core", "program", programId],
        }),
      ]);
      toast.success("Rules saved");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  if (query.isLoading) return <Empty text="Loading rules…" />;
  if (query.isError)
    return (
      <QueryState
        message={errorMessage(query.error)}
        retry={() => query.refetch()}
      />
    );
  return (
    <div className="space-y-4">
      {!embedded && (
        <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
          <ShieldAlert className="size-5 text-warning" />
          <b>DoS testing remains disabled unless explicitly allowed.</b>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-5">
            <Field label="Automation allowed">
              <Select
                value={form.automationAllowed}
                onValueChange={(value) =>
                  setForm({
                    ...form,
                    automationAllowed:
                      value as UpdateRulesInput["automationAllowed"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTOMATION_ALLOWED_VALUES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rate limit (RPS)">
                <Input
                  type="number"
                  min={1}
                  value={form.rateLimitRps ?? ""}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      rateLimitRps: event.target.value
                        ? Number(event.target.value)
                        : null,
                    })
                  }
                />
              </Field>
              <Field label="Max concurrency">
                <Input
                  type="number"
                  min={1}
                  value={form.maxConcurrency ?? ""}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      maxConcurrency: event.target.value
                        ? Number(event.target.value)
                        : null,
                    })
                  }
                />
              </Field>
            </div>
            <Toggle
              label="Aggressive allowed"
              value={form.aggressiveAllowed}
              set={(value) => setForm({ ...form, aggressiveAllowed: value })}
            />
            <Toggle
              label="Authentication testing allowed"
              value={form.authTestingAllowed}
              set={(value) => setForm({ ...form, authTestingAllowed: value })}
            />
            <Toggle
              label="DoS testing allowed"
              value={form.dosTestingAllowed}
              set={(value) => setForm({ ...form, dosTestingAllowed: value })}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4 p-5">
            <Field label="Forbidden actions (comma separated)">
              <Textarea
                value={forbidden}
                onChange={(event) => setForbidden(event.target.value)}
                placeholder="dos, bruteforce"
              />
            </Field>
            <Field label="Notes">
              <Textarea
                className="min-h-32"
                value={form.notes ?? ""}
                onChange={(event) =>
                  setForm({ ...form, notes: event.target.value })
                }
              />
            </Field>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              <Save />
              {save.isPending ? "Saving…" : "Save rules"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function HeadersManager({ programId }: { programId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({ ...coreQ.headers(programId), initialData: [] });
  const [form, setForm] = useState<CreateHeaderInput>({
    name: "",
    value: "",
    isRequired: true,
  });
  const [editing, setEditing] = useState<string | null>(null);
  const headerRows = query.data ?? [];
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["core", "headers", programId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["core", "program", programId],
      }),
      queryClient.invalidateQueries({ queryKey: ["core", "programs"] }),
    ]);
  const save = useMutation({
    mutationFn: () =>
      editing
        ? coreApi.updateProgramHeader(programId, editing, form)
        : coreApi.createProgramHeader(programId, form),
    onSuccess: async () => {
      await invalidate();
      setEditing(null);
      setForm({ name: "", value: "", isRequired: true });
      toast.success("Header saved");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => coreApi.deleteProgramHeader(programId, id),
    onSuccess: async () => {
      await invalidate();
      toast.success("Header deleted");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const edit = (header: ProgramHeaderDto) => {
    setEditing(header.id);
    setForm({
      name: header.name,
      value: header.value,
      isRequired: header.isRequired,
    });
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {editing ? "Edit required header" : "Add required header"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[1fr_1fr_auto_auto]">
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </Field>
          <Field label="Value">
            <Input
              value={form.value}
              onChange={(event) =>
                setForm({ ...form, value: event.target.value })
              }
            />
          </Field>
          <Toggle
            label="Required"
            value={form.isRequired}
            set={(value) => setForm({ ...form, isRequired: value })}
          />
          <Button
            className="self-end"
            disabled={!form.name.trim() || !form.value || save.isPending}
            onClick={() => save.mutate()}
          >
            <Save />
            Save
          </Button>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Local development stores header values as plaintext. Encryption at rest
        will be added before production.
      </p>
      {query.isLoading ? (
        <Empty text="Loading headers…" />
      ) : query.isError ? (
        <QueryState
          message={errorMessage(query.error)}
          retry={() => query.refetch()}
        />
      ) : query.data.length === 0 ? (
        <Empty text="No required headers configured." />
      ) : (
        <DataTable
          rows={query.data}
          columns={[
            {
              key: "name",
              label: "Header",
              render: (header) => (
                <span className="font-mono">{header.name}</span>
              ),
            },
            {
              key: "value",
              label: "Value",
              render: (header) => (
                <span className="font-mono">{header.value}</span>
              ),
            },
            {
              key: "required",
              label: "Required",
              render: (header) => (
                <StatusBadge
                  value={header.isRequired ? "required" : "optional"}
                />
              ),
            },
            {
              key: "actions",
              label: "",
              render: (header) => (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => edit(header)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (confirm("Delete this header?"))
                        remove.mutate(header.id);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function Toggle({
  label,
  value,
  set,
}: {
  label: string;
  value: boolean;
  set: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 self-end rounded-md border px-3 py-2">
      <Label>{label}</Label>
      <Switch checked={value} onCheckedChange={set} />
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
