// Stand-in for "the ERP's webhook receiver" — verifies the HMAC signature the
// same way a real ERP integration would, then appends the event to a JSON
// inbox file so the ERP Integration screen can show what actually arrived.
// Mirrors the fs-append pattern already used by src/app/api/demo-log/route.ts.

import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHmac, timingSafeEqual } from 'crypto';
import { TENANT_API_KEY } from '@/src/lib/webhooks';

// See trip-store.ts — process.cwd() is read-only on most serverless hosts.
const INBOX_FILE = join(tmpdir(), 'xyz-monitoring-webhook-inbox.json');

interface InboxEntry {
  receivedAt: string;
  eventId: string;
  signatureValid: boolean;
  payload: unknown;
}

function readInbox(): InboxEntry[] {
  try {
    if (!existsSync(INBOX_FILE)) return [];
    return JSON.parse(readFileSync(INBOX_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function verifySignature(body: string, header: string | null): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', TENANT_API_KEY).update(body).digest('hex');
  const provided = header.slice('sha256='.length);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(provided, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signatureValid = verifySignature(body, req.headers.get('x-signature'));
  const eventId = req.headers.get('x-event-id') ?? `evt_${Date.now()}`;

  let payload: unknown = null;
  try { payload = JSON.parse(body); } catch { /* leave null */ }

  const inbox = readInbox();
  // Idempotent for the receiver: replaying the same X-Event-Id doesn't duplicate the entry.
  if (!inbox.some(e => e.eventId === eventId)) {
    inbox.push({ receivedAt: new Date().toISOString(), eventId, signatureValid, payload });
    try {
      writeFileSync(INBOX_FILE, JSON.stringify(inbox.slice(-500), null, 2), 'utf8');
    } catch {
      // Best-effort persistence — a failed write here shouldn't fail the
      // webhook delivery itself (the signature check below still applies).
    }
  }

  if (!signatureValid) {
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 });
  }
  return NextResponse.json({ ok: true, eventId });
}

export async function GET() {
  return NextResponse.json({ inbox: readInbox() });
}
