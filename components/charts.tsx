'use client';
import React, { useMemo } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine,
} from 'recharts';
import { inr, inrCompact } from '@/lib/format';
import { cn } from './ui';

/**
 * Keeps the same array object while the chart's numbers are unchanged. Recharts restarts its animation when
 * it receives a new array, and a parent that re-renders often (the chat while it streams, a slider) could
 * otherwise loop: animation start → state update → re-render → new array → animation start…
 */
function useStable<T>(value: T): T {
  const key = JSON.stringify(value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => value, [key]);
}

const PALETTE = ['#0f766e', '#f97316', '#6366f1', '#db2777', '#ca8a04', '#0284c7', '#7c3aed', '#16a34a', '#dc2626', '#475569'];
const axis = { fontSize: 11, fill: 'var(--muted)' };

function TT({ active, payload, label, money = true, labelFmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-lg">
      {label != null && <p className="mb-1 font-semibold">{labelFmt ? labelFmt(label) : label}</p>}
      {payload.map((p: any) => (
        <p key={p.dataKey + p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />
          <span className="text-muted">{p.name}</span>
          <span className="num ml-auto font-semibold">{money ? inr(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

export function Donut({ data: raw, center, height = 220, animate = true }: { data: { label: string; value: number; colour?: string; emoji?: string }[]; center?: React.ReactNode; height?: number; animate?: boolean }) {
  const data = useStable(raw);
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="relative" style={{ height }} role="img" aria-label={`Breakdown: ${data.slice(0, 5).map((d) => `${d.label} ${inr(d.value)}`).join(', ')}`}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="92%" paddingAngle={1.5} stroke="none" isAnimationActive={animate}>
            {data.map((d, i) => (
              <Cell key={d.label} fill={d.colour || PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip content={<TT />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">{center ?? <div><p className="text-xs text-muted">Total</p><p className="num text-lg font-bold">{inr(total)}</p></div>}</div>
    </div>
  );
}

export function Legendish({ data, total }: { data: { label: string; value: number; colour?: string; emoji?: string }[]; total?: number }) {
  const t = total ?? data.reduce((s, d) => s + d.value, 0);
  return (
    <ul className="space-y-2">
      {data.map((d, i) => (
        <li key={d.label} className="flex items-center gap-2 text-sm">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.colour || PALETTE[i % PALETTE.length] }} />
          <span className="truncate">{d.emoji} {d.label}</span>
          <span className="num ml-auto font-medium">{inr(d.value)}</span>
          <span className="num w-10 text-right text-xs text-muted">{t ? Math.round((d.value / t) * 100) : 0}%</span>
        </li>
      ))}
    </ul>
  );
}

export function TrendChart({ data: raw, height = 220 }: { data: { day: number; cumulative: number | null; prevCumulative: number | null }[]; height?: number }) {
  const data = useStable(raw);
  return (
    <div style={{ height }} role="img" aria-label="Cumulative spend this month versus last month">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="day" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={inrCompact} width={52} />
          <Tooltip content={<TT labelFmt={(l: number) => `Day ${l}`} />} />
          <Area type="monotone" dataKey="prevCumulative" name="Last month" stroke="var(--muted)" strokeDasharray="4 4" fill="none" strokeWidth={1.5} connectNulls />
          <Area type="monotone" dataKey="cumulative" name="This month" stroke="var(--primary)" fill="url(#g1)" strokeWidth={2.5} connectNulls />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StackedMonths({ data: raw, height = 240 }: { data: any[]; height?: number }) {
  const data = useStable(raw);
  return (
    <div style={{ height }} role="img" aria-label="Month over month spend split by necessity">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={inrCompact} width={52} />
          <Tooltip content={<TT />} cursor={{ fill: 'var(--soft)' }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="necessary" name="Necessary" stackId="a" fill="#0d9488" />
          <Bar dataKey="neutral" name="Neutral" stackId="a" fill="#f59e0b" />
          <Bar dataKey="unnecessary" name="Unnecessary" stackId="a" fill="#e11d48" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Bars({ data: raw, height = 200, money = true, colour, horizontal, refLine, animate = true }: { data: { label: string; value: number; colour?: string }[]; height?: number; money?: boolean; colour?: string; horizontal?: boolean; refLine?: number; animate?: boolean }) {
  const data = useStable(raw);
  if (horizontal) {
    return (
      <div style={{ height: Math.max(height, data.length * 34) }} role="img" aria-label={data.map((d) => `${d.label} ${money ? inr(d.value) : d.value}`).join(', ')}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="label" tick={axis} tickLine={false} axisLine={false} width={110} />
            <Tooltip content={<TT money={money} />} cursor={{ fill: 'var(--soft)' }} />
            <Bar dataKey="value" name="Amount" radius={[0, 6, 6, 0]} barSize={18} isAnimationActive={animate}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.colour || colour || 'var(--primary)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }
  return (
    <div style={{ height }} role="img" aria-label={data.map((d) => `${d.label} ${money ? inr(d.value) : d.value}`).join(', ')}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval={data.length > 7 ? 'preserveStartEnd' : 0} minTickGap={6} />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={money ? inrCompact : undefined} width={money ? 52 : 32} />
          <Tooltip content={<TT money={money} />} cursor={{ fill: 'var(--soft)' }} />
          {refLine != null && <ReferenceLine y={refLine} stroke="var(--warn)" strokeDasharray="4 4" />}
          <Bar dataKey="value" name={money ? 'Amount' : 'Value'} radius={[6, 6, 0, 0]} maxBarSize={44} isAnimationActive={animate}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.colour || colour || 'var(--primary)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ScoreLine({ data: raw, height = 200 }: { data: { label: string; score: number }[]; height?: number }) {
  const data = useStable(raw);
  return (
    <div style={{ height }} role="img" aria-label="Weekly regret score">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} tick={axis} tickLine={false} axisLine={false} width={32} />
          <Tooltip content={<TT money={false} />} />
          <ReferenceLine y={20} stroke="var(--good)" strokeDasharray="4 4" />
          <Line type="monotone" dataKey="score" name="Regret score" stroke="#e11d48" strokeWidth={2.5} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const HEAT = ['var(--soft)', 'color-mix(in srgb, var(--primary) 25%, var(--card))', 'color-mix(in srgb, var(--primary) 50%, var(--card))', 'color-mix(in srgb, var(--primary) 75%, var(--card))', 'var(--primary)'];
export function Heatmap({ days, onPick }: { days: { day: string; value: number; level: number; weekend: boolean; payday: boolean }[]; onPick?: (d: string) => void }) {
  const weeks: (typeof days)[] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const months: { idx: number; label: string }[] = [];
  weeks.forEach((w, i) => {
    const first = w.find((d) => d.day.slice(8) <= '07');
    if (first && (!months.length || months[months.length - 1].label !== first.day.slice(5, 7))) months.push({ idx: i, label: first.day.slice(5, 7) });
  });
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-flex gap-1">
        <div className="mr-1 grid grid-rows-7 gap-1 pt-5 text-[10px] text-muted">
          {['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].map((d, i) => (
            <span key={i} className="h-3.5 leading-[14px] sm:h-4 sm:leading-4">{d}</span>
          ))}
        </div>
        {weeks.map((w, i) => (
          <div key={i} className="flex flex-col gap-1">
            <span className="h-4 text-[10px] text-muted">{months.find((m) => m.idx === i) ? MN[Number(months.find((m) => m.idx === i)!.label) - 1] : ''}</span>
            {w.map((d) => (
              <button
                key={d.day}
                type="button"
                onClick={() => onPick?.(d.day)}
                title={`${d.day.split('-').reverse().join('/')}: ${inr(d.value)}${d.payday ? ' · payday' : ''}`}
                aria-label={`${d.day}: ${inr(d.value)}`}
                className={cn('h-3.5 w-3.5 rounded-[4px] sm:h-4 sm:w-4', d.payday && 'ring-1 ring-coin ring-offset-1 ring-offset-card')}
                style={{ background: HEAT[d.level] }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1 text-[11px] text-muted">
        Less {HEAT.map((c, i) => <span key={i} className="h-3 w-3 rounded-[3px]" style={{ background: c }} />)} More
        <span className="ml-3 inline-flex items-center gap-1"><span className="h-3 w-3 rounded-[3px] ring-1 ring-coin" /> payday</span>
      </div>
    </div>
  );
}
