'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Loader2, X } from 'lucide-react';
import React from 'react';

export const cn = (...a: any[]) => twMerge(clsx(a));

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
};
export const Button = React.forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, children, disabled, ...p },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        variant === 'primary' && 'bg-primary text-primary-fg hover:opacity-90 shadow-sm',
        variant === 'secondary' && 'bg-soft text-fg hover:bg-primary-soft',
        variant === 'outline' && 'border border-border bg-card hover:bg-soft',
        variant === 'ghost' && 'hover:bg-soft text-fg',
        variant === 'danger' && 'bg-bad text-white hover:opacity-90',
        size === 'sm' && 'h-8 px-3 text-sm',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-12 px-6 text-base',
        size === 'icon' && 'h-10 w-10',
        className,
      )}
      {...p}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border border-border bg-card p-4 sm:p-5', className)} {...p} />;
}

export function CardTitle({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-2', className)}>
      <h3 className="text-sm font-semibold text-fg">{children}</h3>
      {action}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...p },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full rounded-xl border bg-card px-3 text-[15px] text-fg placeholder:text-muted/70 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20',
        invalid ? 'border-warn bg-warn/5 ring-2 ring-warn/25' : 'border-border',
        className,
      )}
      {...p}
    />
  );
});

export function Textarea({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn('w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20', className)}
      {...p}
    />
  );
}

export function Select({ className, invalid, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select
      className={cn(
        'h-11 w-full appearance-none rounded-xl border bg-card px-3 text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20',
        invalid ? 'border-warn ring-2 ring-warn/25' : 'border-border',
        className,
      )}
      style={{ backgroundImage: 'linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%)', backgroundPosition: 'calc(100% - 18px) 50%, calc(100% - 13px) 50%', backgroundSize: '5px 5px', backgroundRepeat: 'no-repeat' }}
      {...p}
    />
  );
}

export function Label({ children, hint, className }: { children: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <label className={cn('mb-1.5 flex items-center justify-between text-xs font-medium text-muted', className)}>
      <span>{children}</span>
      {hint}
    </label>
  );
}

export function Chip({
  active,
  className,
  tone,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; tone?: string }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition active:scale-[.97]',
        active ? 'border-transparent text-white shadow-sm' : 'border-border bg-card text-fg hover:bg-soft',
        className,
      )}
      style={active ? { background: tone || 'var(--primary)', color: tone ? '#fff' : 'var(--primary-fg)' } : undefined}
      {...p}
    />
  );
}

export function Pill({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full bg-soft px-2 py-0.5 text-xs font-medium text-muted', className)} style={style}>{children}</span>;
}

export function Progress({ value, tone, className, height = 8 }: { value: number; tone?: string; className?: string; height?: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-soft', className)} style={{ height }} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${v}%`, background: tone || 'var(--primary)' }} />
    </div>
  );
}

export function Ring({ value, size = 120, stroke = 12, tone, children, label }: { value: number; size?: number; stroke?: number; tone?: string; children?: React.ReactNode; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--soft)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={tone || 'var(--primary)'}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          style={{ transition: 'stroke-dashoffset .8s ease' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-muted', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-soft', className)} />;
}

export function Empty({ icon, title, children, action }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      {icon && <div className="mb-3 text-3xl">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Bottom sheet on mobile, centred dialog on desktop. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in" />
        <Dialog.Content
          className={cn(
            'fixed z-50 flex max-h-[92dvh] flex-col bg-card shadow-2xl outline-none',
            'inset-x-0 bottom-0 rounded-t-3xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl',
            wide ? 'sm:w-[640px]' : 'sm:w-[480px]',
          )}
        >
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-border sm:hidden" />
          <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-3 sm:pt-5">
            <div>
              <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
              {description ? <Dialog.Description className="text-sm text-muted">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
            </div>
            <Dialog.Close className="rounded-full p-2 text-muted hover:bg-soft" aria-label="Close">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; className?: string }) {
  return (
    <div className={cn('inline-flex rounded-xl bg-soft p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn('flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition', value === o.value ? 'bg-card text-fg shadow-sm' : 'text-muted hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-6 w-11 rounded-full transition', checked ? 'bg-primary' : 'bg-border')}
    >
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition', checked ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

/** Renders **bold** and line breaks from assistant / insight text. */
export function Rich({ text, className }: { text: string; className?: string }) {
  const lines = text.split('\n');
  return (
    <div className={className}>
      {lines.map((line, i) => (
        <p key={i} className={i ? 'mt-1' : ''}>
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith('**') && part.endsWith('**') ? (
              <strong key={j} className="font-semibold text-fg">
                {part.slice(2, -2)}
              </strong>
            ) : (
              <React.Fragment key={j}>{part}</React.Fragment>
            ),
          )}
        </p>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="num mt-0.5 text-xl font-semibold" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
