import { useMemo,useState,type ReactNode } from "react"; 
import { useMutation,useQueryClient,useSuspenseQuery } from "@tanstack/react-query"; 
import { Link } from "@tanstack/react-router"; 
import { Play,Terminal } from "lucide-react"; 
import { toast } from "sonner";
import { q } from "@/lib/queries"; 
import { api } from "@/lib/api-client"; 
import type { Asset,AssetStatus,ReconJob } from "@/lib/bounty-types"; 
import { PageHeader,SearchBox } from "./page-kit"; 
import { DataTable } from "./data-table"; 
import { StatusBadge } from "./status-badge"; 
import { Button } from "@/components/ui/button"; 
import { Sheet,SheetContent,SheetDescription,SheetHeader,SheetTitle } from "@/components/ui/sheet";
import { useSelectedProgram } from "./program-context";
import { ScopeGuardPanel, getScopeGuard } from "./scope-guard-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";

const pn=(id:string)=>id==="p1"?"Acme":id==="p2"?"Northstar":"Orbit"; 
const tags=(x:string[])=><div className="flex gap-1">{x.map(v=><StatusBadge key={v} value={v}/>)}</div>;

export function JobsPage({ programId }: { programId?: string }){
  const selected=useSelectedProgram().selectedProgramId;
  const effectiveProgramId=programId??selected;
  const {data}=useSuspenseQuery(q.jobs(effectiveProgramId));
  const {data:programs}=useSuspenseQuery(q.programs());
  const {data:scopes}=useSuspenseQuery(q.scopes(effectiveProgramId));
  const {data:rules}=useSuspenseQuery(q.rules(effectiveProgramId??"p1"));
  const qc=useQueryClient();
  const [logs,setLogs]=useState<ReconJob|null>(null);
  const run=useMutation({
    mutationFn:(t:string)=>api.runJob(t, effectiveProgramId??programs[0]?.id??"p1"),
    onSuccess:()=>{qc.invalidateQueries({queryKey:["jobs"]});toast.success("Recon job queued")}
  });
  const types=["Full recon","Subdomain enum","DNS resolve","HTTP probe","Port scan","URL collection","Crawl","Nuclei","FFUF","Secret scan"];
  const guard=getScopeGuard(programs.find(x=>x.id===(effectiveProgramId??programs[0]?.id)),rules,scopes);
  return (
    <div className="space-y-5">
       {!programId && <PageHeader title="Recon jobs" description="Policy-gated worker execution, progress, errors, and logs."/>}
       <ScopeGuardPanel program={programs.find(x=>x.id===(effectiveProgramId??programs[0]?.id))} rules={rules} scopes={scopes}/>
       <div className="flex flex-wrap gap-2">{types.map((x,index)=><Button key={x} variant={index===0?"default":"outline"} size="sm" disabled={!guard.safe||run.isPending} onClick={()=>run.mutate(x)}>{index===0&&<Play/>}{`Run ${x.toLowerCase()}`}</Button>)}</div>
      <DataTable 
        rows={data} 
        columns={[
          {key:"type",label:"Job type",render:x=><b>{x.type}</b>},
          {key:"program",label:"Program",render:x=>pn(x.programId)},
          {key:"status",label:"Status",render:x=><StatusBadge value={x.status}/>},
          {key:"created",label:"Created",render:x=>x.createdAt},
          {key:"started",label:"Started",render:x=>x.startedAt??"—"},
          {key:"finished",label:"Finished",render:x=>x.finishedAt??"—"},
          {key:"duration",label:"Duration",render:x=><span className="font-mono">{x.duration}</span>},
          {key:"tool",label:"Tool",render:x=><span className="font-mono">{x.tool}</span>},
          {key:"error",label:"Error",render:x=><span className="text-destructive">{x.error??"—"}</span>},
          {key:"action",label:"",render:x=><div className="flex"><Button size="sm" variant="ghost" onClick={()=>setLogs(x)}><Terminal/>Logs</Button>{["queued","running"].includes(x.status)&&<Button size="sm" variant="ghost" onClick={()=>api.cancelJob(x.id).then(()=>qc.invalidateQueries({queryKey:["jobs"]}))}>Cancel</Button>}</div>}
        ]} 
      />
      <Sheet open={!!logs} onOpenChange={v=>!v&&setLogs(null)}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{logs?.type} logs</SheetTitle>
            <SheetDescription>Live worker output for {logs?.id}.</SheetDescription>
          </SheetHeader>
          <pre className="mt-6 overflow-auto rounded-md bg-sidebar p-4 font-mono text-xs leading-6 text-sidebar-foreground">{logs?.logs.join("\n")}</pre>
        </SheetContent>
      </Sheet>
    </div>
  )
}

