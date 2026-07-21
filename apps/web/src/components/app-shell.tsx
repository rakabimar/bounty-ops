import { Link,useNavigate,useRouterState } from "@tanstack/react-router";
import { useQueryClient,useSuspenseQuery } from "@tanstack/react-query";
import { Activity,Bell,BookOpen,Bot,Boxes,Braces,ChevronDown,CircleGauge,Code2,FileText,Globe2,History,ListChecks,LogOut,Network,Radar,Settings,ShieldCheck,SlidersHorizontal,StickyNote,SunMoon,Wrench } from "lucide-react";
import { useEffect,type ReactNode } from "react";
import { Sidebar,SidebarContent,SidebarFooter,SidebarGroup,SidebarGroupContent,SidebarGroupLabel,SidebarHeader,SidebarInset,SidebarMenu,SidebarMenuButton,SidebarMenuItem,SidebarProvider,SidebarTrigger,useSidebar } from "@/components/ui/sidebar";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import { DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuLabel,DropdownMenuSeparator,DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./status-badge";
import { coreQ } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { ProgramProvider,useSelectedProgram } from "./program-context";

const groups=[
  {label:"COMMAND",items:[["/","Overview",CircleGauge],["/programs","Programs",ShieldCheck],["/scope","Scope manager",Network],["/rules","Rules of engagement",BookOpen]]},
  {label:"RECON",items:[["/jobs","Recon jobs",Radar],["/assets","Asset inventory",Boxes],["/live-hosts","Live hosts",Globe2],["/urls","URLs / Pages",FileText],["/api-endpoints","API endpoints",Braces],["/js-files","JS files & secrets",Code2]]},
  {label:"TRIAGE",items:[["/review","Review queue",ListChecks],["/notes","Notes",StickyNote]]},
  {label:"SYSTEM",items:[["/scoring","Scoring rules",SlidersHorizontal],["/notifications","Notifications",Bell],["/audit-logs","Audit logs",History],["/tools","Tool health",Wrench],["/settings","App settings",Settings]]},
] as const;

function Nav(){const path=useRouterState({select:state=>state.location.pathname});const {state}=useSidebar();return <Sidebar collapsible="icon"><SidebarHeader className="h-16 justify-center border-b border-sidebar-border px-3"><Link to="/" className="flex min-w-0 items-center gap-3"><div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"><Bot className="size-4"/></div>{state!=="collapsed"&&<div className="min-w-0"><div className="font-display text-base font-bold tracking-tight">BountyOps</div><div className="font-mono text-[8px] tracking-[.2em] text-sidebar-foreground/50">RECON CONTROL</div></div>}</Link></SidebarHeader><SidebarContent>{groups.map(group=><SidebarGroup key={group.label}><SidebarGroupLabel>{group.label}</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{group.items.map(([url,label,Icon])=><SidebarMenuItem key={label}><SidebarMenuButton asChild isActive={url==="/"?path==="/":path.startsWith(url)} tooltip={label}><Link to={url as "/"} className="gap-3"><Icon/><span>{label}</span></Link></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup>)}</SidebarContent><SidebarFooter className="border-t border-sidebar-border p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-2 rounded-full bg-success shadow-[0_0_8px_var(--success)]"/>{state!=="collapsed"&&"Local services configured"}</div></SidebarFooter></Sidebar>}

function ShellContent({children}:{children:ReactNode}){
  const {data:programs}=useSuspenseQuery(coreQ.programs());
  const {selectedProgramId,setSelectedProgramId}=useSelectedProgram();
  const auth=useAuth();const queryClient=useQueryClient();const navigate=useNavigate();
  useEffect(()=>{if(selectedProgramId&&!programs.some(program=>program.id===selectedProgramId&&program.status!=="archived"))setSelectedProgramId(undefined)},[programs,selectedProgramId,setSelectedProgramId]);
  const logout=async()=>{await queryClient.cancelQueries();await auth.logout();queryClient.clear();await navigate({to:"/login",replace:true});};
  const initials=(auth.user?.email.slice(0,2)||"BO").toUpperCase();
  return <SidebarProvider><Nav/><SidebarInset className="min-w-0"><header className="sticky top-0 z-30 grid h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b bg-background/90 px-3 backdrop-blur-xl sm:px-5"><SidebarTrigger/><div className="flex min-w-0 items-center gap-3"><Select value={selectedProgramId??"all"} onValueChange={value=>setSelectedProgramId(value==="all"?undefined:value)}><SelectTrigger className="max-w-64 border-0 bg-secondary shadow-none"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All programs</SelectItem>{programs.filter(program=>program.status!=="archived").map(program=><SelectItem key={program.id} value={program.id}>{program.name}</SelectItem>)}</SelectContent></Select><div className="hidden items-center gap-2 border-l pl-3 lg:flex"><Activity className="size-4 text-info"/><span className="text-xs text-muted-foreground">Core API</span><StatusBadge value="connected"/></div></div><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="gap-2 px-2"><div className="grid size-7 place-items-center rounded-full bg-secondary font-mono text-xs">{initials}</div><ChevronDown className="size-3"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel><span className="block">Authenticated operator</span><span className="block max-w-56 truncate text-xs font-normal text-muted-foreground">{auth.user?.email}</span></DropdownMenuLabel><DropdownMenuSeparator/><DropdownMenuItem onClick={()=>document.documentElement.classList.toggle("dark")}><SunMoon/>Toggle theme</DropdownMenuItem><DropdownMenuItem disabled={auth.logoutPending} onClick={logout}><LogOut/>Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu></header><main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-7">{children}</main></SidebarInset></SidebarProvider>;
}

export function AppShell({children}:{children:ReactNode}){return <ProgramProvider><ShellContent>{children}</ShellContent></ProgramProvider>}
