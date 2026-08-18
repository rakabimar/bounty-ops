const allowDeepSeek = process.env.BOUNTYOPS_SMOKE_DEEPSEEK_ALLOW_SEND === "1";
const allowPlatform = process.env.BOUNTYOPS_SMOKE_INTAKE_ALLOW_NETWORK === "1";
process.env.BOUNTYOPS_AI_TRANSPORT = allowDeepSeek ? "deepseek" : "mock";
process.env.NOTIFICATION_DISPATCH_INTERVAL_MS = "3600000";

const fs = await import("node:fs/promises"); const { fileURLToPath } = await import("node:url");
const [{ buildApp }, adaptersModule, sourceModule, intakeModule, aiModule, shared] = await Promise.all([
  import("../src/app.js"), import("../src/modules/program-intake/adapters/platform.adapters.js"), import("../src/modules/program-intake/source-document.service.js"), import("../src/modules/program-intake/program-intake.service.js"), import("../src/modules/ai/deepseek.service.js"), import("@bountyops/shared"),
]);
const { HackerOneIntakeAdapter, BugcrowdIntakeAdapter, YesWeHackIntakeAdapter, ManualTextIntakeAdapter } = adaptersModule;
const { normalizeSourceHtml, pastedTextDocument, fetchPlatformSource } = sourceModule;
const { createProgramIntakePreview } = intakeModule; const { MockAiProvider, DeepSeekAiProvider, resolveAiConfig } = aiModule;
const expectStatus = (actual: number, expected: number, label: string) => { if (actual !== expected) throw new Error(`${label}: expected HTTP ${expected}, got ${actual}`); };
const assert = (condition: unknown, message: string): asserts condition => { if (!condition) throw new Error(message); };
const fixture = async (name: string) => fs.readFile(fileURLToPath(new URL(`./fixtures/phase13/${name}`, import.meta.url)), "utf8");

