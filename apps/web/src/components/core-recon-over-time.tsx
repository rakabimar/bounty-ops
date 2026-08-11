import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarClock, Play, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ReconScheduleFrequency } from "@bountyops/shared";
import { coreApi } from "@/lib/api-client";
import { coreQ } from "@/lib/queries";
import { useSelectedProgram } from "./program-context";
import { DataTable } from "./data-table";
import { Empty, PageHeader } from "./page-kit";
import { StatusBadge } from "./status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The request could not be completed.";
const when = (value: string | null) =>
  value ? new Date(value).toLocaleString() : "—";

export function SchedulesPanel({ programId }: { programId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery(coreQ.schedules(programId));
  const [name, setName] = useState("Weekly deep recon");
  const [frequency, setFrequency] = useState<ReconScheduleFrequency>("weekly");
  const [timeOfDay, setTimeOfDay] = useState("03:00");
  const [editingId, setEditingId] = useState<string | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ["core", "schedules", programId],
    });
  const save = useMutation({
    mutationFn: () =>
      editingId
        ? coreApi.updateProgramSchedule(programId, editingId, {
            name,
            frequency,
            timeOfDay,
          })
        : coreApi.createProgramSchedule(programId, {
            name,
            frequency,
            timeOfDay,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            enabled: false,
          }),
    onSuccess: async () => {
      await refresh();
      toast.success(
        editingId ? "Schedule updated" : "Schedule created disabled for review",
      );
      setEditingId(null);
    },
    onError: (error) => toast.error(message(error)),
  });
  const update = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      coreApi.updateProgramSchedule(programId, id, { enabled }),
    onSuccess: refresh,
    onError: (error) => toast.error(message(error)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => coreApi.deleteProgramSchedule(programId, id),
    onSuccess: refresh,
    onError: (error) => toast.error(message(error)),
  });
  const run = useMutation({
    mutationFn: (id: string) => coreApi.runProgramScheduleNow(programId, id),
    onSuccess: (job) =>
      toast[job.status === "blocked" ? "error" : "success"](
        job.status === "blocked"
          ? "Run blocked by current Scope Guard policy"
          : "Recon queued after a fresh Scope Guard check",
      ),
    onError: (error) => toast.error(message(error)),
  });
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="size-4" />
            {editingId ? "Edit schedule" : "Create schedule"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_180px_140px_auto]">
          <div>
            <Label>Name</Label>
            <Input
              className="mt-1"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div>
            <Label>Frequency</Label>
            <Select
              value={frequency}
              onValueChange={(value) =>
                setFrequency(value as ReconScheduleFrequency)
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["daily", "every_3_days", "weekly", "manual"].map((value) => (
                  <SelectItem key={value} value={value}>
                    {value.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Local time</Label>
            <Input
              className="mt-1"
              type="time"
              value={timeOfDay}
              onChange={(event) => setTimeOfDay(event.target.value)}
            />
          </div>
          <Button
            className="self-end"
            disabled={!name.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {editingId ? "Save changes" : "Create disabled"}
          </Button>
        </CardContent>
      </Card>
      {query.isLoading ? (
        <Empty text="Loading schedules…" />
      ) : query.isError ? (
        <Empty text={message(query.error)} />
      ) : !query.data?.length ? (
        <Empty text="No recon schedules yet." />
      ) : (
        <DataTable
          rows={query.data}
          columns={[
            {
              key: "name",
              label: "Schedule",
              render: (item) => (
                <div>
                  <b>{item.name}</b>
                  <p className="text-xs text-muted-foreground">
                    {item.frequency.replaceAll("_", " ")} ·{" "}
                    {item.timeOfDay ?? "—"} {item.timezone}
                  </p>
                </div>
              ),
            },
            {
              key: "enabled",
              label: "Enabled",
              render: (item) => (
                <Switch
                  checked={item.enabled}
                  disabled={update.isPending}
                  onCheckedChange={(enabled) =>
                    update.mutate({ id: item.id, enabled })
                  }
                />
              ),
            },
            {
              key: "last",
              label: "Last run",
              render: (item) => when(item.lastTriggeredAt),
            },
            {
              key: "next",
              label: "Next run",
              render: (item) => when(item.nextRunAt),
            },
            {
              key: "actions",
              label: "",
              render: (item) => (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(item.id);
                      setName(item.name);
                      setFrequency(item.frequency);
                      setTimeOfDay(item.timeOfDay ?? "03:00");
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={run.isPending}
                    onClick={() => run.mutate(item.id)}
                  >
                    <Play className="size-3" />
                    Run now
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={remove.isPending}
                    onClick={() =>
                      confirm("Delete this schedule?") && remove.mutate(item.id)
                    }
                  >
                    <Trash2 className="size-4" />
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

export function ReconHistoryPanel({ programId }: { programId: string }) {
  const history = useQuery(coreQ.reconHistory(programId, { limit: 50 }));
  if (history.isLoading) return <Empty text="Loading recon history…" />;
  if (history.isError) return <Empty text={message(history.error)} />;
  const data = history.data!;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="Job runs" value={data.jobs.length} />
        <Metric label="Snapshots" value={data.snapshots.length} />
        <Metric label="Diff batches" value={data.diffBatches.length} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Job runs</CardTitle>
        </CardHeader>
        <CardContent>
          {!data.jobs.length ? (
            <Empty text="No job runs yet." />
          ) : (
            <DataTable
              rows={data.jobs}
              columns={[
                {
                  key: "type",
                  label: "Job type",
                  render: (item) => (
                    <span className="font-mono">{item.type}</span>
                  ),
                },
                {
                  key: "status",
                  label: "Status",
                  render: (item) => <StatusBadge value={item.status} />,
                },
                {
                  key: "duration",
                  label: "Duration",
                  render: (item) =>
                    item.durationMs == null ? "—" : `${item.durationMs} ms`,
                },
                {
                  key: "created",
                  label: "Created",
                  render: (item) => when(item.createdAt),
                },
              ]}
            />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Comparable recon snapshots</CardTitle>
        </CardHeader>
        <CardContent>
          {!data.snapshots.length ? (
            <Empty text="No snapshots yet. The first successful run becomes the baseline." />
          ) : (
            <DataTable
              rows={data.snapshots}
              columns={[
                {
                  key: "stage",
                  label: "Stage",
                  render: (item) => (
                    <span className="font-mono">{item.stage}</span>
                  ),
                },
                {
                  key: "status",
                  label: "Status",
                  render: (item) => <StatusBadge value={item.status} />,
                },
                {
                  key: "count",
                  label: "Observed",
                  render: (item) => item.observedCount,
                },
                {
                  key: "comparable",
                  label: "Comparable",
                  render: (item) => (item.comparable ? "yes" : "no"),
                },
                {
                  key: "created",
                  label: "Created",
                  render: (item) => when(item.createdAt),
                },
              ]}
            />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Diff batches</CardTitle>
        </CardHeader>
        <CardContent>
          {!data.diffBatches.length ? (
            <Empty text="No comparable differences yet." />
          ) : (
            <DataTable
              rows={data.diffBatches}
              columns={[
                { key: "stage", label: "Stage", render: (item) => item.stage },
                {
                  key: "counts",
                  label: "Changes",
                  render: (item) =>
                    `+${item.addedCount} ~${item.changedCount} −${item.removedCount}`,
                },
                {
                  key: "importance",
                  label: "Importance",
                  render: (item) => <StatusBadge value={item.importance} />,
                },
                {
                  key: "created",
                  label: "Created",
                  render: (item) => when(item.createdAt),
                },
              ]}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ChangesPage() {
  const { selectedProgramId } = useSelectedProgram();
  const [period, setPeriod] = useState<"24h" | "7d" | "30d">("7d");
  const [importance, setImportance] = useState("all");
  const [changeType, setChangeType] = useState("");
  const [entityType, setEntityType] = useState("");
  const changes = useQuery(
    coreQ.changes({
      programId: selectedProgramId,
      importance:
        importance === "all"
          ? undefined
          : (importance as "low" | "medium" | "high" | "critical"),
      type: changeType || undefined,
      entityType: entityType || undefined,
      limit: 200,
    }),
  );
  const summary = useQuery(coreQ.changesSummary(selectedProgramId, period));
  return (
    <div className="space-y-5">
      <PageHeader
        title="Changes"
        description="Recon-over-time differences. Missing observations are only treated as removal after a complete comparable run."
        actions={
          <div className="flex gap-2">
            <Select
              value={period}
              onValueChange={(value) => setPeriod(value as typeof period)}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["24h", "7d", "30d"].map((value) => (
                  <SelectItem value={value} key={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() =>
                void Promise.all([changes.refetch(), summary.refetch()])
              }
            >
              <RefreshCw />
              Refresh
            </Button>
          </div>
        }
      />
      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          <Select value={importance} onValueChange={setImportance}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["all", "low", "medium", "high", "critical"].map((value) => (
                <SelectItem value={value} key={value}>
                  Importance: {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={changeType}
            onChange={(event) => setChangeType(event.target.value)}
            placeholder="Exact change type"
          />
          <Input
            value={entityType}
            onChange={(event) => setEntityType(event.target.value)}
            placeholder="Entity type"
          />
        </CardContent>
      </Card>
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Total" value={summary.data?.totalChanges ?? 0} />
        <Metric label="High" value={summary.data?.highImportance ?? 0} />
        <Metric
          label="Critical"
          value={summary.data?.criticalImportance ?? 0}
        />
        <Metric
          label="Priority promotions"
          value={summary.data?.priorityPromotions ?? 0}
        />
      </div>
      {changes.isLoading ? (
        <Empty text="Loading changes…" />
      ) : changes.isError ? (
        <Empty text={message(changes.error)} />
      ) : !changes.data?.length ? (
        <Empty text="No changes match the selected program." />
      ) : (
        <DataTable
          rows={changes.data}
          columns={[
            {
              key: "time",
              label: "Time",
              render: (item) => when(item.createdAt),
            },
            {
              key: "importance",
              label: "Importance",
              render: (item) => <StatusBadge value={item.importance} />,
            },
            {
              key: "type",
              label: "Change",
              render: (item) => (
                <span className="font-mono text-xs">{item.type}</span>
              ),
            },
            {
              key: "summary",
              label: "Summary",
              render: (item) => item.summary,
            },
            {
              key: "entity",
              label: "Entity",
              render: (item) => (
                <span className="font-mono text-xs">
                  {item.entityType}:{item.entityId}
                </span>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

export function NotificationEventsPanel() {
  const queryClient = useQueryClient();
  const query = useQuery(
    coreQ.notificationEvents({ status: "pending", limit: 100 }),
  );
  const ignore = useMutation({
    mutationFn: coreApi.ignoreNotificationEvent,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["core", "notification-events"],
      });
      toast.success("Event ignored");
    },
    onError: (error) => toast.error(message(error)),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-4" />
          Pending change events
        </CardTitle>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <Empty text="Loading notification events…" />
        ) : query.isError ? (
          <Empty text={message(query.error)} />
        ) : !query.data?.length ? (
          <Empty text="No pending notification events." />
        ) : (
          <DataTable
            rows={query.data}
            columns={[
              {
                key: "time",
                label: "Time",
                render: (item) => when(item.createdAt),
              },
              {
                key: "importance",
                label: "Importance",
                render: (item) => <StatusBadge value={item.importance} />,
              },
              {
                key: "title",
                label: "Event",
                render: (item) => (
                  <div>
                    <b>{item.title}</b>
                    <p className="text-xs text-muted-foreground">
                      {item.message}
                    </p>
                  </div>
                ),
              },
              {
                key: "action",
                label: "",
                render: (item) => (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={ignore.isPending}
                    onClick={() => ignore.mutate(item.id)}
                  >
                    Ignore
                  </Button>
                ),
              },
            ]}
          />
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
