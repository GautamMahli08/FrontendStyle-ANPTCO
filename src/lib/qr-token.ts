// Signed, short-lived, trip-bound delivery QR (plan §8's fix). The truck's
// printed placard (src/lib/truck-qr.ts) is a static "vehicle ID" QR — fine for
// identifying a truck, but replayable: photograph it once and it's valid
// forever. The code actually scanned to CONFIRM DELIVERY must instead be
// bound to the active trip and expire quickly, so a photo of yesterday's QR
// can't confirm today's delivery.

const TOKEN_TTL_MS = 90_000; // regenerate faster than this on the display side
const SECRET = 'demo-tenant-secret-xyz-petroleum'; // same tenant key as src/lib/webhooks.ts

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Browser-only (this module runs client-side, alongside the qrcode/jsqr scan flow).
function toBase64Url(json: object): string {
  return btoa(JSON.stringify(json)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64: string): any {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
  return JSON.parse(atob(padded));
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return toHex(sig);
}

/** Build a `<payload>.<signature>` token bound to this trip, expiring in TOKEN_TTL_MS. */
export async function createDeliveryQrToken(tripId: string): Promise<string> {
  const payload = toBase64Url({ tripId, iat: Date.now(), exp: Date.now() + TOKEN_TTL_MS });
  const signature = await hmac(payload);
  return `${payload}.${signature}`;
}

export interface QrVerification {
  valid: boolean;
  reason?: 'MALFORMED' | 'BAD_SIGNATURE' | 'EXPIRED' | 'WRONG_TRIP';
}

/** Verify signature, expiry, and that the token is bound to THIS trip — not just any truck. */
export async function verifyDeliveryQrToken(token: string, expectedTripId: string): Promise<QrVerification> {
  const parts = token.trim().split('.');
  if (parts.length !== 2) return { valid: false, reason: 'MALFORMED' };
  const [payloadB64, signature] = parts;

  let payload: { tripId: string; iat: number; exp: number };
  try {
    payload = fromBase64Url(payloadB64);
  } catch {
    return { valid: false, reason: 'MALFORMED' };
  }

  const expectedSig = await hmac(payloadB64);
  if (expectedSig !== signature) return { valid: false, reason: 'BAD_SIGNATURE' };
  if (Date.now() > payload.exp) return { valid: false, reason: 'EXPIRED' };
  if (payload.tripId !== expectedTripId) return { valid: false, reason: 'WRONG_TRIP' };
  return { valid: true };
}

export { TOKEN_TTL_MS };
