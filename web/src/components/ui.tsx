import clsx from 'clsx';
import { Loader2, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '../api';
import { useI18n } from '../i18n';

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = [], pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    try {
      setData(await fn());
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    setLoading(true);
    void reload();
    if (!pollMs) return;
    const id = setInterval(() => void reload(), pollMs);
    return () => clearInterval(id);
  }, [reload, pollMs]);
  return { data, error, loading, reload, setData };
}

type Toast = { id: number; text: string; kind: 'ok' | 'err' };
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'err') => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, kind }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
        {items.map((i) => (
          <div key={i.id} className={clsx('rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-xl', i.kind === 'ok' ? 'bg-brand-600' : 'bg-rose-600')}>
            {i.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastCtx);
  const { t } = useI18n();
  return {
    ok: (text: string) => push(text, 'ok'),
    err: (e: unknown) => push(e instanceof ApiError ? t(e.code) : String((e as any)?.message ?? e), 'err'),
  };
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
      <div className={clsx('card max-h-[92vh] w-full overflow-y-auto rounded-b-none p-6 sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg', 'dark:bg-ink-900')} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button className="btn-ghost !p-2" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

export function Stat({ label, value, icon, accent = 'brand', hint }: { label: string; value: ReactNode; icon: ReactNode; accent?: 'brand' | 'sky' | 'violet' | 'amber' | 'rose'; hint?: ReactNode }) {
  const colors = {
    brand: 'from-brand-500/20 to-brand-500/0 text-brand-600 dark:text-brand-400',
    sky: 'from-sky-500/20 to-sky-500/0 text-sky-600 dark:text-sky-400',
    violet: 'from-violet-500/20 to-violet-500/0 text-violet-600 dark:text-violet-400',
    amber: 'from-amber-500/20 to-amber-500/0 text-amber-600 dark:text-amber-400',
    rose: 'from-rose-500/20 to-rose-500/0 text-rose-600 dark:text-rose-400',
  }[accent];
  return (
    <div className="card relative overflow-hidden p-5">
      <div className={clsx('absolute -end-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br blur-2xl', colors)} />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
          <div className="mt-2 text-2xl font-bold tracking-tight">{value}</div>
          {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
        </div>
        <div className={clsx('rounded-xl bg-gradient-to-br p-2.5', colors)}>{icon}</div>
      </div>
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  WORKING: 'bg-brand-500/15 text-brand-700 dark:text-brand-300',
  running: 'bg-brand-500/15 text-brand-700 dark:text-brand-300',
  done: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  delivered: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  read: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  replied: 'bg-brand-500/15 text-brand-700 dark:text-brand-300',
  sent: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
  SCAN_QR_CODE: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  STARTING: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  paused: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  queued: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  FAILED: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  failed: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  invalid: 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
  opted_out: 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const pulse = status === 'running' || status === 'STARTING' || status === 'sending';
  return (
    <span className={clsx('badge', STATUS_STYLE[status] ?? 'bg-slate-500/10 text-slate-600 dark:text-slate-300')}>
      <span className={clsx('h-1.5 w-1.5 rounded-full bg-current', pulse && 'animate-pulse')} />
      {t(status)}
    </span>
  );
}

export function Spinner() {
  return <Loader2 className="animate-spin text-brand-500" size={22} />;
}

export function Loading() {
  return <div className="flex justify-center py-16"><Spinner /></div>;
}

export function Empty({ text, icon }: { text?: string; icon?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-slate-400">
      {icon}
      <div className="text-sm">{text ?? t('empty')}</div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-3 text-sm">
      <span className={clsx('relative h-6 w-11 rounded-full transition', checked ? 'bg-brand-500' : 'bg-slate-300 dark:bg-ink-600')}>
        <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'start-[22px]' : 'start-0.5')} />
      </span>
      {label}
    </button>
  );
}

export function Progress({ value, total }: { value: number; total: number }) {
  const pct = total ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-teal-400 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-end text-xs tabular-nums text-slate-500">{pct}%</span>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-white/5">
      {items.map((i) => (
        <button key={i.value} onClick={() => onChange(i.value)} className={clsx('rounded-lg px-3.5 py-1.5 text-sm font-medium transition', value === i.value ? 'bg-white shadow-sm dark:bg-ink-700' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200')}>
          {i.label}
        </button>
      ))}
    </div>
  );
}

export function Phone({ value }: { value: string }) {
  return <span className="ltr font-mono text-[13px] tabular-nums">{value}</span>;
}

export function pct(n: number, d: number): string {
  return d ? `${Math.round((n / d) * 100)}%` : '0%';
}
