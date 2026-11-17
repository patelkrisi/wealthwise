import fs from 'node:fs/promises';
import path from 'node:path';
import { api, appUrl } from '@/lib/auth';
import { reportData } from '@/lib/services/reports';
import { buildReportPdf, FONT_FILES } from '@/lib/pdf/report-pdf';

export const runtime = 'nodejs';
export const maxDuration = 30;
type C = { params: Promise<{ month: string }> };

/** Fonts come from public/fonts: read from disk when bundled with the function, otherwise fetched from the site itself. */
async function font(req: Request, name: string) {
  try {
    return new Uint8Array(await fs.readFile(path.join(process.cwd(), 'public', 'fonts', name)));
  } catch {
    const r = await fetch(`${appUrl(req)}/fonts/${name}`);
    if (!r.ok) throw new Error(`Font ${name} unavailable (${r.status})`);
    return new Uint8Array(await r.arrayBuffer());
  }
}

/** Direct download link (the Reports page builds the same PDF in the browser). */
export const GET = api<C>(async (req, u, { params }) => {
  const { month } = await params;
  const d = await reportData(u.id, month);
  const [regular, semibold, bold] = await Promise.all([font(req, FONT_FILES.regular), font(req, FONT_FILES.semibold), font(req, FONT_FILES.bold)]);
  const bytes = await buildReportPdf(d, { regular, semibold, bold });
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="wealthwise-report-${month}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
