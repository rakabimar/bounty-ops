import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { coreApi } from "@/lib/api-client";
import { coreQ } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "./page-kit";
import { StatusBadge } from "./status-badge";

const message = (error: unknown) => error instanceof Error ? error.message : "Scoring request failed";

export function CoreScoringPage() {
  const queryClient = useQueryClient();
  const rules = useQuery(coreQ.scoringRules());
  const [yaml, setYaml] = useState("");
  const [host, setHost] = useState("api-staging.local.invalid");
  const [url, setUrl] = useState("https://api-staging.local.invalid/graphql");
  const [title, setTitle] = useState("GraphQL Playground");
  const [statusCode, setStatusCode] = useState("200");
  const [port, setPort] = useState("443");
  const [technologies, setTechnologies] = useState("GraphQL, Express");
  useEffect(() => { if (rules.data?.rawYaml) setYaml(rules.data.rawYaml); }, [rules.data?.rawYaml]);
  const save = useMutation({ mutationFn: () => coreApi.updateScoringRules(yaml), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["core", "scoring", "rules"] }); toast.success("Scoring rules saved; backup created"); }, onError: (error) => toast.error(message(error)) });
  const preview = useMutation({ mutationFn: () => coreApi.previewScoring({ entityType: "http_service", host, url, title, statusCode: statusCode ? Number(statusCode) : undefined, port: port ? Number(port) : undefined, technologies: technologies.split(",").map((item) => item.trim()).filter(Boolean) }), onError: (error) => toast.error(message(error)) });

  return <div className="space-y-5">
    <PageHeader title="Scoring rules" description="Edit the config-driven YAML and preview the exact evaluator used by the worker." actions={<Button disabled={save.isPending || !yaml} onClick={() => save.mutate()}>{save.isPending ? "Saving..." : "Save rules"}</Button>} />
    {rules.isLoading && <p className="text-sm text-muted-foreground">Loading scoring rules...</p>}
    {rules.isError && <p className="rounded-md border border-destructive/40 p-4 text-sm">{message(rules.error)}</p>}
    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <Card><CardHeader><CardTitle>YAML configuration</CardTitle></CardHeader><CardContent><Textarea className="min-h-[620px] font-mono text-xs" value={yaml} onChange={(event) => setYaml(event.target.value)} /></CardContent></Card>
      <div className="space-y-4"><Card><CardHeader><CardTitle>Preview input</CardTitle></CardHeader><CardContent className="space-y-3"><Input value={host} onChange={(event) => setHost(event.target.value)} placeholder="Host" /><Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="URL" /><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" /><div className="grid grid-cols-2 gap-2"><Input type="number" value={statusCode} onChange={(event) => setStatusCode(event.target.value)} placeholder="Status" /><Input type="number" value={port} onChange={(event) => setPort(event.target.value)} placeholder="Port" /></div><Input value={technologies} onChange={(event) => setTechnologies(event.target.value)} placeholder="Technologies, comma separated" /><Button className="w-full" variant="outline" disabled={preview.isPending} onClick={() => preview.mutate()}>{preview.isPending ? "Evaluating..." : "Preview score"}</Button></CardContent></Card>
        {preview.data && <Card><CardHeader><CardTitle>Preview result</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex items-center justify-between"><div><div className="text-4xl font-bold text-primary">{preview.data.autoScore}</div><div className="text-xs text-muted-foreground">confidence {preview.data.confidence}%</div></div><StatusBadge value={preview.data.priority} /></div><div className="flex flex-wrap gap-1">{preview.data.categories.map((item) => <StatusBadge key={item} value={item} />)}</div>{preview.data.scoreEvents.map((item, index) => <div key={`${item.ruleId}-${index}`} className="flex justify-between rounded-md border p-2 text-sm"><span>{item.ruleName}</span><b>{item.scoreDelta >= 0 ? "+" : ""}{item.scoreDelta}</b></div>)}</CardContent></Card>}
      </div>
    </div>
  </div>;
}
