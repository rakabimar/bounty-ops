import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app.js";
import { calculateNextRun } from "../src/modules/schedules/schedule.service.js";
import {
  beginSnapshot,
  completeSnapshot,
  failSnapshot,
  type ObservationCandidate,
} from "../../worker/src/services/recon-snapshot.service.js";

dotenv.config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});
const expectStatus = (actual: number, expected: number, label: string) => {
  if (actual !== expected)
    throw new Error(`${label}: expected HTTP ${expected}, received ${actual}`);
};
const observation = (
  entityType: ObservationCandidate["entityType"],
  entityId: string,
  entity: Record<string, unknown>,
): ObservationCandidate => ({ entityType, entityId, entity });

async function pair(
  programId: string,
  stage: string,
  comparisonKey: string,
  before: ObservationCandidate[],
  after: ObservationCandidate[],
) {
  const baseline = await beginSnapshot({
    programId,
    stage,
    metadata: { comparisonKey, fixture: true },
  });
  await completeSnapshot(baseline.id, {
    comparable: true,
    observations: before,
    metadata: { comparisonKey, fixture: true },
  });
  const current = await beginSnapshot({
    programId,
    stage,
    metadata: { comparisonKey, fixture: true },
  });
  const diff = await completeSnapshot(current.id, {
    comparable: true,
    observations: after,
    metadata: { comparisonKey, fixture: true },
  });
  if (!diff) throw new Error(`${stage} did not produce a comparable diff`);
  return diff;
}

