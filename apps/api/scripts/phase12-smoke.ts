const allowLive = process.env.BOUNTYOPS_SMOKE_TELEGRAM_ALLOW_SEND === "1";
process.env.BOUNTYOPS_NOTIFICATION_TRANSPORT = allowLive ? "telegram" : "mock";
process.env.NOTIFICATION_DISPATCH_INTERVAL_MS = "3600000";

const [{ buildApp }, { dispatchPendingNotifications }, workerModule, telegramModule] = await Promise.all([
  import("../src/app.js"),
  import("../src/modules/notifications/notification-dispatcher.service.js"),
  import("../../worker/src/notification-worker.js"),
  import("../../worker/src/services/telegram.service.js"),
]);
const { processNotificationDelivery } = workerModule;
const { MockNotificationTransport } = telegramModule;

const expectStatus = (actual: number, expected: number, label: string) => {
  if (actual !== expected) throw new Error(`${label}: expected HTTP ${expected}, received ${actual}`);
};
const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

async function main() {
  if (!allowLive && process.env.BOUNTYOPS_NOTIFICATION_TRANSPORT !== "mock")
    throw new Error("Phase 12 default smoke requires mock notification transport");
  const app = await buildApp();
  let programId = "";
  const eventIds: string[] = [];
  const originalTelegramEnabled = await app.prisma.appSetting.findUnique({ where: { key: "telegram.enabled" } });
  const queueJobIds: string[] = [];
  const createEvent = async (eventType: string, importance: string, message = "Controlled Phase 12 fixture") => {
    const event = await app.prisma.notificationEvent.create({ data: { programId, eventType, importance, title: eventType, message, status: "pending", metadata: { target: "https://api.example.com/graphql", unsafeBody: "PHASE12_SECRET_EVIDENCE_BODY" } } });
    eventIds.push(event.id);
    queueJobIds.push(`telegram-${event.id}`);
    return event;
  };
  const dispatch = () => dispatchPendingNotifications(app.prisma, app.notificationQueue);
  const deliveryFor = (id: string) => app.prisma.notificationDelivery.findUnique({ where: { notificationEventId_channel: { notificationEventId: id, channel: "telegram" } } });
  try {
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } });
    expectStatus(login.statusCode, 200, "login");
    const cookie = login.headers["set-cookie"]?.split(";")[0];
    assert(cookie, "No session cookie");
    const headers = { cookie };
    const created = await app.inject({ method: "POST", url: "/programs", headers, payload: { platform: "custom", name: `Phase 12 smoke ${Date.now()}`, status: "active", huntingStatus: "ongoing" } });
    expectStatus(created.statusCode, 201, "program create");
    programId = created.json().id as string;
    await app.prisma.appSetting.upsert({ where: { key: "telegram.enabled" }, update: { value: true }, create: { key: "telegram.enabled", value: true } });
    const preferencePayload = { enabled: true, telegramEnabled: true, minImportance: "medium", eventTypes: ["graphql_discovered"] };
    expectStatus((await app.inject({ method: "PUT", url: `/programs/${programId}/notification-preferences`, headers, payload: preferencePayload })).statusCode, 200, "preference update");

    const eligible = await createEvent("graphql_discovered", "high");
    const firstDispatch = await dispatch();
    assert(firstDispatch.queued === 1, "Eligible event was not queued");
    let delivery = await deliveryFor(eligible.id);
    assert(delivery?.status === "queued", "Delivery was not persisted as queued");
    assert(await app.prisma.notificationDelivery.count({ where: { notificationEventId: eligible.id } }) === 1, "Duplicate delivery row created");
    const firstTransport = new MockNotificationTransport();
    await processNotificationDelivery({ notificationEventId: eligible.id, notificationDeliveryId: delivery.id, channel: "telegram" }, { transport: firstTransport });
    delivery = await deliveryFor(eligible.id);
    assert(delivery?.status === "delivered" && delivery.attemptCount === 1 && Boolean(delivery.providerMessageId), "Mock delivery lifecycle failed");
    assert((await app.prisma.notificationEvent.findUnique({ where: { id: eligible.id } }))?.status === "delivered", "Event was not marked delivered");
    await (await app.notificationQueue.getJob(`telegram-${eligible.id}`))?.remove();
    await dispatch();
    assert(await app.prisma.notificationDelivery.count({ where: { notificationEventId: eligible.id } }) === 1 && !(await app.notificationQueue.getJob(`telegram-${eligible.id}`)), "Repeat dispatch was not idempotent");

    const disabledType = await createEvent("new_subdomain", "high");
    await dispatch();
    assert((await deliveryFor(disabledType.id))?.status === "suppressed", "Disabled event type was not suppressed");
    await app.prisma.programNotificationPreference.update({ where: { programId }, data: { minImportance: "high", eventTypes: ["graphql_discovered"] } });
    const lowImportance = await createEvent("graphql_discovered", "medium");
    await dispatch();
    assert((await deliveryFor(lowImportance.id))?.status === "suppressed", "Below-threshold event was not suppressed");
    await app.prisma.programNotificationPreference.update({ where: { programId }, data: { enabled: false } });
    const disabled = await createEvent("graphql_discovered", "critical");
    await dispatch();
    assert((await deliveryFor(disabled.id))?.status === "suppressed", "Disabled program notification was not suppressed");

    await app.prisma.programNotificationPreference.update({ where: { programId }, data: { enabled: true, minImportance: "medium" } });
    const transient = await createEvent("graphql_discovered", "high");
    await dispatch();
    let transientDelivery = await deliveryFor(transient.id);
    assert(transientDelivery, "Transient fixture was not queued");
    const transientTransport = new MockNotificationTransport("transient_once");
    let transientThrown = false;
    try { await processNotificationDelivery({ notificationEventId: transient.id, notificationDeliveryId: transientDelivery.id, channel: "telegram" }, { transport: transientTransport, attemptNumber: 1, maxAttempts: 4 }); } catch { transientThrown = true; }
    assert(transientThrown, "Transient transport error did not request retry");
    await processNotificationDelivery({ notificationEventId: transient.id, notificationDeliveryId: transientDelivery.id, channel: "telegram" }, { transport: transientTransport, attemptNumber: 2, maxAttempts: 4 });
    transientDelivery = await deliveryFor(transient.id);
    assert(transientDelivery?.status === "delivered" && transientDelivery.attemptCount === 2, "Transient retry did not succeed");

    const permanent = await createEvent("graphql_discovered", "high");
    await dispatch();
    const permanentDelivery = await deliveryFor(permanent.id);
    assert(permanentDelivery, "Permanent fixture was not queued");
    await processNotificationDelivery({ notificationEventId: permanent.id, notificationDeliveryId: permanentDelivery.id, channel: "telegram" }, { transport: new MockNotificationTransport("permanent"), attemptNumber: 1, maxAttempts: 4 });
    assert((await deliveryFor(permanent.id))?.status === "failed", "Permanent error was not marked failed");
    assert((await app.prisma.notificationEvent.findUnique({ where: { id: permanent.id } }))?.status === "failed", "Permanent event was not marked failed");

    const ignored = await createEvent("graphql_discovered", "high");
    await dispatch();
    const ignoredDelivery = await deliveryFor(ignored.id);
    assert(ignoredDelivery, "Ignored fixture was not queued");
    expectStatus((await app.inject({ method: "PATCH", url: `/notification-events/${ignored.id}/status`, headers, payload: { status: "ignored" } })).statusCode, 200, "ignore queued event");
    const ignoredTransport = new MockNotificationTransport();
    await processNotificationDelivery({ notificationEventId: ignored.id, notificationDeliveryId: ignoredDelivery.id, channel: "telegram" }, { transport: ignoredTransport });
    assert(ignoredTransport.callCount === 0, "Ignored event reached notification transport");

    expectStatus((await app.inject({ method: "GET", url: "/notifications/queue/health", headers })).statusCode, 200, "notification queue health");
    expectStatus((await app.inject({ method: "GET", url: `/notification-deliveries?programId=${programId}`, headers })).statusCode, 200, "delivery list");
    const audits = await app.prisma.auditLog.findMany({ where: { programId } });
    const auditText = JSON.stringify(audits);
    assert(!auditText.includes("PHASE12_SECRET_EVIDENCE_BODY") && !auditText.includes(process.env.TELEGRAM_BOT_TOKEN || "__unset_token__"), "Sensitive notification data leaked into audit metadata");

    if (allowLive) {
      const [{ resolveTelegramConfig }, { sendTelegramMessage }] = await Promise.all([import("../src/modules/notifications/telegram-config.service.js"), import("../src/modules/notifications/telegram-client.service.js")]);
      const config = await resolveTelegramConfig(app.prisma);
      assert(config.botToken && config.chatId, "Live smoke opt-in requires Telegram token and chat ID in DB settings or environment");
      await sendTelegramMessage({ botToken: config.botToken, chatId: config.chatId, text: "BountyOps Phase 12 live Telegram smoke test" });
    }
    console.log(JSON.stringify({ success: true, noExternalNetwork: !allowLive, optionalLiveSendCount: allowLive ? 1 : 0, deliveryRows: await app.prisma.notificationDelivery.count({ where: { notificationEventId: { in: eventIds } } }), deduplicated: true, retryVerified: true, ignoreRaceProtected: true }, null, 2));
  } finally {
    for (const id of queueJobIds) await (await app.notificationQueue.getJob(id))?.remove().catch(() => undefined);
    if (programId) {
      await app.prisma.notificationEvent.deleteMany({ where: { programId } });
      await app.prisma.auditLog.deleteMany({ where: { programId } });
      await app.prisma.program.deleteMany({ where: { id: programId } });
    }
    if (originalTelegramEnabled) await app.prisma.appSetting.update({ where: { key: "telegram.enabled" }, data: { value: JSON.parse(JSON.stringify(originalTelegramEnabled.value)) } });
    else await app.prisma.appSetting.deleteMany({ where: { key: "telegram.enabled" } });
    await app.close();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
