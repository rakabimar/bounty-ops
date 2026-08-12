import { env } from "../../env.js";

export class TelegramClientError extends Error { constructor(message: string, public status?: number) { super(message); this.name = "TelegramClientError"; } }

export async function sendTelegramMessage(input: { botToken: string; chatId: string; text: string }) {
  if (env.NOTIFICATION_TRANSPORT === "mock") return { providerMessageId: `mock-test-${Date.now()}` };
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`https://api.telegram.org/bot${input.botToken}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: input.chatId, text: input.text.slice(0, 3500) }), signal: controller.signal });
    const body = await response.json().catch(() => ({})) as { ok?: boolean; description?: string; result?: { message_id?: number } };
    if (!response.ok || body.ok !== true) throw new TelegramClientError(String(body.description || `Telegram HTTP ${response.status}`).slice(0, 300), response.status);
    return { providerMessageId: String(body.result?.message_id ?? "unknown") };
  } catch (error) { if (error instanceof TelegramClientError) throw error; throw new TelegramClientError(error instanceof Error && error.name === "AbortError" ? "Telegram request timed out" : "Telegram network request failed"); }
  finally { clearTimeout(timeout); }
}
