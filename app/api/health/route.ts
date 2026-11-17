import { NextResponse } from 'next/server';
import { databaseRegion, databaseUrl, q } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Health check, also used by the daily keep-alive so the free database never goes idle.
 * Reports only coarse locations (hosting region, database region) and timings, never secrets.
 */
export async function GET() {
  const started = Date.now();
  try {
    const t: number[] = [];
    for (let i = 0; i < 3; i++) {
      const s = Date.now();
      await q(`select 1`);
      t.push(Date.now() - s);
    }
    const host = (() => {
      try {
        return new URL(databaseUrl() || '').hostname;
      } catch {
        return '';
      }
    })();
    const dbRegion = databaseRegion().code ?? (host.endsWith('supabase.co') ? 'supabase (direct)' : host ? 'other' : 'embedded');
    return NextResponse.json(
      { ok: true, appRegion: process.env.VERCEL_REGION ?? 'local', dbRegion, dbRoundTripMs: t, totalMs: Date.now() - started },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'Database unreachable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
