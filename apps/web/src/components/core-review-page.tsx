import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { coreQ } from "@/lib/queries";
import { useSelectedProgram } from "./program-context";
import { PageHeader } from "./page-kit";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "./status-badge";

export function CoreReviewPage() {
  const { selectedProgramId } = useSelectedProgram();
  const [minScore, setMinScore] = useState("8");
  const query = useQuery(coreQ.manualReview({ programId: selectedProgramId, minScore: Number(minScore) || 8, limit: 200 }));
  return <div className="space-y-5"><PageHeader title="Manual review queue" description="In-scope, actionable assets ordered by final score." /><Input className="max-w-40" type="number" min={0} value={minScore} onChange={(event) => setMinScore(event.target.value)} placeholder="Minimum score" />{query.isLoading && <p className="text-sm text-muted-foreground">Loading review queue...</p>}{query.isError && <p className="rounded-md border border-destructive/40 p-4 text-sm">{query.error instanceof Error ? query.error.message : "Unable to load review queue"}</p>}{query.data?.length === 0 && <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">No assets currently meet this review threshold.</p>}<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{query.data?.map((asset) => <Card key={asset.id}><CardContent className="p-4"><div className="flex justify-between gap-2"><span className="truncate font-mono text-sm">{asset.value}</span><b className="text-primary">{asset.finalScore}</b></div><div className="mt-3 flex flex-wrap gap-1"><StatusBadge value={asset.priority} />{(asset.categories ?? []).map((item) => <StatusBadge key={item} value={item} />)}</div><p className="mt-3 text-xs text-muted-foreground">{(asset.reasonTags ?? []).join(" · ") || "No reason tags"}</p>{asset.manualScore !== null && <p className="mt-2 text-xs">Manual override: {asset.manualScore}</p>}</CardContent></Card>)}</div></div>;
}
