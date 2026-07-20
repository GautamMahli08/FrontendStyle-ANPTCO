import { NextRequest, NextResponse } from 'next/server';
import { appendFileSync } from 'fs';
import { join } from 'path';

const LOG_FILE = join(process.cwd(), 'demo-events.log');

export async function POST(req: NextRequest) {
  try {
    const { actor, action, detail } = await req.json();
    const ts = new Date().toISOString();
    const line = `[${ts}] [${actor}] ${action} | ${detail}\n`;
    appendFileSync(LOG_FILE, line, 'utf8');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
