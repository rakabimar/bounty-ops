import { seedDb } from "./mock-data";
import { priorityFromScore } from "./bounty-types";
import { API_BASE_URL, API_MODE } from "./api-config";
import type { AppSettings, Asset, AssetStatus, ChecklistItem, DiscoveredEndpoint, EntityType, EvidenceRequest, IntakeInput, IntakePreview, InterestingRequest, MockDb, Note, NotificationSettings, Program, ReconJob, ResearchNote, Rules, ScannerFinding, ScannerFindingStatus, ScopeAsset, ScoringRule } from "./bounty-types";
import type { AuditFilters, AuditLogDto, AuthUser, CreateHeaderInput, CreateProgramInput, CreateScopeInput, ProgramDetailDto, ProgramDto, ProgramFilters, ProgramHeaderDto, ProgramRulesDto, ProgramScopeDto, UpdateHeaderInput, UpdateProgramInput, UpdateRulesInput, UpdateScopeInput } from "./api-types";

const DB_KEY = "bountyops.mock.db.v2";
const AUTH_KEY = "bountyops.auth";
const wait = () => new Promise((resolve) => setTimeout(resolve, 180));
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

function readDb(): MockDb {
  if (typeof window === "undefined") return clone(seedDb);
  const value = window.localStorage.getItem(DB_KEY);
  if (!value) { window.localStorage.setItem(DB_KEY, JSON.stringify(seedDb)); return clone(seedDb); }
  try { return JSON.parse(value) as MockDb; } catch { return clone(seedDb); }
}
function writeDb(db: MockDb) { if (typeof window !== "undefined") window.localStorage.setItem(DB_KEY, JSON.stringify(db)); }
async function mutate<T>(fn: (db: MockDb) => T) { await wait(); const db=readDb(); const result=fn(db); writeDb(db); return clone(result); }

export { API_MODE } from "./api-config";
export const endpoints = { login:"/auth/login",logout:"/auth/logout",me:"/me",programs:"/programs",program:"/programs/:id",intake:"/programs/:id/intake",sync:"/programs/:id/sync",archive:"/programs/:id/archive",scopes:"/programs/:id/scopes",rules:"/programs/:id/rules",jobs:"/programs/:id/jobs",jobLogs:"/jobs/:id/logs",assets:"/assets",asset:"/assets/:id",urls:"/urls",services:"/http-services",apiEndpoints:"/api-endpoints",jsFiles:"/js-files",scoring:"/scoring-rules",scoringPreview:"/scoring-rules/preview",settings:"/settings",tools:"/tools/health",telegram:"/notifications/test-telegram" } as const;

export class ApiError extends Error {
  constructor(public status:number,public code:string,message:string){super(message);this.name="ApiError";}
}

