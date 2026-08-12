export interface DeliveryResult { providerMessageId: string }
export interface NotificationTransport { send(input: { token: string; chatId: string; message: string }): Promise<DeliveryResult> }

export class TelegramTransportError extends Error {
  constructor(message: string, public transient: boolean, public status?: number, public retryAfterSeconds?: number) { super(message); this.name = "TelegramTransportError"; }
}

const safeDescription = (value: unknown, secrets: string[] = []) => {
  let description = String(value ?? "Telegram delivery failed").replace(/[\u0000-\u001f\u007f]/g, " ");
  for (const secret of secrets) if (secret) description = description.split(secret).join("[redacted]");
  return description.slice(0, 300);
};

export class TelegramNotificationTransport implements NotificationTransport {
  async send(input: { token: string; chatId: string; message: string }): Promise<DeliveryResult> {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`https://api.telegram.org/bot${input.token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: input.chatId, text: input.message }), signal: controller.signal });
      const body = await response.json().catch(() => ({})) as { ok?: boolean; description?: string; result?: { message_id?: number }; parameters?: { retry_after?: number } };
      if (!response.ok || body.ok !== true || body.result?.message_id == null) throw new TelegramTransportError(safeDescription(body.description || `Telegram HTTP ${response.status}`, [input.token, input.chatId]), response.status === 429 || response.status >= 500, response.status, body.parameters?.retry_after);
      return { providerMessageId: String(body.result.message_id) };
    } catch (error) {
      if (error instanceof TelegramTransportError) throw error;
      const timeoutError = error instanceof Error && error.name === "AbortError";
      throw new TelegramTransportError(timeoutError ? "Telegram request timed out" : "Telegram network request failed", true);
    } finally { clearTimeout(timeout); }
  }
}

export class MockNotificationTransport implements NotificationTransport {
  private calls = 0;
  constructor(private behavior: "success" | "transient_once" | "permanent" = "success") {}
  async send(): Promise<DeliveryResult> {
    this.calls++;
    if (this.behavior === "transient_once" && this.calls === 1) throw new TelegramTransportError("Mock transient failure", true, 503);
    if (this.behavior === "permanent") throw new TelegramTransportError("Mock permanent failure", false, 401);
    return { providerMessageId: `mock-${this.calls}` };
  }
  get callCount() { return this.calls; }
}
