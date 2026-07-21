import { useMemo,useState } from "react";
import { useMutation,useQueryClient,useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle,ArrowUpRight,Boxes,CheckCircle2,CircleX,Clock3,Globe2,Plus,Radar,RefreshCw,Server,ShieldAlert,Terminal,Trash2,TriangleAlert,History } from "lucide-react";
import { toast } from "sonner";
import { q } from "@/lib/queries"; import { api } from "@/lib/api-client"; import type { Asset,NotificationSettings,Rules,ScopeAsset,ScoringRule, ChangeRecord } from "@/lib/bounty-types";
import { PageHeader,MetricCard,SearchBox } from "./page-kit"; import { DataTable,type Column } from "./data-table"; import { StatusBadge } from "./status-badge";
import { Button } from "@/components/ui/button"; import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card"; import { Input } from "@/components/ui/input"; import { Label } from "@/components/ui/label"; import { Textarea } from "@/components/ui/textarea"; import { Switch } from "@/components/ui/switch";
import { Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle,DialogTrigger } from "@/components/ui/dialog"; import { Sheet,SheetContent,SheetDescription,SheetHeader,SheetTitle } from "@/components/ui/sheet"; import { Tabs,TabsContent,TabsList,TabsTrigger } from "@/components/ui/tabs";
import { AssetsPage, JobsPage, UrlsPage } from "./inventory-pages";
import { NotesPage } from "./triage-settings-pages";
import { ScopeGuardPanel } from "./scope-guard-panel";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import type { IntakeInput, IntakePreview, Platform } from "@/lib/bounty-types";
import { useSelectedProgram } from "./program-context";

const programName=(id:string)=>({p1:"Acme Security Program",p2:"Northstar Marketplace",p3:"Orbit Finance"}[id]??id);
const tags=(xs:string[])=><div className="flex flex-wrap gap-1">{xs.map(x=><StatusBadge key={x} value={x}/>)}</div>;
const actionToast=(name:string)=>toast.success(`${name} updated`);