export function AssetsPage({ programId }: { programId?: string }){
  const selected=useSelectedProgram().selectedProgramId;
  const {data}=useSuspenseQuery(q.assets(programId??selected));
  const qc=useQueryClient();
  const [search,setSearch]=useState("");
  const [type,setType]=useState("all");
  const [status,setStatus]=useState("all");
  const [scope,setScope]=useState("all");
  const [category,setCategory]=useState("");
  const [reason,setReason]=useState("");
  const [minScore,setMinScore]=useState(0);
  const [detail,setDetail]=useState<Asset|null>(null);
  const rows=useMemo(()=>data.filter(x=>(x.value.toLowerCase().includes(search.toLowerCase())||x.categories.some(c=>c.includes(search.toLowerCase())))&&(type==="all"||x.type===type)&&(status==="all"||x.status===status)&&(scope==="all"||x.scope===scope)&&(!category||x.categories.some(c=>c.includes(category.toLowerCase())))&&(!reason||x.reasons.some(r=>r.toLowerCase().includes(reason.toLowerCase())))&&x.finalScore>=minScore),[data,search,type,status,scope,category,reason,minScore]);
  const act=(id:string,nextStatus:AssetStatus)=>api.setAssetStatus(id,nextStatus).then(()=>{qc.invalidateQueries({queryKey:["assets"]});toast.success(`Asset marked ${nextStatus}`)});
  
  return (
    <div className="space-y-5">
      {!programId && <PageHeader title="Asset inventory" description="Scored attack surface with scope, category, provenance, and review state." actions={<Button variant="outline" onClick={()=>toast.success("Recon triggered")}><Play/>Trigger recon</Button>}/>}
      <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-8">
        <SearchBox value={search} onChange={setSearch}/>
        <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue placeholder="Asset type"/></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem>{Array.from(new Set(data.map(x=>x.type))).map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select>
        <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue placeholder="Status"/></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{Array.from(new Set(data.map(x=>x.status))).map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select>
        <Select value={scope} onValueChange={setScope}><SelectTrigger><SelectValue placeholder="Scope"/></SelectTrigger><SelectContent><SelectItem value="all">All scope</SelectItem>{Array.from(new Set(data.map(x=>x.scope))).map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select>
        <Input value={category} onChange={e=>setCategory(e.target.value)} placeholder="Category"/><Input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason tag"/><Input type="number" value={minScore} onChange={e=>setMinScore(Number(e.target.value))} placeholder="Min score"/><Button variant="outline" onClick={()=>{setSearch("");setType("all");setStatus("all");setScope("all");setCategory("");setReason("");setMinScore(0)}}>Clear filters</Button>
      </div>
      <DataTable 
        rows={rows} 
        columns={[
          {key:"value",label:"Value",render:x=><span className="font-mono font-medium">{x.value}</span>},
          {key:"type",label:"Type",render:x=>x.type},
          {key:"scope",label:"Scope",render:x=><StatusBadge value={x.scope}/>},
          {key:"status",label:"Status",render:x=><StatusBadge value={x.status}/>},
          {key:"score",label:"Auto / Manual / Final",render:x=><button className="font-mono text-left" onClick={()=>setDetail(x)}>{x.autoScore} / {x.manualScore??"—"} / <b className="text-primary">{x.finalScore}</b>{x.manualScore!==null&&<span className="ml-2 text-[9px] text-info">OVERRIDE</span>}</button>},
          {key:"cat",label:"Categories",render:x=>tags(x.categories)},
          {key:"reasons",label:"Reason tags",render:x=><span className="text-xs text-muted-foreground">{x.reasons.join(", ")}</span>},
          {key:"seen",label:"First / last seen",render:x=><span className="text-xs">{x.firstSeen}<br/>{x.lastSeen}</span>},
          {key:"review",label:"Last reviewed",render:x=>x.lastReviewed??"Never"},
          {key:"actions",label:"",render:x=><div className="flex flex-wrap"><Button asChild variant="ghost" size="sm"><Link to="/assets/$assetId" params={{assetId:x.id}}>Detail</Link></Button><Button variant="ghost" size="sm" onClick={()=>act(x.id,"promising")}>Promising</Button><Button variant="ghost" size="sm" onClick={()=>act(x.id,"ignored")}>Ignore</Button><Button asChild variant="ghost" size="sm"><Link to="/review/$assetId" params={{assetId:x.id}}>Review</Link></Button></div>}
        ]} 
      />
      <AssetDetail asset={detail} onClose={()=>setDetail(null)} onStatus={act}/>
    </div>
  )
}

function AssetDetail({asset,onClose,onStatus}:{asset:Asset|null;onClose:()=>void;onStatus:(id:string,status:AssetStatus)=>void}){const [manual,setManual]=useState("");return <Sheet open={!!asset} onOpenChange={open=>!open&&onClose()}><SheetContent className="w-full overflow-y-auto sm:max-w-2xl"><SheetHeader><SheetTitle>{asset?.value}</SheetTitle><SheetDescription>Asset context and score provenance</SheetDescription></SheetHeader>{asset&&<div className="mt-6 space-y-5"><div className="grid grid-cols-3 gap-3"><Score label="Auto" value={asset.autoScore}/><Score label="Manual" value={asset.manualScore??"—"}/><Score label="Final" value={asset.finalScore}/></div>{asset.manualScore!==null&&<StatusBadge value="manual override active"/>}<div><Label>Manual score override</Label><div className="mt-2 flex gap-2"><Input type="number" value={manual} onChange={e=>setManual(e.target.value)} placeholder="Empty uses auto score"/><Button onClick={()=>api.updateAsset(asset.id,{manualScore:manual===""?null:Number(manual)}).then(()=>toast.success("Manual score updated"))}>Apply</Button></div></div><div><Label>Categories</Label><div className="mt-2">{tags(asset.categories)}</div></div><div><Label>Reason tags</Label><p className="mt-1 text-sm text-muted-foreground">{asset.reasons.join(" · ")}</p></div><div className="grid grid-cols-2 gap-3 text-sm"><div><Label>First seen</Label><p>{asset.firstSeen}</p></div><div><Label>Last seen</Label><p>{asset.lastSeen}</p></div><div><Label>Related URLs</Label><p>{asset.relatedUrls}</p></div><div><Label>Last reviewed</Label><p>{asset.lastReviewed??"Never"}</p></div></div><div><Label>Why this score?</Label><div className="mt-2 space-y-2">{asset.scoreEvents.map(event=><div key={`${event.ruleName}${event.timestamp}`} className="rounded-md border p-3 text-sm"><div className="flex justify-between"><b>{event.ruleName}</b><span className="text-primary">+{event.scoreDelta}</span></div><p className="text-muted-foreground">{event.reason} · {event.timestamp}</p></div>)}</div></div><div className="flex flex-wrap gap-2">{(["manual_started","promising","manual_done","potential_bug","reported","duplicate","monitor","ignored"] as AssetStatus[]).map(status=><Button key={status} variant="outline" size="sm" onClick={()=>onStatus(asset.id,status)}>{status.replaceAll("_"," ")}</Button>)}</div><div className="pt-3"><Button asChild className="w-full"><Link to="/assets/$assetId" params={{assetId:asset.id}}>Open full target workspace →</Link></Button></div></div>}</SheetContent></Sheet>}
function Score({label,value}:{label:string;value:string|number}){return <div className="rounded-md border p-3 text-center"><p className="text-xs text-muted-foreground">{label}</p><p className="font-display text-2xl font-bold">{value}</p></div>}

export function LiveHostsPage({ programId }: { programId?: string }){
  const selected=useSelectedProgram().selectedProgramId;
  const {data}=useSuspenseQuery(q.services(programId??selected));
  return <Simple title="Live hosts" desc="Responsive HTTP services and exposed technology fingerprints" rows={data} columns={[{key:"host",label:"Host",render:x=><span className="font-mono">{x.host}:{x.port}</span>},{key:"protocol",label:"Protocol",render:x=>x.protocol},{key:"status",label:"HTTP",render:x=><StatusBadge value={String(x.status)}/>},{key:"title",label:"Title",render:x=>x.title},{key:"tech",label:"Technologies",render:x=>tags(x.technologies)},{key:"score",label:"Score",render:x=><b className="text-primary">{x.score}</b>},{key:"action",label:"",render:x=><Button asChild variant="ghost" size="sm"><Link to="/assets/$assetId" params={{assetId:x.assetId}}>Target Detail</Link></Button>}]} hideHeader={!!programId}/>
}

export function UrlsPage({ programId }: { programId?: string }){
  const selected=useSelectedProgram().selectedProgramId;
  const {data}=useSuspenseQuery(q.urls(programId??selected));
  return <Simple title="URLs / Pages" desc="Collected and crawled application paths categorized for review" rows={data} columns={[{key:"url",label:"URL",render:x=><a className="font-mono text-xs hover:text-primary" href={x.url} target="_blank" rel="noreferrer">{x.url}</a>},{key:"host",label:"Host",render:x=>x.host},{key:"status",label:"Status",render:x=><StatusBadge value={String(x.statusCode)}/>},{key:"title",label:"Title",render:x=>x.title},{key:"cat",label:"Categories",render:x=>tags(x.categories)},{key:"score",label:"Auto / Final",render:x=>`${x.autoScore} / ${x.finalScore}`},{key:"source",label:"Source",render:x=><span className="font-mono">{x.source}</span>},{key:"seen",label:"First / Last",render:x=><span className="text-xs">{x.firstSeen}<br/>{x.lastSeen}</span>},{key:"action",label:"",render:x=><Button asChild variant="ghost" size="sm"><Link to="/urls/$urlId" params={{urlId:x.id}}>URL Detail</Link></Button>}]} hideHeader={!!programId}/>
}

export function ApiEndpointsPage({ programId }: { programId?: string }){
  const selected=useSelectedProgram().selectedProgramId;
  const {data}=useSuspenseQuery(q.discoveredEndpoints(programId??selected));
  return <Simple title="API endpoints" desc="Discovered REST and GraphQL operations with auth context" rows={data} columns={[{key:"method",label:"Method",render:x=><StatusBadge value={x.method}/>},{key:"path",label:"Path",render:x=><span className="font-mono">{x.path}</span>},{key:"host",label:"Host",render:x=><span className="font-mono text-xs">{new URL(x.fullUrl).host}</span>},{key:"auth",label:"Auth",render:x=><StatusBadge value={x.authRequired}/>},{key:"source",label:"Source",render:x=>x.source},{key:"score",label:"Score",render:x=><b className="text-primary">{x.finalScore}</b>},{key:"status",label:"State",render:x=><StatusBadge value={x.status}/>},{key:"action",label:"",render:x=><Button asChild variant="ghost" size="sm"><Link to="/endpoints/$endpointId" params={{endpointId:x.id}}>Endpoint Detail</Link></Button>}]} hideHeader={!!programId}/>
}

function Simple<T extends {id:string}>({title,desc,rows,columns,hideHeader}:{title:string;desc:string;rows:T[];columns:{key:string;label:string;render:(row:any)=>ReactNode}[];hideHeader?:boolean}){
  return <div className="space-y-5">{!hideHeader && <PageHeader title={title} description={desc}/>}<DataTable rows={rows} columns={columns}/></div>
}