export async function request<T>(path:string, init:RequestInit={}):Promise<T> {
  let response:Response;
  try {
    response=await fetch(`${API_BASE_URL}${path}`,{
      ...init,
      credentials:"include",
      headers:{...(init.body?{"Content-Type":"application/json"}:{}),Accept:"application/json",...init.headers},
    });
  } catch {
    throw new ApiError(0,"NETWORK_ERROR",`Unable to reach the BountyOps API at ${API_BASE_URL}.`);
  }
  const text=await response.text();
  let body:unknown=undefined;
  if(text){try{body=JSON.parse(text)}catch{body=undefined;}}
  if(!response.ok){
    const error=(body&&typeof body==="object"&&"error" in body?(body as {error?:{code?:string;message?:string}}).error:undefined);
    const message=error?.message||(response.status>=500?"The BountyOps API could not complete the request.":`Request failed (${response.status}).`);
    if(response.status===401&&path!=="/me"&&path!=="/auth/login"&&typeof window!=="undefined"){
      window.location.assign(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
    }
    throw new ApiError(response.status,error?.code||"REQUEST_FAILED",message);
  }
  return body as T;
}

const mockUser:AuthUser={id:"mock-admin",email:"hunter@example.com",role:"admin"};
export const authStore = {
  isAuthenticated:()=>API_MODE==="mock"&&typeof window!=="undefined"&&window.localStorage.getItem(AUTH_KEY)==="true",
  login:async(email:string,password:string):Promise<AuthUser>=>{
    if(API_MODE==="http")return (await request<{user:AuthUser}>("/auth/login",{method:"POST",body:JSON.stringify({email,password})})).user;
    await wait();
    if(!email.includes("@")||password.length<6)throw new ApiError(401,"UNAUTHORIZED","Enter a valid email and a password of at least 6 characters.");
    window.localStorage.setItem(AUTH_KEY,"true");return {...mockUser,email};
  },
  me:async():Promise<AuthUser>=>{
    if(API_MODE==="http")return (await request<{user:AuthUser}>("/me")).user;
    await wait();if(!authStore.isAuthenticated())throw new ApiError(401,"UNAUTHORIZED","Authentication required");return mockUser;
  },
  logout:async()=>{
    if(API_MODE==="http")await request<{success:boolean}>("/auth/logout",{method:"POST"});
    else if(typeof window!=="undefined")window.localStorage.removeItem(AUTH_KEY);
  },
};

export const api = {
  mode:API_MODE,endpoints,
  dashboard:async(programId?:string)=>{await wait();const db=readDb();if(!programId||API_MODE==="http")return db;return {...db,programs:db.programs.filter(x=>x.id===programId),scopes:db.scopes.filter(x=>x.programId===programId),rules:db.rules.filter(x=>x.programId===programId),jobs:db.jobs.filter(x=>x.programId===programId),assets:db.assets.filter(x=>x.programId===programId),urls:db.urls.filter(x=>x.programId===programId),services:db.services.filter(x=>x.programId===programId),endpoints:db.endpoints.filter(x=>x.programId===programId),jsFiles:db.jsFiles.filter(x=>x.programId===programId),notes:db.notes.filter(x=>x.programId===programId),changes:db.changes.filter(x=>x.programId===programId)};},
  programs:async()=>{await wait();return readDb().programs;},
  program:async(id:string)=>{await wait();const db=readDb();return {program:db.programs.find(x=>x.id===id),scopes:db.scopes.filter(x=>x.programId===id),rules:db.rules.find(x=>x.programId===id),jobs:db.jobs.filter(x=>x.programId===id),assets:db.assets.filter(x=>x.programId===id),notes:db.notes.filter(x=>x.programId===id),changes:db.changes.filter(x=>x.programId===id),schedules:db.schedules.filter(x=>x.programId===id)};},
  intakePreview:async(input:IntakeInput):Promise<IntakePreview>=>{await wait();const host=input.programUrl?new URL(input.programUrl).hostname.replace("www.",""):input.apiHandle||"custom-program";const name=host.split(".")[0].replace(/[-_]/g," ").replace(/\b\w/g,c=>c.toUpperCase());return {name,platform:input.platform,url:input.programUrl,inScope:[`*.${host}`],outOfScope:[`status.${host}`],source:input.method,rawPolicyText:input.rawPolicyText,policyHash:`sha256:${btoa(input.rawPolicyText||host).slice(0,10)}`,confidence:input.method==="api"?98:input.method==="url_parser"?88:72,needsManualReview:input.method==="manual_paste",rules:{programId:"preview",automation:"limited",aggressive:false,rateLimit:5,concurrency:3,headers:[],forbidden:["DoS","Social engineering"],authTesting:"unknown",dosTesting:false,notes:"Parsed from intake source.",validated:false}};},
  approveIntake:(preview:IntakePreview,draft=false)=>mutate(db=>{const id=`p${Date.now()}`;const item:Program={id,name:preview.name,platform:preview.platform,status:draft?"paused":"active",hunting:draft?"not_hunting":"ongoing",scopeCount:preview.inScope.length+preview.outOfScope.length,schedules:0,lastSync:"Just now",lastRecon:"Never",url:preview.url,intakeSource:preview.source,rawPolicyText:preview.rawPolicyText,policyHash:preview.policyHash,lastSyncedAt:new Date().toISOString(),needsManualReview:preview.needsManualReview,confidence:preview.confidence,draft};db.programs.unshift(item);db.rules.push({...preview.rules,programId:id,validated:!draft&&!preview.needsManualReview});[...preview.inScope,...preview.outOfScope].forEach((asset,index)=>db.scopes.push({id:`s${Date.now()}${index}`,programId:id,asset,normalized:asset.replace("*.",""),type:asset.startsWith("*.")?"wildcard":"domain",scope:index<preview.inScope.length?"in_scope":"out_of_scope",bountyEligible:index<preview.inScope.length,notes:"Imported during intake"}));return item;}),
  updateProgram:(id:string,data:Partial<Program>)=>mutate(db=>Object.assign(db.programs.find(x=>x.id===id)??{},data)),
  scopes:async(programId?:string)=>{await wait();return readDb().scopes.filter(x=>!programId||x.programId===programId);},saveScope:(item:ScopeAsset)=>mutate(db=>{const i=db.scopes.findIndex(x=>x.id===item.id);if(i>=0)db.scopes[i]=item;else db.scopes.unshift(item);return item;}),deleteScope:(id:string)=>mutate(db=>{db.scopes=db.scopes.filter(x=>x.id!==id);return id;}),
  rules:async(programId:string)=>{await wait();return readDb().rules.find(x=>x.programId===programId);},saveRules:(rules:Rules)=>mutate(db=>{const i=db.rules.findIndex(x=>x.programId===rules.programId);if(i>=0)db.rules[i]=rules;else db.rules.push(rules);return rules;}),
  jobs:async(programId?:string)=>{await wait();return readDb().jobs.filter(x=>API_MODE==="http"||!programId||x.programId===programId);},runJob:(type:string,programId:string)=>mutate(db=>{const job:ReconJob={id:`j${Date.now()}`,type,programId,status:"queued",createdAt:"Just now",duration:"—",tool:type==="Full recon"?"pipeline":type.toLowerCase(),logs:["Job queued after policy validation"]};db.jobs.unshift(job);return job;}),cancelJob:(id:string)=>mutate(db=>{const job=db.jobs.find(x=>x.id===id);if(job)job.status="cancelled";return job;}),pipeline:async(programId:string)=>{await wait();return readDb().pipeline[programId]??[];},
  assets:async(programId?:string)=>{await wait();return readDb().assets.filter(x=>API_MODE==="http"||!programId||x.programId===programId);},updateAsset:(id:string,data:Partial<Asset>)=>mutate(db=>{const asset=db.assets.find(x=>x.id===id);if(asset){Object.assign(asset,data);asset.finalScore=asset.manualScore??asset.autoScore;}return asset;}),setAssetStatus:(id:string,status:AssetStatus)=>mutate(db=>{const asset=db.assets.find(x=>x.id===id);if(asset){asset.status=status;asset.lastReviewed="Just now";}return asset;}),
  urls:async(programId?:string)=>{await wait();return readDb().urls.filter(x=>API_MODE==="http"||!programId||x.programId===programId);},services:async(programId?:string)=>{await wait();return readDb().services.filter(x=>API_MODE==="http"||!programId||x.programId===programId);},apiEndpoints:async(programId?:string)=>{await wait();return readDb().endpoints.filter(x=>API_MODE==="http"||!programId||x.programId===programId);},jsFiles:async(programId?:string)=>{await wait();return readDb().jsFiles.filter(x=>API_MODE==="http"||!programId||x.programId===programId);},
  notes:async(programId?:string)=>{await wait();return readDb().notes.filter(x=>API_MODE==="http"||!programId||x.programId===programId);},addNote:(title:string,body:string,programId:string,assetId?:string,tags:string[]=[])=>mutate(db=>{const note:Note={id:`n${Date.now()}`,title,body,programId,assetId,tags,updatedAt:"Just now"};db.notes.unshift(note);return note;}),updateNote:(id:string,data:Partial<Note>)=>mutate(db=>{const note=db.notes.find(x=>x.id===id);if(note)Object.assign(note,data,{updatedAt:"Just now"});return note;}),deleteNote:(id:string)=>mutate(db=>{db.notes=db.notes.filter(x=>x.id!==id);return id;}),
  changes:async(programId?:string)=>{await wait();return readDb().changes.filter(x=>API_MODE==="http"||!programId||x.programId===programId);},schedules:async(programId:string)=>{await wait();return readDb().schedules.filter(x=>x.programId===programId);},saveSchedule:(id:string,data:Record<string,unknown>)=>mutate(db=>{const item=db.schedules.find(x=>x.id===id);if(item)Object.assign(item,data);return item;}),
  nucleiFindings:async(assetId:string)=>{await wait();return readDb().nucleiFindings.filter(x=>x.assetId===assetId);},interestingRequests:async(assetId:string)=>{await wait();return readDb().interestingRequests.filter(x=>x.assetId===assetId);},addInterestingRequest:(item:Omit<InterestingRequest,"id">)=>mutate(db=>{const saved={...item,id:`ir${Date.now()}`};db.interestingRequests.push(saved);return saved;}),
  tools:async()=>{await wait();const db=readDb();return {tools:db.tools,workerHealth:db.workerHealth};},scoring:async()=>{await wait();return readDb().scoring;},saveScoring:(rules:ScoringRule[])=>mutate(db=>{db.scoring=rules;return rules;}),notifications:async()=>{await wait();return readDb().notifications;},saveNotifications:(value:NotificationSettings)=>mutate(db=>{db.notifications=value;return value;}),testTelegram:async()=>{await wait();return {ok:true,message:"Test notification delivered"};},settings:async()=>{await wait();return readDb().settings;},saveSettings:(value:AppSettings)=>mutate(db=>{db.settings=value;return value;}),checklist:async(id:string)=>{await wait();return readDb().checklist[id]??[];},saveChecklist:(id:string,items:string[])=>mutate(db=>{db.checklist[id]=items;return items;}),reset:()=>{if(typeof window!=="undefined")window.localStorage.setItem(DB_KEY,JSON.stringify(seedDb));},

  // ============ Detail / entity APIs ============
  assetDetail: async (assetId: string) => {
    await wait();
    const db = readDb();
    const asset = db.assets.find(x => x.id === assetId);
    if (!asset) return null;
    return {
      asset,
      program: db.programs.find(p => p.id === asset.programId),
      urls: db.urls.filter(x => x.assetId === assetId),
      endpoints: db.discoveredEndpoints.filter(x => x.assetId === assetId),
      legacyEndpoints: db.endpoints.filter(x => x.assetId === assetId),
      findings: db.scannerFindings.filter(x => x.assetId === assetId),
      services: db.services.filter(x => x.assetId === assetId),
      jsFiles: db.jsFiles.filter(x => x.assetId === assetId),
      ports: db.portRecords[assetId] ?? [],
      dns: db.dnsRecords[assetId] ?? [],
      changes: db.entityChanges.filter(c => c.entityType === "asset" && c.entityId === assetId),
      notes: db.researchNotes.filter(n => n.entityType === "asset" && n.entityId === assetId),
      evidenceRequests: db.evidenceRequests.filter(r => r.entityType === "asset" && r.entityId === assetId),
    };
  },
  urlDetail: async (urlId: string) => {
    await wait();
    const db = readDb();
    const url = db.urls.find(x => x.id === urlId);
    if (!url) return null;
    return {
      url,
      asset: db.assets.find(a => a.id === url.assetId),
      program: db.programs.find(p => p.id === url.programId),
      endpoints: db.discoveredEndpoints.filter(x => x.urlId === urlId),
      findings: db.scannerFindings.filter(x => x.urlId === urlId),
      jsFiles: db.jsFiles.filter(x => x.assetId === url.assetId),
      changes: db.entityChanges.filter(c => c.entityType === "url" && c.entityId === urlId),
      notes: db.researchNotes.filter(n => n.entityType === "url" && n.entityId === urlId),
      evidenceRequests: db.evidenceRequests.filter(r => r.entityType === "url" && r.entityId === urlId),
    };
  },
  endpointDetail: async (endpointId: string) => {
    await wait();
    const db = readDb();
    const endpoint = db.discoveredEndpoints.find(x => x.id === endpointId);
    if (!endpoint) return null;
    return {
      endpoint,
      asset: db.assets.find(a => a.id === endpoint.assetId),
      program: db.programs.find(p => p.id === endpoint.programId),
      url: endpoint.urlId ? db.urls.find(u => u.id === endpoint.urlId) : undefined,
      findings: db.scannerFindings.filter(x => x.endpointId === endpointId),
      changes: db.entityChanges.filter(c => c.entityType === "endpoint" && c.entityId === endpointId),
      notes: db.researchNotes.filter(n => n.entityType === "endpoint" && n.entityId === endpointId),
      evidenceRequests: db.evidenceRequests.filter(r => r.entityType === "endpoint" && r.entityId === endpointId),
    };
  },
  findingDetail: async (findingId: string) => {
    await wait();
    const db = readDb();
    const finding = db.scannerFindings.find(x => x.id === findingId);
    if (!finding) return null;
    return {
      finding,
      asset: db.assets.find(a => a.id === finding.assetId),
      program: db.programs.find(p => p.id === finding.programId),
      url: finding.urlId ? db.urls.find(u => u.id === finding.urlId) : undefined,
      endpoint: finding.endpointId ? db.discoveredEndpoints.find(e => e.id === finding.endpointId) : undefined,
      changes: db.entityChanges.filter(c => c.entityType === "scanner_finding" && c.entityId === findingId),
      notes: db.researchNotes.filter(n => n.entityType === "scanner_finding" && n.entityId === findingId),
      evidenceRequests: db.evidenceRequests.filter(r => r.entityType === "scanner_finding" && r.entityId === findingId),
    };
  },

  updateAssetManualScore: (id: string, manualScore: number | null) => mutate(db => {
    const a = db.assets.find(x => x.id === id);
    if (a) { a.manualScore = manualScore; a.finalScore = manualScore ?? a.autoScore; }
    return a;
  }),
  updateEndpointStatus: (id: string, status: AssetStatus) => mutate(db => {
    const e = db.discoveredEndpoints.find(x => x.id === id);
    if (e) e.status = status;
    return e;
  }),
  updateEndpointManualScore: (id: string, manualScore: number | null) => mutate(db => {
    const e = db.discoveredEndpoints.find(x => x.id === id);
    if (e) { e.manualScore = manualScore; e.finalScore = manualScore ?? e.autoScore; e.priority = priorityFromScore(e.finalScore); }
    return e;
  }),
  updateFindingStatus: (id: string, status: ScannerFindingStatus) => mutate(db => {
    const f = db.scannerFindings.find(x => x.id === id);
    if (f) f.status = status;
    return f;
  }),

  entityNotes: async (entityType: EntityType, entityId: string) => {
    await wait();
    return readDb().researchNotes.filter(n => n.entityType === entityType && n.entityId === entityId);
  },
  addEntityNote: (note: Omit<ResearchNote, "id" | "createdAt" | "updatedAt">) => mutate(db => {
    const saved: ResearchNote = { ...note, id: `rn${Date.now()}`, createdAt: "Just now", updatedAt: "Just now" };
    db.researchNotes.unshift(saved);
    return saved;
  }),
  updateEntityNote: (id: string, data: Partial<ResearchNote>) => mutate(db => {
    const n = db.researchNotes.find(x => x.id === id);
    if (n) Object.assign(n, data, { updatedAt: "Just now" });
    return n;
  }),
  deleteEntityNote: (id: string) => mutate(db => {
    db.researchNotes = db.researchNotes.filter(n => n.id !== id);
    return id;
  }),

  entityChecklist: async (entityType: "asset" | "url" | "endpoint", entityId: string) => {
    await wait();
    return readDb().checklistItems.filter(x => x.entityType === entityType && x.entityId === entityId);
  },
  generateEntityChecklist: (entityType: "asset" | "url" | "endpoint", entityId: string, programId: string, categories: string[]) => mutate(db => {
    const existing = db.checklistItems.filter(x => x.entityType === entityType && x.entityId === entityId);
    if (existing.length > 0) return existing;
    const templates: Record<string, { title: string; description: string }[]> = {
      api: [
        { title: "Check BOLA / IDOR", description: "Test object access across two accounts." },
        { title: "Test mass assignment", description: "Try injecting extra fields like role, isAdmin." },
        { title: "Test method override", description: "Try X-HTTP-Method-Override header." },
        { title: "Check hidden endpoints", description: "Enumerate via wordlists and JS extraction." },
        { title: "Check pagination/filter leakage", description: "Look for unauthorized rows returned." },
        { title: "Check object ownership", description: "Verify ownership checks across endpoints." },
      ],
      graphql: [
        { title: "Check introspection", description: "Disabled in production?" },
        { title: "Check query batching", description: "Test batched queries / aliasing." },
        { title: "Check mutation authorization", description: "Test mutations across roles." },
        { title: "Check object-level authorization", description: "Verify per-resolver auth." },
        { title: "Check schema leakage", description: "Look for typed error message leaks." },
      ],
      login: [
        { title: "Check login/logout", description: "Verify session lifecycle." },
        { title: "Check password reset", description: "Token reuse, expiry, predictability." },
        { title: "Check session expiration", description: "Idle and absolute timeouts." },
        { title: "Check MFA/SSO", description: "Bypass tests, account linking." },
        { title: "Check CSRF on account changes", description: "Token presence on sensitive forms." },
        { title: "Check rate limiting safely per ROE", description: "Respect program limits." },
      ],
      auth: [
        { title: "Check auth logic", description: "Token issuance, refresh, revocation." },
        { title: "Check rate limiting safely per ROE", description: "Respect program limits." },
        { title: "Check account enumeration", description: "Compare error messages." },
        { title: "Check session behavior", description: "Cookies, flags, fixation." },
      ],
      upload: [
        { title: "Check file type validation", description: "Magic byte vs extension." },
        { title: "Check content-type mismatch", description: "Polyglot files." },
        { title: "Check filename/path traversal", description: "Try ../ patterns." },
        { title: "Check public file access", description: "Bucket / object ACLs." },
        { title: "Check metadata leakage", description: "EXIF, internal paths." },
      ],
      admin: [
        { title: "Check role bypass", description: "Parameter / header tampering." },
        { title: "Check horizontal access", description: "Across same role." },
        { title: "Check vertical access", description: "Across privilege levels." },
        { title: "Check exposed internal functionality", description: "Debug routes, dev tools." },
      ],
      billing: [
        { title: "Check invoice access", description: "Cross-account invoices." },
        { title: "Check plan changes", description: "Tampering, downgrade abuse." },
        { title: "Check coupon abuse", description: "Stacking, reuse." },
        { title: "Check race condition candidates", description: "Refund / credit endpoints." },
        { title: "Check authorization on billing endpoints", description: "Per-account checks." },
      ],
    };
    const items: ChecklistItem[] = [];
    const seen = new Set<string>();
    for (const cat of categories) {
      for (const t of templates[cat] ?? []) {
        if (seen.has(t.title)) continue;
        seen.add(t.title);
        items.push({ id: `cl${Date.now()}${items.length}`, programId, entityType, entityId, category: cat, title: t.title, description: t.description, status: "todo", isCustom: false, updatedAt: "Just now" });
      }
    }
    db.checklistItems.push(...items);
    return items;
  }),
  updateChecklistItem: (id: string, updates: Partial<ChecklistItem>) => mutate(db => {
    const item = db.checklistItems.find(x => x.id === id);
    if (item) Object.assign(item, updates, { updatedAt: "Just now" });
    return item;
  }),
  addCustomChecklistItem: (entityType: "asset" | "url" | "endpoint", entityId: string, programId: string, title: string) => mutate(db => {
    const item: ChecklistItem = { id: `cl${Date.now()}`, programId, entityType, entityId, category: "custom", title, status: "todo", isCustom: true, updatedAt: "Just now" };
    db.checklistItems.push(item);
    return item;
  }),
  deleteChecklistItem: (id: string) => mutate(db => {
    db.checklistItems = db.checklistItems.filter(x => x.id !== id);
    return id;
  }),

  entityRequests: async (entityType: EntityType, entityId: string) => {
    await wait();
    return readDb().evidenceRequests.filter(r => r.entityType === entityType && r.entityId === entityId);
  },
  addEntityRequest: (request: Omit<EvidenceRequest, "id" | "createdAt">) => mutate(db => {
    const saved: EvidenceRequest = { ...request, id: `er${Date.now()}`, createdAt: "Just now" };
    db.evidenceRequests.push(saved);
    return saved;
  }),
  updateEntityRequest: (id: string, data: Partial<EvidenceRequest>) => mutate(db => {
    const r = db.evidenceRequests.find(x => x.id === id);
    if (r) Object.assign(r, data, { updatedAt: "Just now" });
    return r;
  }),
  deleteEntityRequest: (id: string) => mutate(db => {
    db.evidenceRequests = db.evidenceRequests.filter(r => r.id !== id);
    return id;
  }),

  scannerFindings: async (programId?: string) => {
    await wait();
    return readDb().scannerFindings.filter(x => !programId || x.programId === programId);
  },
  discoveredEndpoints: async (programId?: string) => {
    await wait();
    return readDb().discoveredEndpoints.filter(x => !programId || x.programId === programId);
  },
};

const qs=(values:Record<string,string|number|undefined>)=>{const search=new URLSearchParams();for(const [key,value] of Object.entries(values)){if(value!==undefined&&value!=="")search.set(key,String(value));}const value=search.toString();return value?`?${value}`:"";};
const now=()=>new Date().toISOString();
const platformToApi=(value:Program["platform"]):ProgramDto["platform"]=>({HackerOne:"hackerone",Bugcrowd:"bugcrowd",YesWeHack:"yeswehack",Custom:"custom"} as const)[value];
const platformFromApi=(value:ProgramDto["platform"]):Program["platform"]=>({hackerone:"HackerOne",bugcrowd:"Bugcrowd",yeswehack:"YesWeHack",custom:"Custom"} as const)[value];
const mockProgramDto=(program:Program):ProgramDto=>({id:program.id,platform:platformToApi(program.platform),name:program.name,handle:null,programUrl:program.url||null,status:program.status,huntingStatus:program.hunting==="ongoing"?"ongoing":"not_hunting",intakeSource:program.intakeSource,rawPolicyText:program.rawPolicyText||null,policyHash:program.policyHash||null,lastSyncedAt:program.lastSyncedAt||null,createdAt:program.lastSyncedAt||now(),updatedAt:program.lastSyncedAt||now(),scopesCount:program.scopeCount,headersCount:readDb().rules.find(x=>x.programId===program.id)?.headers.length??0,hasRules:Boolean(readDb().rules.find(x=>x.programId===program.id))});
const mockScopeDto=(scope:ScopeAsset):ProgramScopeDto=>({id:scope.id,programId:scope.programId,asset:scope.asset,normalizedAsset:scope.normalized,assetType:scope.type==="wildcard"?"wildcard_domain":scope.type,isInScope:scope.scope==="in_scope",bountyEligible:scope.bountyEligible,notes:scope.notes||null,createdAt:now(),updatedAt:now()});
const mockRulesDto=(rules:Rules):ProgramRulesDto=>({id:`rules-${rules.programId}`,programId:rules.programId,automationAllowed:rules.automation,aggressiveAllowed:rules.aggressive,rateLimitRps:rules.rateLimit||null,maxConcurrency:rules.concurrency||null,forbiddenActions:rules.forbidden,authTestingAllowed:rules.authTesting==="yes",dosTestingAllowed:rules.dosTesting,notes:rules.notes||null,createdAt:now(),updatedAt:now()});
const mockHeaderDto=(programId:string,header:Rules["headers"][number]):ProgramHeaderDto=>({id:header.id,programId,name:header.name,value:header.value,isRequired:header.enabled,createdAt:now(),updatedAt:now()});

export const coreApi={
  login:(email:string,password:string)=>authStore.login(email,password),
  logout:()=>authStore.logout(),
  me:()=>authStore.me(),
  getPrograms:async(filters:ProgramFilters={}):Promise<ProgramDto[]>=>API_MODE==="http"?request(`/programs${qs({...filters})}`):api.programs().then(items=>items.map(mockProgramDto)),
  createProgram:async(input:CreateProgramInput):Promise<ProgramDto>=>{
    if(API_MODE==="http")return request("/programs",{method:"POST",body:JSON.stringify(input)});
    return mutate(db=>{const id=`p${Date.now()}`;const timestamp=now();const program:Program={id,name:input.name,platform:platformFromApi(input.platform),status:input.status??"active",hunting:input.huntingStatus??"ongoing",scopeCount:0,schedules:0,lastSync:"Never",lastRecon:"Never",url:input.programUrl??"",intakeSource:"manual_paste",rawPolicyText:input.rawPolicyText??"",policyHash:"",lastSyncedAt:timestamp,needsManualReview:false,confidence:100};db.programs.unshift(program);db.rules.push({programId:id,automation:"unknown",aggressive:false,rateLimit:0,concurrency:0,headers:[],forbidden:[],authTesting:"no",dosTesting:false,notes:"",validated:true});return mockProgramDto(program);});
  },
  getProgram:async(id:string):Promise<ProgramDetailDto>=>{
    if(API_MODE==="http")return request(`/programs/${id}`);
    await wait();const db=readDb();const program=db.programs.find(x=>x.id===id);if(!program)throw new ApiError(404,"NOT_FOUND","Program not found");const rules=db.rules.find(x=>x.programId===id);return {...mockProgramDto(program),scopes:db.scopes.filter(x=>x.programId===id).map(mockScopeDto),rules:rules?mockRulesDto(rules):null,headers:(rules?.headers??[]).map(x=>mockHeaderDto(id,x))};
  },
  updateProgram:async(id:string,input:UpdateProgramInput):Promise<ProgramDto>=>{
    if(API_MODE==="http")return request(`/programs/${id}`,{method:"PATCH",body:JSON.stringify(input)});
    return mutate(db=>{const program=db.programs.find(x=>x.id===id);if(!program)throw new ApiError(404,"NOT_FOUND","Program not found");if(input.name!==undefined)program.name=input.name;if(input.programUrl!==undefined)program.url=input.programUrl;if(input.status!==undefined)program.status=input.status;if(input.huntingStatus!==undefined)program.hunting=input.huntingStatus;return mockProgramDto(program);});
  },
  archiveProgram:async(id:string):Promise<ProgramDto>=>API_MODE==="http"?request(`/programs/${id}`,{method:"DELETE"}):coreApi.updateProgram(id,{status:"archived",huntingStatus:"not_hunting"}),
  getProgramScopes:async(id:string):Promise<ProgramScopeDto[]>=>API_MODE==="http"?request(`/programs/${id}/scopes`):api.scopes(id).then(items=>items.map(mockScopeDto)),
  createProgramScope:async(programId:string,input:CreateScopeInput):Promise<ProgramScopeDto>=>{
    if(API_MODE==="http")return request(`/programs/${programId}/scopes`,{method:"POST",body:JSON.stringify(input)});
    const item:ScopeAsset={id:`s${Date.now()}`,programId,asset:input.asset,normalized:input.asset.trim().toLowerCase().replace(/\/$/,""),type:input.assetType==="wildcard_domain"?"wildcard":input.assetType==="subdomain"||input.assetType==="api"||input.assetType==="other"?"domain":input.assetType,scope:input.isInScope?"in_scope":"out_of_scope",bountyEligible:input.bountyEligible,notes:input.notes??""};return mockScopeDto(await api.saveScope(item));
  },
  updateProgramScope:async(programId:string,scopeId:string,input:UpdateScopeInput):Promise<ProgramScopeDto>=>{
    if(API_MODE==="http")return request(`/programs/${programId}/scopes/${scopeId}`,{method:"PATCH",body:JSON.stringify(input)});
    const current=readDb().scopes.find(x=>x.id===scopeId);if(!current)throw new ApiError(404,"NOT_FOUND","Scope not found");const next={...current,asset:input.asset??current.asset,normalized:input.asset?.trim().toLowerCase().replace(/\/$/,"")??current.normalized,type:input.assetType==="wildcard_domain"?"wildcard":current.type,scope:input.isInScope===undefined?current.scope:input.isInScope?"in_scope":"out_of_scope",bountyEligible:input.bountyEligible??current.bountyEligible,notes:input.notes??current.notes};return mockScopeDto(await api.saveScope(next));
  },
  deleteProgramScope:async(programId:string,scopeId:string):Promise<{success:boolean}>=>{if(API_MODE==="http")return request(`/programs/${programId}/scopes/${scopeId}`,{method:"DELETE"});await api.deleteScope(scopeId);return {success:true};},
  getProgramRules:async(id:string):Promise<ProgramRulesDto>=>{if(API_MODE==="http")return request(`/programs/${id}/rules`);const rules=await api.rules(id);if(!rules)throw new ApiError(404,"NOT_FOUND","Rules not found");return mockRulesDto(rules);},
  updateProgramRules:async(id:string,input:UpdateRulesInput):Promise<ProgramRulesDto>=>{if(API_MODE==="http")return request(`/programs/${id}/rules`,{method:"PUT",body:JSON.stringify(input)});const current=readDb().rules.find(x=>x.programId===id);const rules:Rules={programId:id,automation:input.automationAllowed,aggressive:input.aggressiveAllowed,rateLimit:input.rateLimitRps??0,concurrency:input.maxConcurrency??0,headers:current?.headers??[],forbidden:input.forbiddenActions??[],authTesting:input.authTestingAllowed?"yes":"no",dosTesting:input.dosTestingAllowed,notes:input.notes??"",validated:true};return mockRulesDto(await api.saveRules(rules));},
  getProgramHeaders:async(id:string):Promise<ProgramHeaderDto[]>=>{if(API_MODE==="http")return request(`/programs/${id}/headers`);const rules=await api.rules(id);return (rules?.headers??[]).map(x=>mockHeaderDto(id,x));},
  createProgramHeader:async(id:string,input:CreateHeaderInput):Promise<ProgramHeaderDto>=>{if(API_MODE==="http")return request(`/programs/${id}/headers`,{method:"POST",body:JSON.stringify(input)});const rules=await api.rules(id);if(!rules)throw new ApiError(404,"NOT_FOUND","Rules not found");const header={id:`h${Date.now()}`,name:input.name,value:input.value,enabled:input.isRequired};await api.saveRules({...rules,headers:[...rules.headers,header]});return mockHeaderDto(id,header);},
  updateProgramHeader:async(id:string,headerId:string,input:UpdateHeaderInput):Promise<ProgramHeaderDto>=>{if(API_MODE==="http")return request(`/programs/${id}/headers/${headerId}`,{method:"PATCH",body:JSON.stringify(input)});const rules=await api.rules(id);const header=rules?.headers.find(x=>x.id===headerId);if(!rules||!header)throw new ApiError(404,"NOT_FOUND","Header not found");Object.assign(header,{name:input.name??header.name,value:input.value??header.value,enabled:input.isRequired??header.enabled});await api.saveRules(rules);return mockHeaderDto(id,header);},
  deleteProgramHeader:async(id:string,headerId:string):Promise<{success:boolean}>=>{if(API_MODE==="http")return request(`/programs/${id}/headers/${headerId}`,{method:"DELETE"});const rules=await api.rules(id);if(rules)await api.saveRules({...rules,headers:rules.headers.filter(x=>x.id!==headerId)});return {success:true};},
  getSettings:async():Promise<Record<string,unknown>>=>{if(API_MODE==="http")return request("/settings");const [settings,notifications]=await Promise.all([api.settings(),api.notifications()]);return {"ai.enabled":true,"ai.monthlyLimit":200,"gemini.model":"gemini-2.5-flash-lite","telegram.enabled":true,"telegram.botToken":notifications.token,"telegram.chatId":notifications.chatId,"default.rateLimitRps":settings.defaultRps,"default.maxConcurrency":settings.maxConcurrency,"artifact.retentionDays":30};},
  updateSetting:async(key:string,value:unknown):Promise<{key:string;value:unknown}>=>{if(API_MODE==="http")return request(`/settings/${encodeURIComponent(key)}`,{method:"PUT",body:JSON.stringify({value})});const settings=await api.settings();const notifications=await api.notifications();if(key==="default.rateLimitRps")await api.saveSettings({...settings,defaultRps:Number(value)});else if(key==="default.maxConcurrency")await api.saveSettings({...settings,maxConcurrency:Number(value)});else if(key==="telegram.botToken")await api.saveNotifications({...notifications,token:String(value)});else if(key==="telegram.chatId")await api.saveNotifications({...notifications,chatId:String(value)});return {key,value};},
  testTelegramNotification:async():Promise<{success:boolean}>=>API_MODE==="http"?request("/notifications/test-telegram",{method:"POST"}):api.testTelegram().then(()=>({success:true})),
  getAuditLogs:async(filters:AuditFilters={}):Promise<AuditLogDto[]>=>API_MODE==="http"?request(`/audit-logs${qs({...filters})}`):[],
};