function IntakePreviewCard({preview}:{preview:IntakePreview}) {
  const rows=[
    ["Program name",preview.name],["Platform",preview.platform],["Program URL",preview.url||"—"],["In-scope assets",preview.inScope.join(", ")],["Out-of-scope assets",preview.outOfScope.join(", ")],["Automation allowed",preview.rules.automation],["Aggressive allowed",preview.rules.aggressive?"Yes":"No"],["Rate limit",`${preview.rules.rateLimit} RPS`],["Max concurrency",String(preview.rules.concurrency)],["Required headers",preview.rules.headers.map(x=>`${x.name}: ${x.value}`).join(", ")||"None"],["Forbidden actions",preview.rules.forbidden.join(", ")],["Auth testing allowed",preview.rules.authTesting],["Confidence",`${preview.confidence}%`],["Needs manual review",preview.needsManualReview?"Yes":"No"],
  ];
  return <div className="grid gap-2 sm:grid-cols-2">{rows.map(([label,value])=><div key={label} className="rounded-md border p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>)}</div>;
}

export function OverviewPage(){
  const selectedProgramId=useSelectedProgram().selectedProgramId;
  const {data:d}=useSuspenseQuery(q.dashboard(selectedProgramId));
  const metrics=[
    ["Active programs",d.programs.filter(x=>x.status==="active").length,"+1 this month",<ShieldAlert/>],
    ["New assets today",d.assets.filter(x=>x.firstSeen.includes("Today")).length,"+28% vs yesterday",<Boxes/>],
    ["High-score assets",d.assets.filter(x=>x.finalScore>=15).length,"Requires review",<TriangleAlert/>],
    ["Live hosts",d.services.length,"3 newly observed",<Globe2/>],
    ["New URLs",d.urls.length,"Last collection 14m",<ArrowUpRight/>],
    ["Nuclei findings",7,"2 high severity",<ShieldAlert/>],
    ["Jobs running",d.jobs.filter(x=>x.status==="running").length,"Worker queue healthy",<Radar/>],
    ["Jobs failed",d.jobs.filter(x=>x.status==="failed").length,"Last 24 hours",<CircleX/>],
    ["Review queue",d.assets.filter(x=>x.finalScore>=3).length,"1 P1 priority",<CheckCircle2/>]
  ] as const;
  
  return (
    <div className="space-y-6">
      <PageHeader title="Operations overview" description="Recon throughput, attack surface changes, and the work that needs your attention." actions={<Button onClick={()=>actionToast("Dashboard")} variant="outline"><RefreshCw/>Refresh</Button>}/>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {metrics.map(([l,v,de,i])=><MetricCard key={l} label={l} value={v} delta={de} icon={i}/>)}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader><CardTitle>Recent recon activity</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {d.jobs.map(j=>(
              <div key={j.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b pb-3 last:border-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{j.type} · {programName(j.programId)}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{j.tool} / {j.duration}</p>
                </div>
                <StatusBadge value={j.status}/>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Priority review</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {d.assets.filter(x=>x.finalScore>=8).map(a=>(
              <Link key={a.id} to="/review/$assetId" params={{assetId:a.id}} className="block border-b pb-3 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm">{a.value}</span>
                  <b className="text-primary">{a.finalScore}</b>
                </div>
                <div className="mt-2">{tags(a.categories)}</div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function ProgramsPage(){
  const {data}=useSuspenseQuery(q.programs());
  const qc=useQueryClient();
  const [open,setOpen]=useState(false);
  const [step,setStep]=useState(1);
  const [input,setInput]=useState<IntakeInput>({platform:"HackerOne",method:"url_parser",programUrl:"",apiHandle:"",rawPolicyText:""});
  const [preview,setPreview]=useState<IntakePreview|null>(null);
  const parse=useMutation({mutationFn:api.intakePreview,onSuccess:value=>{setPreview(value);setStep(4)}});
  const approve=useMutation({mutationFn:(draft:boolean)=>preview?api.approveIntake(preview,draft):Promise.reject(new Error("Preview required")),onSuccess:(_,draft)=>{qc.invalidateQueries({queryKey:["programs"]});setOpen(false);setStep(1);setPreview(null);toast.success(draft?"Intake saved as draft":"Program intake approved")}});
  
  return (
    <div className="space-y-5">
      <PageHeader 
        title="Programs" 
        description="Public program intake, synchronization, schedules, and hunting state." 
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus/>Add program</Button></DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Program intake · Step {step} of 5</DialogTitle>
                <DialogDescription>Nothing becomes active until you approve the parsed policy and scope.</DialogDescription>
              </DialogHeader>
              {step===1&&<div className="grid grid-cols-2 gap-3">{(["HackerOne","Bugcrowd","YesWeHack","Custom"] as Platform[]).map(platform=><Button key={platform} variant={input.platform===platform?"default":"outline"} onClick={()=>setInput({...input,platform})}>{platform}</Button>)}</div>}
              {step===2&&<div className="grid gap-3 sm:grid-cols-3">{([['api','Platform API adapter'],['url_parser','Program URL parser'],['manual_paste','Manual paste']] as const).map(([method,label])=><Button key={method} variant={input.method===method?"default":"outline"} onClick={()=>setInput({...input,method})}>{label}</Button>)}</div>}
              {step===3&&<div className="space-y-4"><div><Label>Program URL</Label><Input className="mt-2" value={input.programUrl} onChange={e=>setInput({...input,programUrl:e.target.value})} placeholder="https://hackerone.com/program"/></div><div><Label>API handle</Label><Input className="mt-2" value={input.apiHandle} onChange={e=>setInput({...input,apiHandle:e.target.value})} placeholder="program-handle"/></div><div><Label>Manual bounty brief / policy</Label><Textarea className="mt-2 min-h-36" value={input.rawPolicyText} onChange={e=>setInput({...input,rawPolicyText:e.target.value})}/></div></div>}
              {step===4&&preview&&<IntakePreviewCard preview={preview}/>} 
              {step===5&&preview&&<div className="rounded-lg border border-warning/30 bg-warning/10 p-5"><h3 className="font-semibold">Manual approval required</h3><p className="mt-2 text-sm text-muted-foreground">Review the parsed scope and rules. Approval activates the program; saving a draft keeps recon disabled.</p></div>}
              <DialogFooter className="gap-2">{step>1&&step<5&&<Button variant="outline" onClick={()=>setStep(step-1)}>Back</Button>}{step<3&&<Button onClick={()=>setStep(step+1)}>Continue</Button>}{step===3&&<Button disabled={parse.isPending||(!input.programUrl&&!input.apiHandle&&!input.rawPolicyText)} onClick={()=>parse.mutate(input)}>Parse intake</Button>}{step===4&&<Button onClick={()=>setStep(5)}>Review approval</Button>}{step===5&&<><Button variant="outline" onClick={()=>approve.mutate(true)}>Save as Draft</Button><Button disabled={approve.isPending} onClick={()=>approve.mutate(false)}>Approve Intake</Button></>}</DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <DataTable 
        rows={data} 
        columns={[
          {key:"name",label:"Program",render:p=><Link to="/programs/$programId" params={{programId:p.id}} className="font-medium hover:text-primary">{p.name}</Link>},
          {key:"platform",label:"Platform",render:p=><StatusBadge value={p.platform}/>},
          {key:"status",label:"Status",render:p=><StatusBadge value={p.status}/>},
          {key:"hunt",label:"Hunting",render:p=><StatusBadge value={p.hunting}/>},
          {key:"scope",label:"Scope",render:p=>p.scopeCount},
          {key:"sched",label:"Schedules",render:p=>p.schedules},
          {key:"sync",label:"Last sync",render:p=>p.lastSync},
          {key:"recon",label:"Last recon",render:p=>p.lastRecon},
          {key:"action",label:"",render:p=><Button size="sm" variant="ghost" onClick={()=>api.updateProgram(p.id,{status:p.status==="active"?"paused":"active"}).then(()=>qc.invalidateQueries({queryKey:["programs"]}))}>{p.status==="active"?"Pause":"Resume"}</Button>}
        ]} 
      />
    </div>
  )
}

export function ProgramDetailPage({id}:{id:string}){
  const {data}=useSuspenseQuery(q.program(id));
  if(!data.program)return <p>Program not found.</p>;
  
  return (
    <div className="space-y-5">
      <PageHeader 
        eyebrow={data.program.platform.toUpperCase()} 
        title={data.program.name} 
        description={`${data.program.scopeCount} scoped assets · Last recon ${data.program.lastRecon}`} 
        actions={<StatusBadge value={data.program.status}/>}
      />
      <Tabs defaultValue="overview">
        <TabsList className="h-auto max-w-full justify-start overflow-x-auto">
          {["Overview","Scope","Rules","Headers","Schedules","Assets","Jobs","URLs","Changes","Notes"].map(x=><TabsTrigger value={x.toLowerCase()} key={x}>{x}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="overview">
          <div className="space-y-4"><ScopeGuardPanel program={data.program} rules={data.rules} scopes={data.scopes}/><div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="In-scope assets" value={data.scopes.filter(x=>x.scope==="in_scope").length} delta="Policy validated" icon={<ShieldAlert/>}/>
            <MetricCard label="Discovered assets" value={data.assets.length} delta="Across all scans" icon={<Boxes/>}/>
            <MetricCard label="Recon jobs" value={data.jobs.length} delta="Program history" icon={<Radar/>}/>
          </div></div>
        </TabsContent>
        <TabsContent value="scope"><ScopePage programId={id}/></TabsContent>
        <TabsContent value="rules"><ScopeGuardPanel program={data.program} rules={data.rules} scopes={data.scopes}/><div className="mt-4"><RulesPage programId={id}/></div></TabsContent>
        <TabsContent value="assets"><AssetsPage programId={id}/></TabsContent>
        <TabsContent value="jobs"><JobsPage programId={id}/></TabsContent>
        <TabsContent value="urls"><UrlsPage programId={id}/></TabsContent>
        <TabsContent value="changes"><ChangesList programId={id}/></TabsContent>
        <TabsContent value="notes"><NotesPage programId={id}/></TabsContent>
        <TabsContent value="headers"><HeadersEditor programId={id}/></TabsContent>
        <TabsContent value="schedules"><SchedulesTable programId={id}/></TabsContent>
      </Tabs>
    </div>
  )
}

export function ScopePage({ programId }: { programId?: string }){
  const selectedProgramId=useSelectedProgram().selectedProgramId;
  const effectiveProgramId=programId??selectedProgramId;
  const {data}=useSuspenseQuery(q.scopes(effectiveProgramId));
  const qc=useQueryClient();
  const blank:ScopeAsset={id:"",programId:effectiveProgramId??"p1",asset:"",normalized:"",type:"domain",scope:"in_scope",bountyEligible:true,notes:""};
  const [edit,setEdit]=useState<ScopeAsset|null>(null);
  const save=useMutation({
    mutationFn:(x:ScopeAsset)=>api.saveScope({...x,id:x.id||`s${Date.now()}`,normalized:x.asset.replace("*.","").toLowerCase()}),
    onSuccess:()=>{qc.invalidateQueries({queryKey:["scopes"]});setEdit(null);toast.success("Scope asset saved")}
  });
  
  return (
    <div className="space-y-5">
      {!programId && <PageHeader title="Scope manager" description="Normalize program assets and catch contradictory in-scope and exclusion rules." actions={<Button onClick={()=>setEdit(blank)}><Plus/>Add scope</Button>}/>}
      {data.some(x=>x.conflict)&&(
        <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
          <AlertTriangle className="size-5 shrink-0 text-warning"/>
          <div><b>Scope conflicts require review</b><p className="text-muted-foreground">An explicit exclusion overlaps an in-scope wildcard. Jobs remain gated until resolved.</p></div>
        </div>
      )}
      <DataTable 
        rows={data} 
        columns={[
          {key:"asset",label:"Asset",render:x=><span className="font-mono">{x.asset}</span>},
          {key:"normalized",label:"Normalized",render:x=>x.normalized},
          {key:"type",label:"Type",render:x=><StatusBadge value={x.type}/>},
          {key:"scope",label:"Scope",render:x=><StatusBadge value={x.scope}/>},
          {key:"bounty",label:"Bounty eligible",render:x=>x.bountyEligible?"Yes":"No"},
          {key:"notes",label:"Notes / conflicts",render:x=><span className={x.conflict?"text-warning":"text-muted-foreground"}>{x.conflict??x.notes}</span>},
          {key:"actions",label:"",render:x=><div className="flex"><Button variant="ghost" size="sm" onClick={()=>setEdit(x)}>Edit</Button><Button variant="ghost" size="icon" onClick={()=>api.deleteScope(x.id).then(()=>qc.invalidateQueries({queryKey:["scopes"]}))}><Trash2/></Button></div>}
        ]} 
      />
      <Sheet open={!!edit} onOpenChange={v=>!v&&setEdit(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Scope asset</SheetTitle>
            <SheetDescription>Changes are persisted in the mock API store.</SheetDescription>
          </SheetHeader>
          {edit&&(
            <div className="mt-6 space-y-4">
              <Label>Asset</Label>
              <Input value={edit.asset} onChange={e=>setEdit({...edit,asset:e.target.value})}/>
              <Label>Asset type</Label>
              <Input value={edit.type} onChange={e=>setEdit({...edit,type:e.target.value as ScopeAsset["type"]})}/><Label>Notes</Label><Textarea value={edit.notes} onChange={e=>setEdit({...edit,notes:e.target.value})}/><div className="flex items-center justify-between"><Label>Bounty eligible</Label><Switch checked={edit.bountyEligible} onCheckedChange={v=>setEdit({...edit,bountyEligible:v})}/></div><Button className="w-full" onClick={()=>save.mutate(edit)}>Save scope asset</Button></div>)}</SheetContent></Sheet></div>)}

export function RulesPage({ programId }: { programId?: string }){
  const selectedProgramId=useSelectedProgram().selectedProgramId;
  const effectiveProgramId=programId??selectedProgramId??"p1";
  const {data}=useSuspenseQuery(q.rules(effectiveProgramId));
  const initial=data??{programId:effectiveProgramId,automation:"unknown" as const,aggressive:false,rateLimit:0,concurrency:0,headers:[],forbidden:[],authTesting:"unknown" as const,dosTesting:false,notes:"",validated:false};
  const [v,setV]=useState<Rules>(initial);
  const save=useMutation({mutationFn:api.saveRules,onSuccess:()=>toast.success("Rules validated and saved")});
  return (
    <div className="space-y-5">
      {!programId && <PageHeader title="Rules of engagement" description="Hard limits enforced before any automated job can leave the queue."/>}
      <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm"><ShieldAlert className="size-5 text-warning"/><b>Jobs only run after scope and rules validation.</b></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardContent className="space-y-4 p-5"><Label>Automation allowed</Label><Input value={v.automation} onChange={e=>setV({...v,automation:e.target.value as Rules["automation"]})}/><div className="grid grid-cols-2 gap-3"><div><Label>Default rate limit (RPS)</Label><Input type="number" value={v.rateLimit} onChange={e=>setV({...v,rateLimit:Number(e.target.value)})}/></div><div><Label>Max concurrency</Label><Input type="number" value={v.concurrency} onChange={e=>setV({...v,concurrency:Number(e.target.value)})}/></div></div><Toggle label="Aggressive allowed" value={v.aggressive} set={x=>setV({...v,aggressive:x})}/><Label>Auth testing allowed</Label><Input value={v.authTesting} onChange={e=>setV({...v,authTesting:e.target.value as Rules["authTesting"]})}/><Toggle label="DoS testing allowed" value={v.dosTesting} set={x=>setV({...v,dosTesting:x})}/></CardContent></Card>
        <Card><CardContent className="space-y-4 p-5"><Label>Required headers</Label>{v.headers.map((header,index)=><div className="grid grid-cols-[1fr_1fr_auto] gap-2" key={header.id}><Input value={header.name} onChange={e=>setV({...v,headers:v.headers.map((x,i)=>i===index?{...x,name:e.target.value}:x)})}/><Input value={header.value} onChange={e=>setV({...v,headers:v.headers.map((x,i)=>i===index?{...x,value:e.target.value}:x)})}/><Button variant="ghost" onClick={()=>setV({...v,headers:v.headers.filter((_,i)=>i!==index)})}>Delete</Button></div>)}<Button variant="outline" onClick={()=>setV({...v,headers:[...v.headers,{id:`h${Date.now()}`,name:"",value:"",enabled:true}]})}>Add header</Button><Label>Forbidden actions</Label><Textarea value={v.forbidden.join("\n")} onChange={e=>setV({...v,forbidden:e.target.value.split("\n")})}/><Label>Notes</Label><Textarea value={v.notes} onChange={e=>setV({...v,notes:e.target.value})}/><div className="flex gap-2"><Button variant="outline" onClick={()=>setV({...v,validated:true})}>Validate Rules</Button><Button onClick={()=>save.mutate(v)}>Save Rules</Button></div></CardContent></Card>
      </div>
    </div>
  )
}

export function ChangesList({ programId }: { programId?: string }) {
  const { data } = useSuspenseQuery(q.changes(programId));
  return (
    <div className="space-y-4">
      {data.length === 0 ? (
        <p className="text-center py-10 text-muted-foreground">No changes recorded yet.</p>
      ) : (
        data.map((c: ChangeRecord) => (
          <Card key={c.id}>
            <CardContent className="p-4 flex items-start gap-3">
              <div className="p-2 rounded-full bg-accent">
                <History className="size-4 text-accent-foreground" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-sm">
                    {c.title}
                  </span>
                  <span className="text-xs text-muted-foreground">{c.discoveredAt}</span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs">
                   <span className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive line-through">{c.oldValue || "none"}</span>
                  <span className="text-muted-foreground">→</span>
                   <span className="px-1.5 py-0.5 rounded bg-success/10 text-success">{c.newValue??c.description}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function Toggle({label,value,set}:{label:string;value:boolean;set:(v:boolean)=>void}){return <div className="flex items-center justify-between rounded-md border p-3"><Label>{label}</Label><Switch checked={value} onCheckedChange={set}/></div>}

function HeadersEditor({programId}:{programId:string}){const {data}=useSuspenseQuery(q.rules(programId));const qc=useQueryClient();if(!data)return <p className="text-sm text-muted-foreground">No rules configured.</p>;return <Card><CardHeader className="flex-row items-center justify-between"><CardTitle>Required headers</CardTitle><Button variant="outline" size="sm" onClick={()=>api.saveRules({...data,headers:[...data.headers,{id:`h${Date.now()}`,name:"New-Header",value:"value",enabled:true}]}).then(()=>qc.invalidateQueries({queryKey:["rules",programId]}))}><Plus/>Add header</Button></CardHeader><CardContent><DataTable rows={data.headers} columns={[{key:"name",label:"Header",render:x=><span className="font-mono">{x.name}</span>},{key:"value",label:"Value",render:x=><span className="font-mono">{x.value}</span>},{key:"enabled",label:"Enabled",render:x=><StatusBadge value={x.enabled?"yes":"no"}/>},{key:"delete",label:"",render:x=><Button variant="ghost" size="sm" onClick={()=>api.saveRules({...data,headers:data.headers.filter(h=>h.id!==x.id)}).then(()=>qc.invalidateQueries({queryKey:["rules",programId]}))}>Delete</Button>}]} /></CardContent></Card>}

function SchedulesTable({programId}:{programId:string}){const {data}=useSuspenseQuery(q.schedules(programId));const qc=useQueryClient();return <Card><CardHeader><CardTitle>Recon schedules</CardTitle></CardHeader><CardContent><DataTable rows={data} columns={[{key:"job",label:"Job type",render:x=><span className="font-mono">{x.jobType}</span>},{key:"enabled",label:"Enabled",render:x=><Switch checked={x.enabled} onCheckedChange={enabled=>api.saveSchedule(x.id,{enabled}).then(()=>qc.invalidateQueries({queryKey:["schedules",programId]}))}/>},{key:"frequency",label:"Frequency",render:x=>x.frequency},{key:"time",label:"Time",render:x=><span className="font-mono">{x.time}</span>},{key:"last",label:"Last run",render:x=>x.lastRun},{key:"next",label:"Next run",render:x=>x.nextRun}]} /></CardContent></Card>}
