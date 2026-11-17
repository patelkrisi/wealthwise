// Monthly report as a PDF, drawn with pdf-lib (pure JavaScript: no headless browser, no native modules).
// The same function runs in the browser (Reports → Download PDF) and on the server (/api/reports/[month]/pdf).
import { PDFDocument, PDFFont, PDFPage, rgb, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { inr, inrCompact } from '../format';
import { accentOf } from '../theme';

export interface ReportFonts {
  regular: Uint8Array | ArrayBuffer;
  semibold: Uint8Array | ArrayBuffer;
  bold: Uint8Array | ArrayBuffer;
}

export const FONT_FILES = { regular: 'Inter_400Regular.ttf', semibold: 'Inter_600SemiBold.ttf', bold: 'Inter_700Bold.ttf' } as const;

const W = 595.28;
const H = 841.89;
const M = 40; // page margin
const CW = W - 2 * M; // content width

function hex(h: string): RGB {
  const n = parseInt(h.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
function mix(a: string, b: string, t: number): RGB {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = (s: number) => (((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t) / 255;
  return rgb(c(16), c(8), c(0));
}

const INK = '#0f1a17';
const MUTED = '#5f6f6a';
const BORDER = '#e3e8e4';
const GOOD = '#0d9488';
const WARN = '#d97706';
const BAD = '#e11d48';
const NEC = { necessary: '#0d9488', neutral: '#f59e0b', unnecessary: '#e11d48' } as const;
const PALETTE = ['#0f766e', '#f97316', '#6366f1', '#db2777', '#ca8a04', '#0284c7', '#7c3aed', '#16a34a', '#dc2626', '#475569'];
const MODE_LABEL: Record<string, string> = { upi: 'UPI', cash: 'Cash', credit_card: 'Credit card', debit_card: 'Debit card', netbanking: 'Net banking', cheque: 'Cheque' };

const fmtDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDay = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

export async function buildReportPdf(d: any, fontBytes: ReportFonts, opts: { generatedOn?: string } = {}): Promise<Uint8Array> {
  const accent = accentOf(d.accent);
  const A = accent.light;
  const doc = await PDFDocument.create();
  // Fonts are embedded whole: pdf-lib’s subsetting drops glyphs from Inter.
  doc.registerFontkit(fontkit);
  const f = {
    r: await doc.embedFont(fontBytes.regular, { subset: false }),
    s: await doc.embedFont(fontBytes.semibold, { subset: false }),
    b: await doc.embedFont(fontBytes.bold, { subset: false }),
  };
  const glyphs = new Set(f.r.getCharacterSet());
  // Keep only characters the font can draw (emoji in names are dropped instead of showing as boxes).
  const clean = (t: unknown) =>
    Array.from(String(t ?? ''))
      .filter((ch) => glyphs.has(ch.codePointAt(0)!))
      .join('')
      .replace(/\*\*/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  doc.setTitle(`Wealthwise report · ${d.label}`);
  doc.setAuthor('Wealthwise');
  doc.setSubject(`Monthly spending report for ${clean(d.name)}`);
  doc.setCreator('Wealthwise');
  doc.setProducer('Wealthwise');

  let page!: PDFPage;
  let y = 0; // distance from the top of the page
  const pages: PDFPage[] = [];

  const text = (t: unknown, x: number, top: number, size: number, font: PDFFont = f.r, color = INK, o: { align?: 'left' | 'right' | 'center'; maxW?: number } = {}) => {
    let s = clean(t);
    if (o.maxW) while (s.length > 1 && font.widthOfTextAtSize(s, size) > o.maxW) s = s.slice(0, -2) + '…';
    const w = font.widthOfTextAtSize(s, size);
    const dx = o.align === 'right' ? -w : o.align === 'center' ? -w / 2 : 0;
    page.drawText(s, { x: x + dx, y: H - top - size * 0.8, size, font, color: hex(color) });
    return w;
  };
  const wrap = (t: string, font: PDFFont, size: number, maxW: number) => {
    const words = clean(t).split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? cur + ' ' + w : w;
      if (font.widthOfTextAtSize(next, size) > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const rect = (x: number, top: number, w: number, h: number, color: RGB, r = 0, border?: RGB) => {
    if (w <= 0 || h <= 0) return;
    if (!r) {
      page.drawRectangle({ x, y: H - top - h, width: w, height: h, color, borderColor: border, borderWidth: border ? 0.75 : 0 });
      return;
    }
    r = Math.min(r, w / 2, h / 2);
    const p = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
    page.drawSvgPath(p, { x, y: H - top, color, borderColor: border, borderWidth: border ? 0.75 : undefined });
  };
  const line = (x1: number, t1: number, x2: number, t2: number, color = BORDER, width = 0.75, dash?: number[]) =>
    page.drawLine({ start: { x: x1, y: H - t1 }, end: { x: x2, y: H - t2 }, thickness: width, color: hex(color), dashArray: dash });

  const logo = (x: number, top: number, size: number, bg: RGB, fg: RGB) => {
    rect(x, top, size, size, bg, size * 0.28);
    const k = size / 32;
    page.drawSvgPath(`M ${7 * k} ${10 * k} L ${11.2 * k} ${22 * k} L ${16 * k} ${12 * k} L ${20.8 * k} ${22 * k} L ${25 * k} ${10 * k}`, { x, y: H - top, borderColor: fg, borderWidth: 2.6 * k, borderLineCap: 1 as any });
  };

  const newPage = (first: boolean) => {
    page = doc.addPage([W, H]);
    pages.push(page);
    if (first) {
      // header band in the user's theme colour
      rect(0, 0, W, 118, hex(A));
      rect(0, 118, W, 4, mix(A, '#ffffff', 0.55));
      logo(M, 30, 22, rgb(1, 1, 1), hex(A));
      text('WEALTHWISE', M + 30, 34, 10, f.b, '#ffffff');
      text('MONTHLY REPORT', W - M, 34, 8.5, f.s, '#ffffff', { align: 'right' });
      text(d.label, M, 60, 24, f.b, '#ffffff');
      const range = `${shortDay(d.from)} – ${shortDay(d.to)} ${d.to.slice(0, 4)}`;
      text(`Prepared for ${clean(d.name) || 'you'}  ·  ${range}${d.isCurrent ? '  ·  month in progress' : ''}`, M, 92, 10, f.r, '#ffffff');
      y = 142;
    } else {
      logo(M, 24, 14, hex(A), rgb(1, 1, 1));
      text(`Wealthwise  ·  ${d.label}`, M + 20, 26, 9, f.s, MUTED);
      line(M, 46, W - M, 46);
      y = 62;
    }
  };
  const ensure = (h: number) => {
    if (y + h > H - 56) newPage(false);
  };
  const heading = (t: string, sub?: string) => {
    ensure(60);
    y += 10;
    rect(M, y + 2, 3, 13, hex(A), 1.5);
    text(t, M + 10, y, 13, f.b, INK);
    if (sub) text(sub, W - M, y + 2, 9, f.r, MUTED, { align: 'right' });
    y += 24;
  };

  newPage(true);

  // ---------- key numbers ----------
  const change = d.prevTotals?.total ? Math.round(((d.totals.total - d.prevTotals.total) / d.prevTotals.total) * 100) : null;
  const kept = d.income > 0 ? d.savings : null;
  const cards: [string, string, string, string?][] = [
    ['Spent', inr(d.totals.total), change != null ? `${change >= 0 ? '+' : '−'}${Math.abs(change)}% vs ${d.isCurrent ? 'last month (full)' : 'last month'}` : `${d.totals.n} expenses`, change != null ? (change > 0 ? BAD : GOOD) : undefined],
    ['Income logged', d.income > 0 ? inr(d.income) : '—', d.income > 0 ? 'money in this month' : 'no income logged'],
    ['Kept', kept == null ? '—' : inr(kept), kept == null ? 'log income to see this' : `${d.savingsRate}% of income`, kept == null ? undefined : kept >= 0 ? GOOD : BAD],
    ['Regret score', `${d.totals.regret}/100`, d.totals.regret <= 20 ? 'healthy · lower is better' : d.totals.regret <= 40 ? 'room to trim · lower is better' : 'high · lower is better', d.totals.regret <= 20 ? GOOD : d.totals.regret <= 40 ? WARN : BAD],
    ['Avoidable spend', inr(d.totals.avoidable), 'Unnecessary + part of Neutral'],
    ['Weekly targets hit', `${d.weeks.hit} of ${d.weeks.total}`, d.weeks.saved > 0 ? `${inr(d.weeks.saved)} moved to goals` : 'weekly savings challenge'],
  ];
  const cw = (CW - 2 * 10) / 3;
  cards.forEach(([label, value, sub, tone], i) => {
    const cx = M + (i % 3) * (cw + 10);
    const cy = y + Math.floor(i / 3) * 72;
    rect(cx, cy, cw, 62, rgb(1, 1, 1), 8, hex(BORDER));
    text(label.toUpperCase(), cx + 12, cy + 11, 7.5, f.s, MUTED);
    text(value, cx + 12, cy + 25, 16, f.b, tone && label !== 'Spent' ? tone : INK, { maxW: cw - 24 });
    text(sub, cx + 12, cy + 46, 8, f.r, tone && label === 'Spent' ? tone : MUTED, { maxW: cw - 24 });
  });
  y += 144;

  // ---------- summary ----------
  const summary: string[] = (d.summary?.length ? d.summary : d.autoSummary) ?? [];
  if (summary.length) {
    const lines = summary.map((l) => wrap(l, f.r, 9.5, CW - 40));
    const h = 22 + lines.reduce((s, l) => s + l.length * 13.5 + 4, 0);
    ensure(h + 10);
    rect(M, y, CW, h, hex(accent.soft), 10);
    text('IN SHORT', M + 16, y + 11, 7.5, f.b, A);
    let ty = y + 26;
    for (const l of lines) {
      page.drawCircle({ x: M + 19, y: H - ty - 4.2, size: 1.8, color: hex(A) });
      for (const ln of l) {
        text(ln, M + 28, ty, 9.5, f.r, INK);
        ty += 13.5;
      }
      ty += 4;
    }
    y += h + 8;
  }

  // ---------- where it went ----------
  const cats: any[] = d.categories ?? [];
  if (cats.length) {
    heading('Where your money went', `${d.totals.n} expenses · ${inr(d.totals.total)}`);
    const shown = cats.slice(0, 9);
    const rest = cats.slice(9);
    const rows = rest.length ? [...shown, { label: `${rest.length} other categories`, value: rest.reduce((s, c) => s + c.value, 0), n: rest.reduce((s, c) => s + (c.n || 0), 0), colour: '#94a3b8' }] : shown;
    const max = Math.max(1, ...rows.map((c) => c.value));
    for (const [i, c] of rows.entries()) {
      ensure(22);
      const share = d.totals.total ? Math.round((c.value / d.totals.total) * 100) : 0;
      page.drawCircle({ x: M + 4, y: H - y - 5.5, size: 3.5, color: hex(c.colour || PALETTE[i % PALETTE.length]) });
      text(c.label, M + 14, y, 9.5, f.s, INK, { maxW: 150 });
      if (c.n) text(`${c.n} expense${c.n === 1 ? '' : 's'}`, M + 14, y + 11.5, 7.5, f.r, MUTED);
      const bx = M + 175;
      const bw = CW - 175 - 110;
      rect(bx, y + 2, bw, 8, mix(BORDER, '#ffffff', 0.4), 4);
      rect(bx, y + 2, Math.max(3, (c.value / max) * bw), 8, hex(c.colour || PALETTE[i % PALETTE.length]), 4);
      text(inr(c.value), W - M - 36, y, 9.5, f.s, INK, { align: 'right' });
      text(`${share}%`, W - M, y, 9, f.r, MUTED, { align: 'right' });
      y += 24;
    }
  }

  // ---------- needs vs wants ----------
  if (d.totals.total > 0) {
    heading('Needs vs wants', `Regret score ${d.totals.regret}/100`);
    ensure(70);
    const parts = [
      ['Necessary', d.totals.necessary, NEC.necessary],
      ['Neutral', d.totals.neutral, NEC.neutral],
      ['Unnecessary', d.totals.unnecessary, NEC.unnecessary],
    ] as const;
    let bx = M;
    for (const [, v, col] of parts) {
      const w = (v / d.totals.total) * CW;
      if (w > 0.3) rect(bx, y, w, 14, hex(col));
      bx += w;
    }
    y += 24;
    const colW = CW / 3;
    parts.forEach(([l, v, col], i) => {
      const x = M + i * colW;
      page.drawCircle({ x: x + 4, y: H - y - 5, size: 3.5, color: hex(col) });
      text(l, x + 13, y, 9, f.s, INK);
      text(`${inr(v)}  ·  ${d.totals.total ? Math.round((v / d.totals.total) * 100) : 0}%`, x + 13, y + 13, 9, f.r, MUTED);
    });
    y += 32;
    const note = wrap(
      `Regret score = Unnecessary ÷ total spend × 100. ${inr(d.totals.unnecessary)} of ${inr(d.totals.total)} was tagged Unnecessary, so the score is ${d.totals.regret}. Under 20 is healthy.`,
      f.r,
      8.5,
      CW,
    );
    for (const l of note) {
      text(l, M, y, 8.5, f.r, MUTED);
      y += 12;
    }
    y += 4;
  }

  // ---------- spending through the month ----------
  const trend: any[] = (d.trend ?? []).filter((t: any) => t.cumulative != null || t.prevCumulative != null);
  if (trend.some((t) => (t.cumulative ?? 0) > 0)) {
    heading('Spending through the month', 'running total by day');
    ensure(150);
    const ch = 92;
    const cx0 = M + 44;
    const cw2 = CW - 44;
    const maxV = Math.max(1, ...trend.map((t) => Math.max(t.cumulative ?? 0, t.prevCumulative ?? 0)));
    const nice = (v: number) => {
      const p = Math.pow(10, Math.floor(Math.log10(v)));
      return Math.ceil(v / p / (v / p > 5 ? 2 : 1)) * p * (v / p > 5 ? 2 : 1);
    };
    const top = nice(maxV);
    for (let i = 0; i <= 4; i++) {
      const gy = y + ch - (ch * i) / 4;
      line(cx0, gy, W - M, gy, i === 0 ? '#cbd5d1' : BORDER, 0.5);
      text(inrCompact((top * i) / 4), cx0 - 6, gy - 4, 7.5, f.r, MUTED, { align: 'right' });
    }
    const n = Math.max(trend.length, 28);
    const px = (i: number) => cx0 + (i / (n - 1)) * cw2;
    const py = (v: number) => y + ch - (v / top) * ch;
    const path = (key: 'cumulative' | 'prevCumulative') => {
      const pts = trend.map((t, i) => (t[key] != null ? [px(i), py(t[key])] : null)).filter(Boolean) as number[][];
      return pts;
    };
    const draw = (pts: number[][], color: string, width: number, dash?: number[]) => {
      for (let i = 1; i < pts.length; i++) line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], color, width, dash);
    };
    const prevPts = path('prevCumulative');
    const curPts = path('cumulative');
    draw(prevPts, '#94a3b8', 1.2, [3, 3]);
    draw(curPts, A, 2.2);
    const lastPt = curPts[curPts.length - 1];
    if (lastPt) page.drawCircle({ x: lastPt[0], y: H - lastPt[1], size: 3, color: hex(A) });
    for (const day of [1, 8, 15, 22, 29]) if (day - 1 < n) text(String(day), px(day - 1), y + ch + 6, 7.5, f.r, MUTED, { align: 'center' });
    y += ch + 22;
    line(M + 44, y + 4, M + 62, y + 4, A, 2.2);
    text('This month', M + 68, y, 8.5, f.r, INK);
    line(M + 140, y + 4, M + 158, y + 4, '#94a3b8', 1.2, [3, 3]);
    text('Last month', M + 164, y, 8.5, f.r, INK);
    y += 20;
  }

  // ---------- how you paid ----------
  const modes: any[] = (d.modes ?? []).filter((m: any) => m.value > 0).sort((a: any, b: any) => b.value - a.value);
  if (modes.length) {
    heading('How you paid');
    const colW = CW / Math.min(3, modes.length);
    modes.slice(0, 6).forEach((m, i) => {
      if (i % 3 === 0) ensure(36);
      const x = M + (i % 3) * colW;
      const top = y + Math.floor((i % 6) / 3) * 0;
      const share = d.totals.total ? Math.round((m.value / d.totals.total) * 100) : 0;
      text(MODE_LABEL[m.label] ?? m.label, x, top, 9, f.s, INK);
      text(`${inr(m.value)} · ${share}%`, x + colW - 12, top, 9, f.r, MUTED, { align: 'right' });
      rect(x, top + 15, colW - 12, 5, mix(BORDER, '#ffffff', 0.4), 2.5);
      rect(x, top + 15, Math.max(2, ((colW - 12) * share) / 100), 5, hex(A), 2.5);
      if (i % 3 === 2 || i === modes.length - 1) y += 34;
    });
    y += 2;
  }

  // ---------- biggest expenses ----------
  const top: any[] = d.topExpenses ?? [];
  if (top.length) {
    heading('Biggest expenses');
    const cols = [M + 8, M + 82, M + 300, W - M - 8];
    ensure(24);
    rect(M, y - 4, CW, 20, hex(accent.soft), 6);
    text('DATE', cols[0], y + 2, 7.5, f.b, A);
    text('WHAT', cols[1], y + 2, 7.5, f.b, A);
    text('CATEGORY', cols[2], y + 2, 7.5, f.b, A);
    text('AMOUNT', cols[3], y + 2, 7.5, f.b, A, { align: 'right' });
    y += 22;
    for (const e of top) {
      ensure(22);
      text(fmtDay(e.spent_on), cols[0], y, 9, f.r, MUTED);
      text(e.name, cols[1], y, 9.5, f.s, INK, { maxW: 205 });
      text(e.category ?? '—', cols[2], y, 9, f.r, MUTED, { maxW: 150 });
      if (e.necessity === 'unnecessary') text('Unnecessary', cols[2], y + 11, 7, f.s, BAD);
      text(inr(e.amount_inr), cols[3], y, 9.5, f.b, INK, { align: 'right' });
      y += e.necessity === 'unnecessary' ? 26 : 22;
      line(M, y - 6, W - M, y - 6, BORDER, 0.5);
    }
    y += 4;
  }

  // ---------- budgets ----------
  const budgets: any[] = d.budgets?.items ?? [];
  if (budgets.length) {
    heading('Budgets', `${d.budgets.kept} of ${d.budgets.total} kept`);
    for (const b of budgets) {
      ensure(28);
      const pct = Math.round(b.pct ?? (b.limit_inr ? (b.spent / b.limit_inr) * 100 : 0));
      const over = b.spent > b.limit_inr;
      const tone = over ? BAD : d.isCurrent && pct >= 80 ? WARN : GOOD;
      text(b.category, M, y, 9.5, f.s, INK, { maxW: 150 });
      const bx = M + 160;
      const bw = CW - 160 - 150;
      rect(bx, y + 2, bw, 7, mix(BORDER, '#ffffff', 0.4), 3.5);
      rect(bx, y + 2, Math.max(2, (bw * Math.min(100, pct)) / 100), 7, hex(tone), 3.5);
      text(`${inr(b.spent)} of ${inr(b.limit_inr)}`, W - M - 50, y, 9, f.r, INK, { align: 'right' });
      text(over ? 'Over' : d.isCurrent ? `${pct}%` : 'Kept', W - M, y, 9, f.b, tone, { align: 'right' });
      y += 22;
    }
  }

  // ---------- goals & achievements ----------
  const goals: any[] = d.goals ?? [];
  if (goals.length || d.badges?.length || d.coinsEarned) {
    heading('Goals & achievements');
    for (const g of goals) {
      ensure(30);
      const pct = Math.min(100, Math.round((g.saved_inr / Math.max(1, g.target_inr)) * 100));
      text(g.name, M, y, 9.5, f.s, INK, { maxW: 150 });
      text(g.status === 'completed' ? 'Completed' : 'In progress', M, y + 12, 7.5, f.r, g.status === 'completed' ? GOOD : MUTED);
      const bx = M + 160;
      const bw = CW - 160 - 150;
      rect(bx, y + 2, bw, 7, mix(BORDER, '#ffffff', 0.4), 3.5);
      rect(bx, y + 2, Math.max(2, (bw * pct) / 100), 7, hex(g.status === 'completed' ? GOOD : A), 3.5);
      text(`${inr(g.saved_inr)} of ${inr(g.target_inr)}`, W - M - 34, y, 9, f.r, INK, { align: 'right' });
      text(`${pct}%`, W - M, y, 9, f.b, g.status === 'completed' ? GOOD : A, { align: 'right' });
      y += 28;
    }
    ensure(30);
    const ach = [`${Number(d.coinsEarned).toLocaleString('en-IN')} coins earned`, `${d.weeks.hit} of ${d.weeks.total} weekly targets hit`, d.badges?.length ? `Badges: ${d.badges.map((b: any) => clean(b.name)).join(', ')}` : null].filter(Boolean) as string[];
    for (const l of wrap(ach.join('   ·   '), f.r, 9, CW)) {
      text(l, M, y, 9, f.r, MUTED);
      y += 13;
    }
  }

  // ---------- footer on every page ----------
  const gen = opts.generatedOn ?? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
  pages.forEach((p, i) => {
    page = p;
    line(M, H - 40, W - M, H - 40, BORDER, 0.5);
    text(`Generated ${gen} · Wealthwise gives spending insights, not investment, tax or financial advice.`, M, H - 32, 7.5, f.r, MUTED);
    text(`Page ${i + 1} of ${pages.length}`, W - M, H - 32, 7.5, f.r, MUTED, { align: 'right' });
  });

  return doc.save();
}

/** Browser: build the PDF and save it to the device. */
export async function downloadReportPdf(d: any) {
  const load = async (name: string) => {
    const r = await fetch(`/fonts/${name}`);
    if (!r.ok) throw new Error('Could not load fonts');
    return new Uint8Array(await r.arrayBuffer());
  };
  const [regular, semibold, bold] = await Promise.all([load(FONT_FILES.regular), load(FONT_FILES.semibold), load(FONT_FILES.bold)]);
  const bytes = await buildReportPdf(d, { regular, semibold, bold });
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wealthwise-report-${d.monthKey}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
