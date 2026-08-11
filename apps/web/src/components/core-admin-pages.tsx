import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Send } from "lucide-react";
import { toast } from "sonner";
import { coreApi } from "@/lib/api-client";
import { coreQ } from "@/lib/queries";
import { useSelectedProgram } from "./program-context";
import { DataTable } from "./data-table";
import { Empty, PageHeader, SearchBox } from "./page-kit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { NotificationEventsPanel } from "./core-recon-over-time";

const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The request could not be completed.";
const bool = (value: unknown) => value === true || value === "true";
const number = (value: unknown, fallback = 0) =>
  typeof value === "number" ? value : Number(value) || fallback;
const string = (value: unknown) => (typeof value === "string" ? value : "");

export function SettingsPage() {
  const queryClient = useQueryClient();
  const query = useQuery(coreQ.settings());
  const [values, setValues] = useState<Record<string, unknown>>({});
  useEffect(() => {
    if (query.data) setValues(query.data);
  }, [query.data]);
  const save = useMutation({
    mutationFn: async (keys: string[]) => {
      for (const key of keys) {
        if (key === "telegram.botToken" && values[key] === "********") continue;
        await coreApi.updateSetting(key, values[key]);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["core", "settings"] });
      toast.success("Settings saved");
    },
    onError: (error) => toast.error(message(error)),
  });
  if (query.isLoading) return <Empty text="Loading settings…" />;
  if (query.isError)
    return (
      <ErrorState error={message(query.error)} retry={() => query.refetch()} />
    );
  const aiKeys = ["ai.enabled", "ai.monthlyLimit", "gemini.model"];
  const defaultKeys = [
    "default.rateLimitRps",
    "default.maxConcurrency",
    "artifact.retentionDays",
    "recon.snapshotRetentionDays",
  ];
  return (
    <div className="space-y-5">
      <PageHeader
        title="App settings"
        description="Manage AI, rate-limit, concurrency, and artifact defaults stored by the core API."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>AI configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Toggle
              label="AI enabled"
              value={bool(values["ai.enabled"])}
              set={(value) => setValues({ ...values, "ai.enabled": value })}
            />
            <Field label="Monthly AI limit">
              <Input
                type="number"
                min={0}
                value={number(values["ai.monthlyLimit"])}
                onChange={(event) =>
                  setValues({
                    ...values,
                    "ai.monthlyLimit": Number(event.target.value),
                  })
                }
              />
            </Field>
            <Field label="Gemini model">
              <Input
                value={string(values["gemini.model"])}
                onChange={(event) =>
                  setValues({ ...values, "gemini.model": event.target.value })
                }
              />
            </Field>
            <Button
              disabled={save.isPending}
              onClick={() => save.mutate(aiKeys)}
            >
              <Save />
              Save AI settings
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Operational defaults</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Default rate limit (RPS)">
              <Input
                type="number"
                min={1}
                value={number(values["default.rateLimitRps"])}
                onChange={(event) =>
                  setValues({
                    ...values,
                    "default.rateLimitRps": Number(event.target.value),
                  })
                }
              />
            </Field>
            <Field label="Default max concurrency">
              <Input
                type="number"
                min={1}
                value={number(values["default.maxConcurrency"])}
                onChange={(event) =>
                  setValues({
                    ...values,
                    "default.maxConcurrency": Number(event.target.value),
                  })
                }
              />
            </Field>
            <Field label="Artifact retention days">
              <Input
                type="number"
                min={1}
                value={number(values["artifact.retentionDays"])}
                onChange={(event) =>
                  setValues({
                    ...values,
                    "artifact.retentionDays": Number(event.target.value),
                  })
                }
              />
            </Field>
            <Field label="Recon snapshot retention days">
              <Input
                type="number"
                min={1}
                value={number(values["recon.snapshotRetentionDays"], 90)}
                onChange={(event) =>
                  setValues({
                    ...values,
                    "recon.snapshotRetentionDays": Number(event.target.value),
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Future retention policy only; snapshots are not deleted
                automatically yet.
              </p>
            </Field>
            <Button
              disabled={save.isPending}
              onClick={() => save.mutate(defaultKeys)}
            >
              <Save />
              Save defaults
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const query = useQuery(coreQ.settings());
  const [enabled, setEnabled] = useState(false);
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");
  useEffect(() => {
    if (query.data) {
      setEnabled(bool(query.data["telegram.enabled"]));
      setToken(string(query.data["telegram.botToken"]));
      setChatId(string(query.data["telegram.chatId"]));
    }
  }, [query.data]);
  const save = useMutation({
    mutationFn: async () => {
      await coreApi.updateSetting("telegram.enabled", enabled);
      if (token && token !== "********")
        await coreApi.updateSetting("telegram.botToken", token);
      await coreApi.updateSetting("telegram.chatId", chatId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["core", "settings"] });
      toast.success("Telegram settings saved");
    },
    onError: (error) => toast.error(message(error)),
  });
  const test = useMutation({
    mutationFn: coreApi.testTelegramNotification,
    onSuccess: () => toast.success("Test notification sent"),
    onError: (error) => toast.error(message(error)),
  });
  if (query.isLoading) return <Empty text="Loading notification settings…" />;
  if (query.isError)
    return (
      <ErrorState error={message(query.error)} retry={() => query.refetch()} />
    );
  return (
    <div className="space-y-5">
      <PageHeader
        title="Notification settings"
        description="Configure Telegram and review persisted recon-change events."
        actions={
          <Button
            variant="outline"
            disabled={test.isPending}
            onClick={() => test.mutate()}
          >
            <Send />
            {test.isPending ? "Sending…" : "Send test notification"}
          </Button>
        }
      />
      <Card className="max-w-3xl">
        <CardContent className="space-y-4 p-5">
          <Toggle
            label="Telegram notifications enabled"
            value={enabled}
            set={setEnabled}
          />
          <Field label="Bot token">
            <Input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Enter a new token"
            />
            <p className="text-xs text-muted-foreground">
              A saved token is returned as ********. Leave it unchanged to
              preserve the existing token.
            </p>
          </Field>
          <Field label="Chat ID">
            <Input
              value={chatId}
              onChange={(event) => setChatId(event.target.value)}
            />
          </Field>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            <Save />
            {save.isPending ? "Saving…" : "Save Telegram settings"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Telegram delivery of persisted change events is deferred; events
            remain visible and auditable here.
          </p>
        </CardContent>
      </Card>
      <NotificationEventsPanel />
    </div>
  );
}

export function AuditLogsPage() {
  const { selectedProgramId } = useSelectedProgram();
  const [action, setAction] = useState("");
  const query = useQuery({
    ...coreQ.auditLogs({
      programId: selectedProgramId,
      action: action || undefined,
      limit: 100,
    }),
    initialData: [],
  });
  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit logs"
        description="Newest core API actions, including authentication and program configuration changes."
      />
      <SearchBox
        value={action}
        onChange={setAction}
        placeholder="Filter by exact action…"
      />
      {query.isLoading ? (
        <Empty text="Loading audit logs…" />
      ) : query.isError ? (
        <ErrorState
          error={message(query.error)}
          retry={() => query.refetch()}
        />
      ) : query.data.length === 0 ? (
        <Empty text="No audit events match this filter." />
      ) : (
        <DataTable
          rows={query.data}
          columns={[
            {
              key: "created",
              label: "Created",
              render: (row) => (
                <span className="text-xs">
                  {new Date(row.createdAt).toLocaleString()}
                </span>
              ),
            },
            {
              key: "action",
              label: "Action",
              render: (row) => (
                <span className="font-mono text-xs">{row.action}</span>
              ),
            },
            {
              key: "type",
              label: "Entity type",
              render: (row) => row.entityType || "—",
            },
            {
              key: "entity",
              label: "Entity ID",
              render: (row) => (
                <span className="max-w-36 truncate font-mono text-xs">
                  {row.entityId || "—"}
                </span>
              ),
            },
            {
              key: "program",
              label: "Program ID",
              render: (row) => (
                <span className="max-w-36 truncate font-mono text-xs">
                  {row.programId || "—"}
                </span>
              ),
            },
            {
              key: "metadata",
              label: "Metadata",
              render: (row) => (
                <span className="block max-w-64 truncate font-mono text-[10px] text-muted-foreground">
                  {row.metadata ? JSON.stringify(row.metadata) : "—"}
                </span>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

function ErrorState({ error, retry }: { error: string; retry: () => void }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" onClick={retry}>
          Retry
        </Button>
      </CardContent>
    </Card>
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
    <div className="flex items-center justify-between rounded-md border p-3">
      <Label>{label}</Label>
      <Switch checked={value} onCheckedChange={set} />
    </div>
  );
}