async function main() {
  if (
    process.env.BOUNTYOPS_SMOKE_RECON_ALLOW_NETWORK === "1" ||
    process.env.BOUNTYOPS_SMOKE_RECON_ALLOW_ACTIVE === "1"
  )
    throw new Error(
      "Phase 11 smoke is intentionally no-network; remove recon opt-in flags",
    );
  const app = await buildApp();
  let programId = "";
  try {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
      },
    });
    expectStatus(login.statusCode, 200, "login");
    const cookie = login.headers["set-cookie"]?.split(";")[0];
    if (!cookie) throw new Error("No session cookie");
    const headers = { cookie };
    const created = await app.inject({
      method: "POST",
      url: "/programs",
      headers,
      payload: {
        platform: "custom",
        name: `Phase 11 smoke ${Date.now()}`,
        status: "active",
        huntingStatus: "ongoing",
      },
    });
    expectStatus(created.statusCode, 201, "program create");
    programId = created.json().id as string;
    expectStatus(
      (
        await app.inject({
          method: "POST",
          url: `/programs/${programId}/scopes`,
          headers,
          payload: {
            asset: "*.example.com",
            assetType: "wildcard_domain",
            isInScope: true,
            bountyEligible: true,
          },
        })
      ).statusCode,
      201,
      "scope create",
    );
    expectStatus(
      (
        await app.inject({
          method: "PUT",
          url: `/programs/${programId}/rules`,
          headers,
          payload: {
            automationAllowed: "yes",
            aggressiveAllowed: true,
            rateLimitRps: 1,
            maxConcurrency: 1,
            forbiddenActions: ["dos", "bruteforce"],
            authTestingAllowed: false,
            dosTestingAllowed: false,
          },
        })
      ).statusCode,
      200,
      "rules update",
    );

    const assetId = `asset-${Date.now()}`;
    const httpId = `http-${Date.now()}`;
    const findingId = `finding-${Date.now()}`;
    const dns = await pair(
      programId,
      "dns_resolve",
      "api.example.com",
      [
        observation("dns_record", "dns-old", {
          host: "api.example.com",
          recordType: "A",
          value: "10.0.0.1",
        }),
      ],
      [
        observation("dns_record", "dns-new", {
          host: "api.example.com",
          recordType: "A",
          value: "10.0.0.2",
        }),
      ],
    );
    const http = await pair(
      programId,
      "http_probe",
      "https://api.example.com",
      [
        observation("http_service", httpId, {
          normalizedUrl: "https://api.example.com",
          statusCode: 403,
          title: "Forbidden",
          technologies: ["nginx"],
          contentType: "text/html",
        }),
      ],
      [
        observation("http_service", httpId, {
          normalizedUrl: "https://api.example.com",
          statusCode: 200,
          title: "Admin Console",
          technologies: ["nginx", "react"],
          contentType: "text/html",
        }),
      ],
    );
    const urls = await pair(
      programId,
      "crawl",
      "https://api.example.com",
      [],
      [
        observation("url", "url-new", {
          normalizedUrl: "https://api.example.com/graphql",
          finalScore: 14,
          categories: ["graphql"],
          statusCode: 200,
        }),
      ],
    );
    const scoring = await pair(
      programId,
      "subdomain_enum",
      "example.com",
      [
        observation("asset", assetId, {
          type: "subdomain",
          normalizedValue: "api.example.com",
          status: "live",
          finalScore: 7,
          categories: ["api"],
        }),
      ],
      [
        observation("asset", assetId, {
          type: "subdomain",
          normalizedValue: "api.example.com",
          status: "live",
          finalScore: 18,
          categories: ["api", "graphql"],
        }),
      ],
    );

    const findingBase = await beginSnapshot({
      programId,
      stage: "nuclei_safe",
      metadata: { comparisonKey: "https://api.example.com", fixture: true },
    });
    await completeSnapshot(findingBase.id, {
      comparable: true,
      observations: [
        observation("scanner_finding", findingId, {
          tool: "nuclei",
          templateId: "safe-fixture",
          matchedUrl: "https://api.example.com",
          name: "Safe fixture",
          severity: "high",
          status: "new",
        }),
      ],
      metadata: { comparisonKey: "https://api.example.com", fixture: true },
    });
    const failed = await beginSnapshot({
      programId,
      stage: "nuclei_safe",
      metadata: { comparisonKey: "https://api.example.com", fixture: true },
    });
    await failSnapshot(
      failed.id,
      new Error("controlled partial fixture"),
      "partial",
    );
    if (
      await app.prisma.entityChange.count({
        where: { programId, type: "scanner_finding_resolved" },
      })
    )
      throw new Error("Partial snapshot falsely resolved a finding");
    const findingCurrent = await beginSnapshot({
      programId,
      stage: "nuclei_safe",
      metadata: { comparisonKey: "https://api.example.com", fixture: true },
    });
    await completeSnapshot(findingCurrent.id, {
      comparable: true,
      observations: [],
      metadata: { comparisonKey: "https://api.example.com", fixture: true },
    });

    for (const [name, diff] of [
      ["dns", dns],
      ["http", http],
      ["urls", urls],
      ["scoring", scoring],
    ] as const)
      if (diff.addedCount + diff.changedCount + diff.removedCount < 1)
        throw new Error(`${name} diff was empty`);
    for (const type of [
      "ip_changed",
      "status_code_changed",
      "title_changed",
      "technology_changed",
      "url_discovered",
      "score_changed",
      "priority_changed",
      "category_changed",
      "scanner_finding_resolved",
    ])
      if (
        !(await app.prisma.entityChange.findFirst({
          where: { programId, type },
        }))
      )
        throw new Error(`Missing semantic change ${type}`);

    const from = new Date("2026-01-05T01:00:00.000Z");
    const daily = calculateNextRun({
      frequency: "daily",
      timeOfDay: "03:00",
      timezone: "UTC",
      from,
    });
    const everyThree = calculateNextRun({
      frequency: "every_3_days",
      timeOfDay: "03:00",
      timezone: "UTC",
      from,
    });
    const weekly = calculateNextRun({
      frequency: "weekly",
      timeOfDay: "03:00",
      timezone: "Asia/Bangkok",
      from,
    });
    if (
      !daily ||
      !everyThree ||
      !weekly ||
      everyThree.getTime() <= daily.getTime() ||
      weekly.getTime() <= daily.getTime() ||
      calculateNextRun({ frequency: "manual", timezone: "UTC", from }) !== null
    )
      throw new Error("Schedule frequency calculation failed");

    const scheduleResponse = await app.inject({
      method: "POST",
      url: `/programs/${programId}/schedules`,
      headers,
      payload: {
        name: "Weekly controlled recon",
        frequency: "weekly",
        timeOfDay: "03:00",
        timezone: "Asia/Bangkok",
        enabled: false,
        config: {},
      },
    });
    expectStatus(scheduleResponse.statusCode, 201, "schedule create");
    const schedule = scheduleResponse.json() as {
      id: string;
      enabled: boolean;
    };
    if (schedule.enabled)
      throw new Error("New schedule should default/remain disabled");
    const updated = await app.inject({
      method: "PATCH",
      url: `/programs/${programId}/schedules/${schedule.id}`,
      headers,
      payload: { enabled: true, frequency: "daily" },
    });
    expectStatus(updated.statusCode, 200, "schedule update");
    if (!(updated.json() as { nextRunAt: string | null }).nextRunAt)
      throw new Error("Enabled schedule has no next run");
    expectStatus(
      (
        await app.inject({
          method: "PUT",
          url: `/programs/${programId}/rules`,
          headers,
          payload: {
            automationAllowed: "no",
            aggressiveAllowed: false,
            forbiddenActions: ["dos", "bruteforce"],
            authTestingAllowed: false,
            dosTestingAllowed: false,
          },
        })
      ).statusCode,
      200,
      "block schedule policy",
    );
    const runNow = await app.inject({
      method: "POST",
      url: `/programs/${programId}/schedules/${schedule.id}/run-now`,
      headers,
    });
    expectStatus(runNow.statusCode, 200, "run now");
    if ((runNow.json() as { status: string }).status !== "blocked")
      throw new Error("Scheduled run bypassed fresh Scope Guard policy");

    for (const [url, label] of [
      [`/programs/${programId}/recon-history`, "history"],
      [`/changes?programId=${programId}`, "changes"],
      [`/changes/summary?programId=${programId}&period=7d`, "summary"],
      [`/recon-diffs?programId=${programId}`, "diffs"],
      [
        `/notification-events?programId=${programId}&status=pending`,
        "notifications",
      ],
    ])
      expectStatus(
        (await app.inject({ method: "GET", url, headers })).statusCode,
        200,
        label,
      );
    const pending = await app.prisma.notificationEvent.findMany({
      where: { programId, status: "pending" },
    });
    if (!pending.length)
      throw new Error("Expected persisted notification events");
    if (pending.some((item) => item.deliveredAt))
      throw new Error("Smoke unexpectedly delivered a notification");
    const scopeEvent = pending.find(
      (item) => item.eventType === "scope_changed",
    );
    if (!scopeEvent) throw new Error("Scope change notification missing");
    const ignored = await app.inject({
      method: "PATCH",
      url: `/notification-events/${scopeEvent.id}/status`,
      headers,
      payload: { status: "ignored" },
    });
    expectStatus(ignored.statusCode, 200, "ignore notification");
    expectStatus(
      (
        await app.inject({
          method: "DELETE",
          url: `/programs/${programId}`,
          headers,
        })
      ).statusCode,
      200,
      "archive program",
    );
    console.log(
      JSON.stringify(
        {
          success: true,
          noNetwork: true,
          diffs: {
            dns: dns.id,
            http: http.id,
            urls: urls.id,
            scoring: scoring.id,
          },
          semanticChanges: 9,
          pendingNotifications: pending.length,
          scheduledRun: "blocked_by_fresh_scope_guard",
        },
        null,
        2,
      ),
    );
  } finally {
    if (programId)
      await app.prisma.program.updateMany({
        where: { id: programId },
        data: { status: "archived", huntingStatus: "not_hunting" },
      });
    await app.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