async function main() {
  if (!allowDeepSeek && process.env.BOUNTYOPS_AI_TRANSPORT !== "mock") throw new Error("Default Phase 13 smoke requires mock AI transport");
  if (allowPlatform && !process.env.BOUNTYOPS_SMOKE_INTAKE_URL) throw new Error("Platform network opt-in requires BOUNTYOPS_SMOKE_INTAKE_URL");
  const app = await buildApp(); const runIds: string[] = []; const programIds: string[] = []; const smokeStarted = new Date();
  const settingKeys = ["ai.enabled", "ai.monthlyLimit", "ai.intakeFallbackThreshold", "deepseek.apiKey"];
  const originalSettings = await app.prisma.appSetting.findMany({ where: { key: { in: settingKeys } } });
  try {
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } }); expectStatus(login.statusCode, 200, "login"); const cookie = login.headers["set-cookie"]?.split(";")[0]; assert(cookie, "Missing session cookie"); const headers = { cookie };
    const adapterCases = [[new HackerOneIntakeAdapter(), "hackerone.html", "*.h1-acme.test", false], [new BugcrowdIntakeAdapter(), "bugcrowd.html", "api.bugcrowd-acme.test", false], [new YesWeHackIntakeAdapter(), "yeswehack.html", "https://api.ywh-acme.test/v1", false]] as const;
    for (const [adapter, file, expectedAsset] of adapterCases) { const html = await fixture(file); const normalized = normalizeSourceHtml(html); const parsed = await adapter.parse({ platform: adapter.platform, sourceType: "pasted_text", title: normalized.title, rawText: normalized.rawText, contentHash: "fixture" }); assert(parsed.structuredData.programName, `${adapter.platform} name missing`); assert(parsed.structuredData.scopes.some((scope) => scope.asset === expectedAsset && scope.isInScope), `${adapter.platform} in-scope asset missing`); assert(parsed.structuredData.scopes.some((scope) => !scope.isInScope), `${adapter.platform} out-of-scope asset missing`); shared.programIntakeStructuredResultSchema.parse(parsed.structuredData); }
    const manualText = "Program Name: Manual Fixture\nIn Scope\n*.manual-acme.test\nOut of Scope\nadmin.manual-acme.test\nAutomation\nAutomated scanning is limited to 2 RPS. DoS is prohibited.";
    const manualParsed = await new ManualTextIntakeAdapter().parse(pastedTextDocument("manual", manualText)); assert(manualParsed.structuredData.scopes.length === 2 && manualParsed.structuredData.rules.automationAllowed === "limited" && manualParsed.structuredData.rules.dosTestingAllowed === false, "Manual deterministic safety parsing failed");

    for (const [key, value] of [["ai.enabled", true], ["ai.monthlyLimit", 100], ["ai.intakeFallbackThreshold", 70]] as const) await app.prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
    const highDoc = normalizeSourceHtml(await fixture("hackerone.html")); const highMock = new MockAiProvider(manualParsed.structuredData);
    const high = await createProgramIntakePreview(app.prisma, { sourceType: "pasted_text", platform: "hackerone", text: highDoc.rawText }, "phase13-smoke", { aiProvider: highMock }); runIds.push(high.run.id); assert(high.run.parserConfidence >= 70 && !high.run.aiUsed && highMock.calls === 0, "High-confidence input incorrectly invoked AI");

    await app.prisma.appSetting.update({ where: { key: "ai.intakeFallbackThreshold" }, data: { value: 100 } });
    const lowText = "In Scope\napi.low-acme.test\nOut of Scope\nadmin.low-acme.test\nAutomated scanning is limited to 2 RPS. DoS is prohibited.";
    const det = await new ManualTextIntakeAdapter().parse(pastedTextDocument("manual", lowText));
    const aiAttempt = { ...det.structuredData, scopes: [...det.structuredData.scopes.map((scope) => scope.asset === "admin.low-acme.test" ? { ...scope, isInScope: true } : scope), { asset: "*.invented.test", assetType: "wildcard_domain" as const, isInScope: true, bountyEligible: true, notes: null, confidence: 99, sourceEvidence: "invented" }], rules: { ...det.structuredData.rules, automationAllowed: "yes" as const, aggressiveAllowed: true, dosTestingAllowed: true }, overallConfidence: 95 };
    const low = await createProgramIntakePreview(app.prisma, { sourceType: "pasted_text", platform: "manual", text: lowText }, "phase13-smoke", { aiProvider: new MockAiProvider(aiAttempt) }); runIds.push(low.run.id); const structured = shared.programIntakeStructuredResultSchema.parse(low.proposal.structuredData);
    assert(low.run.aiUsed, `Low-confidence AI fallback was not used: ${JSON.stringify(structured.warnings)}`);
    assert(structured.rules.automationAllowed === "limited" && !structured.rules.dosTestingAllowed && !structured.rules.aggressiveAllowed, `AI widened policy permissions: ${JSON.stringify(structured.rules)}`);
    assert(structured.scopes.find((scope) => scope.asset === "admin.low-acme.test")?.isInScope === false, "AI overrode out-of-scope"); assert(!structured.scopes.some((scope) => scope.asset === "*.invented.test"), "AI invented wildcard scope"); assert(structured.warnings.some((warning) => warning.includes("AI")), "Merge warnings missing");
    const approved = await app.inject({ method: "POST", url: `/program-intake/runs/${low.run.id}/approve`, headers, payload: { structuredData: structured } }); expectStatus(approved.statusCode, 201, "approve new intake"); const programId = approved.json().id as string; programIds.push(programId);
    const imported = await app.prisma.program.findUnique({ where: { id: programId }, include: { rules: true, scopes: true, reconSchedules: true } }); assert(imported?.huntingStatus === "not_hunting" && imported.reconSchedules.length === 0, "Imported program was automatically activated for recon"); assert(imported.rules?.automationAllowed === "limited" && imported.rules.dosTestingAllowed === false, "Approved rules are unsafe");

    const syncText = "Program Name: Low Confidence Updated\nIn Scope\napi.low-acme.test\n*.new.low-acme.test\nOut of Scope\nadmin.low-acme.test\nAutomated scanning is allowed at 3 RPS. DoS is prohibited.";
    const before = JSON.stringify((await app.prisma.program.findUnique({ where: { id: programId }, include: { scopes: true, rules: true, headers: true } }))?.scopes);
    const syncPreviewResponse = await app.inject({ method: "POST", url: `/programs/${programId}/intake/sync-preview`, headers, payload: { sourceType: "pasted_text", text: syncText } }); expectStatus(syncPreviewResponse.statusCode, 201, "sync preview"); const syncPreview = syncPreviewResponse.json(); runIds.push(syncPreview.run.id); assert(JSON.stringify((await app.prisma.program.findUnique({ where: { id: programId }, include: { scopes: true } }))?.scopes) === before, "Sync preview mutated program"); assert(syncPreview.diff.scopeAdded.length > 0, "Sync diff did not detect added wildcard");
    const syncApply = await app.inject({ method: "POST", url: `/programs/${programId}/intake/sync-apply`, headers, payload: { intakeRunId: syncPreview.run.id, structuredData: syncPreview.proposal.structuredData, approvedChanges: { confirmScopeRemovals: true, confirmWildcardAdditions: true, confirmPermissionWidening: true, confirmAggressiveEnablement: true, confirmHeaderRemovals: true } } }); expectStatus(syncApply.statusCode, 200, "sync apply"); assert(await app.prisma.notificationEvent.findFirst({ where: { programId, eventType: "scope_changed" } }), "Sync did not create scope_changed notification");

    await app.prisma.appSetting.update({ where: { key: "ai.monthlyLimit" }, data: { value: 0 } }); const limited = await createProgramIntakePreview(app.prisma, { sourceType: "pasted_text", platform: "manual", text: "Program Name: Limit Fixture\nPolicy text is ambiguous and contains no explicit scope or automation permission." }, "phase13-smoke", { aiProvider: new MockAiProvider(aiAttempt) }); runIds.push(limited.run.id); assert(!limited.run.aiUsed && limited.proposal.structuredData.warnings.some((warning: string) => warning.includes("monthly limit")), "Monthly fallback limit was not enforced");
    if (allowDeepSeek) { const config = await resolveAiConfig(app.prisma); assert(config.apiKey, "Live DeepSeek opt-in requires configured API key"); const output = await new DeepSeekAiProvider(config).extractProgramPolicy({ platform: "manual", deterministic: det.structuredData, policyText: "*.example.test is in scope. admin.example.test is out of scope. Automated scanning is limited to 2 requests per second. DoS is prohibited." }); shared.programIntakeStructuredResultSchema.parse(output.data); }
    await app.prisma.appSetting.upsert({ where: { key: "deepseek.apiKey" }, update: { value: "PHASE13_SECRET_API_KEY" }, create: { key: "deepseek.apiKey", value: "PHASE13_SECRET_API_KEY" } }); const settings = await app.inject({ method: "GET", url: "/settings", headers }); expectStatus(settings.statusCode, 200, "settings masking"); assert(!settings.body.includes("PHASE13_SECRET_API_KEY") && settings.json()["deepseek.apiKey"] === "********", "DeepSeek key was exposed");
    const audits = await app.prisma.auditLog.findMany({ where: { OR: [{ entityId: { in: runIds } }, { programId: { in: programIds } }] } }); const auditText = JSON.stringify(audits); assert(!auditText.includes("PHASE13_SECRET_API_KEY") && !auditText.includes(lowText) && !auditText.includes(JSON.stringify(aiAttempt)), "Audit metadata leaked AI key, policy, prompt, or response"); assert(await app.prisma.aiUsageLog.findFirst({ where: { purpose: "program_intake", model: "mock-deepseek-v4-flash", success: true } }), "AI usage was not logged");
    if (allowPlatform) { const fetched = await fetchPlatformSource(process.env.BOUNTYOPS_SMOKE_INTAKE_URL!); assert(fetched.rawText.length > 0, "Optional platform fetch returned no text"); }
    console.log(JSON.stringify({ success: true, noPlatformNetwork: !allowPlatform, noDeepSeekNetwork: !allowDeepSeek, adapters: ["hackerone", "bugcrowd", "yeswehack", "manual"], conservativeMerge: true, approvalAndSync: true, monthlyLimit: true, keyMasked: true }, null, 2));
  } finally {
    if (programIds.length) { await app.prisma.notificationEvent.deleteMany({ where: { programId: { in: programIds } } }); await app.prisma.auditLog.deleteMany({ where: { programId: { in: programIds } } }); }
    if (runIds.length) await app.prisma.auditLog.deleteMany({ where: { entityType: "program_intake_run", entityId: { in: runIds } } });
    await app.prisma.aiUsageLog.deleteMany({ where: { createdAt: { gte: smokeStarted }, model: { startsWith: "mock-" } } });
    await app.prisma.programIntakeRun.deleteMany({ where: { id: { in: runIds } } }); await app.prisma.program.deleteMany({ where: { id: { in: programIds } } });
    for (const key of settingKeys) { const original = originalSettings.find((item) => item.key === key); if (original) await app.prisma.appSetting.upsert({ where: { key }, update: { value: JSON.parse(JSON.stringify(original.value)) }, create: { key, value: JSON.parse(JSON.stringify(original.value)) } }); else await app.prisma.appSetting.deleteMany({ where: { key } }); }
    await app.close();
  }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
