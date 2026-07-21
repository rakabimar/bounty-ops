import { createFileRoute,useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Bot,LockKeyhole } from "lucide-react";
import { API_MODE,authStore } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route=createFileRoute("/login")({ssr:false,head:()=>({meta:[{title:"Sign in — BountyOps"},{name:"description",content:"Sign in to your private bug bounty operations dashboard."}]}),component:Login});

function Login(){
  const nav=useNavigate();
  const mock=API_MODE==="mock";
  const [email,setEmail]=useState(mock?"hunter@example.com":"");
  const [password,setPassword]=useState(mock?"bountyops":"");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");try{await authStore.login(email,password);nav({to:"/"})}catch(error){setError(error instanceof Error?error.message:"Login failed")}finally{setBusy(false)}}
  return <main className="grid min-h-screen lg:grid-cols-[1.2fr_1fr]"><section className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-md bg-primary"><Bot/></div><b className="font-display text-xl">BountyOps</b></div><div><p className="font-mono text-xs tracking-[.24em] text-primary">PERSONAL RECON CONTROL</p><h1 className="mt-5 max-w-2xl font-display text-5xl font-semibold leading-tight">Turn attack surface noise into a focused review queue.</h1><p className="mt-5 max-w-xl text-sidebar-foreground/60">Program intake, scope-safe automation, scoring, and manual validation in one operations workspace.</p></div>{mock&&<p className="font-mono text-[10px] text-sidebar-foreground/40">MOCK API MODE · LOCAL PERSISTENCE ENABLED</p>}</section><section className="grid place-items-center p-6"><form onSubmit={submit} className="w-full max-w-sm space-y-5"><div className="grid size-11 place-items-center rounded-md bg-primary text-primary-foreground"><LockKeyhole/></div><div><h2 className="font-display text-3xl font-semibold">Welcome back</h2><p className="mt-1 text-sm text-muted-foreground">Sign in to your private operations console.</p></div><div><Label>Email</Label><Input className="mt-2" type="email" value={email} onChange={e=>setEmail(e.target.value)}/></div><div><Label>Password</Label><Input className="mt-2" type="password" value={password} onChange={e=>setPassword(e.target.value)}/></div>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<Button className="w-full" disabled={busy}>{busy?"Signing in…":"Sign in"}</Button>{mock&&<p className="text-center text-xs text-muted-foreground">Mock credentials are prefilled.</p>}</form></section></main>;
}