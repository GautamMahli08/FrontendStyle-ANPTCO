// Outbound ERP webhooks — the "missing half" from the plan doc: the ERP created
// the order, so the ERP has to hear back before it can close it and bill. Every
// event is HMAC-signed with the tenant key (Web Crypto — runs in the browser,
// this whole app has no server-side session) and POSTed with retry + backoff to
// a mock ERP receiver (src/app/api/webhooks/mock-erp/route.ts). On final
// failure the event is parked in a local dead-letter list instead of silently
// dropped.

// Demo-only: normally each tenant gets its own signing key issued at onboarding.
export const TENANT_API_KEY = 'demo-tenant-secret-xyz-petroleum';

export type WebhookEventType =
  | 'trip.arrived'
  | 'delivery.confirmed'
  | 'theft.alert'
  | 'trip.exception'
  | 'telemetry.no_signal';

export interface WebhookPayload {
  event: WebhookEventType;
  trip_id: string;
  erp_dispatch_no: string;
  occurred_at: string;
  data: Record<string, unknown>;
}

export interface WebhookLogEntry {
  eventId: string;
  payload: WebhookPayload;
  signature: string;
  attempts: number;
  status: 'DELIVERED' | 'RETRYING' | 'DEAD_LETTER';
  lastAttemptAt: string;
}

const LOG_KEY = 'erp_webhook_outbox';
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 500, 1500];

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** HMAC-SHA256 sign a string payload with the tenant key, returning a hex digest. */
export async function signPayload(payload: string, secret: string = TENANT_API_KEY): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return toHex(sig);
}

export function getWebhookOutbox(): WebhookLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveOutbox(entries: WebhookLogEntry[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(-200)));
}

function upsertLogEntry(entry: WebhookLogEntry) {
  const entries = getWebhookOutbox();
  const idx = entries.findIndex(e => e.eventId === entry.eventId);
  if (idx >= 0) entries[idx] = entry;
  else entries.push(entry);
  saveOutbox(entries);
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Sign and send one webhook event, retrying with exponential backoff. Always
 * resolves (never throws) — delivery failure is recorded as DEAD_LETTER, not
 * surfaced as an exception to the caller, matching a fire-and-forget webhook
 * sender in production.
 */
export async function sendWebhook(payload: WebhookPayload): Promise<WebhookLogEntry> {
  const eventId = `evt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const body = JSON.stringify(payload);
  const signature = await signPayload(body);

  let attempts = 0;
  let entry: WebhookLogEntry = {
    eventId, payload, signature, attempts, status: 'RETRYING', lastAttemptAt: new Date().toISOString(),
  };
  upsertLogEntry(entry);

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    attempts++;
    if (BACKOFF_MS[i]) await sleep(BACKOFF_MS[i]);
    try {
      const res = await fetch('/api/webhooks/mock-erp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': `sha256=${signature}`,
          'X-Event-Id': eventId,
        },
        body,
      });
      if (res.ok) {
        entry = { ...entry, attempts, status: 'DELIVERED', lastAttemptAt: new Date().toISOString() };
        upsertLogEntry(entry);
        return entry;
      }
    } catch {
      // network failure — fall through to retry/backoff
    }
    entry = { ...entry, attempts, lastAttemptAt: new Date().toISOString() };
    upsertLogEntry(entry);
  }

  entry = { ...entry, status: 'DEAD_LETTER' };
  upsertLogEntry(entry);
  return entry;
}
