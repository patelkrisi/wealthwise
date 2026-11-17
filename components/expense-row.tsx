'use client';
import { inr, NECESSITY_COLOURS, NECESSITY_LABELS, PAYMENT_LABELS, MOODS } from '@/lib/format';
import { cn } from './ui';

export function ExpenseRow({ e, onClick, selected, onSelect, compact }: { e: any; onClick?: () => void; selected?: boolean; onSelect?: (v: boolean) => void; compact?: boolean }) {
  const mood = MOODS.find((m) => m.id === e.mood);
  return (
    <div className={cn('flex items-center gap-3 rounded-xl px-2 py-2.5 transition', onClick && 'cursor-pointer hover:bg-soft', selected && 'bg-primary-soft')} onClick={onClick}>
      {onSelect && (
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 accent-[var(--primary)]"
          checked={!!selected}
          onClick={(ev) => ev.stopPropagation()}
          onChange={(ev) => onSelect(ev.target.checked)}
          aria-label={`Select ${e.name}`}
        />
      )}
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg" style={{ background: (e.category_colour || '#94a3b8') + '22' }}>
        {e.category_emoji || '🏷️'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{e.name}</p>
        <p className="flex flex-wrap items-center gap-x-1.5 truncate text-xs text-muted">
          <span>{e.category || 'Uncategorised'}</span>
          <span>·</span>
          <span>{PAYMENT_LABELS[e.payment_mode as keyof typeof PAYMENT_LABELS]}</span>
          {!compact && e.notes && (<><span>·</span><span className="truncate">{e.notes}</span></>)}
          {e.is_recurring && <span title="Recurring">· 🔁</span>}
          {e.entry_method === 'voice' && <span title="Logged by voice">· 🎙️</span>}
          {e.entry_method === 'text' && <span title="Logged by sentence">· ✍️</span>}
          {mood && <span title={mood.label}>· {mood.emoji}</span>}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="num font-semibold">{inr(e.amount_inr)}</p>
        {e.necessity && (
          <span className="text-[11px] font-medium" style={{ color: NECESSITY_COLOURS[e.necessity as keyof typeof NECESSITY_COLOURS] }}>
            {NECESSITY_LABELS[e.necessity as keyof typeof NECESSITY_LABELS]}
          </span>
        )}
      </div>
    </div>
  );
}
