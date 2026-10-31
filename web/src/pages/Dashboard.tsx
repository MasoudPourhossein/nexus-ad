import { CheckCheck, Eye, MessageCircleReply, Send, Smartphone, Users, Wallet } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';
import { Loading, PageHeader, Stat, pct, useAsync } from '../components/ui';
import { useI18n } from '../i18n';

export function Funnel({ steps }: { steps: { label: string; value: number; color: string }[] }) {
  const { fmt } = useI18n();
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <div key={s.label}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-slate-500">{s.label}</span>
            <span className="font-semibold tabular-nums">
              {fmt(s.value)} {i > 0 && <span className="ms-1 font-normal text-slate-400">({pct(s.value, steps[0].value)})</span>}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(s.value / max) * 100}%`, background: s.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-xs dark:bg-ink-800">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <b className="tabular-nums">{p.value}</b>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { t, fmt, lang } = useI18n();
  const { data } = useAsync(() => api('/stats'), [], 15000);
  if (!data) return <Loading />;
  const tt = data.totals;
  const daily = data.daily.map((d: any) => ({
    ...d,
    label: new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR' : 'en-US', { month: 'short', day: 'numeric' }).format(new Date(d.day)),
  }));
  return (
    <>
      <PageHeader title={t('dashboard')} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t('credits')} value={data.credits === null ? t('unlimited') : fmt(data.credits)} icon={<Wallet size={20} />} />
        <Stat label={t('sentToday')} value={fmt(tt.sent_today)} icon={<Send size={20} />} accent="sky" hint={`${t('queued')}: ${fmt(tt.queued)}`} />
        <Stat label={t('readRate')} value={pct(tt.read_total, tt.sent_total)} icon={<Eye size={20} />} accent="violet" hint={`${t('deliveryRate')}: ${pct(tt.delivered_total, tt.sent_total)}`} />
        <Stat label={t('replyRate')} value={pct(tt.replied_total, tt.sent_total)} icon={<MessageCircleReply size={20} />} accent="amber" hint={`${t('received')}: ${fmt(tt.received_total)}`} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 text-sm font-semibold">{t('last14')}</div>
          <div className="h-72 ltr">
            <ResponsiveContainer>
              <AreaChart data={daily} margin={{ left: -20, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#10b981" stopOpacity={0.35} /><stop offset="1" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gRecv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#38bdf8" stopOpacity={0.3} /><stop offset="1" stopColor="#38bdf8" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-white/5" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="sent" name={t('sent')} stroke="#10b981" strokeWidth={2.5} fill="url(#gSent)" />
                <Area type="monotone" dataKey="received" name={t('received')} stroke="#38bdf8" strokeWidth={2.5} fill="url(#gRecv)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card p-5">
          <div className="mb-5 text-sm font-semibold">{t('funnel')}</div>
          <Funnel
            steps={[
              { label: t('sent'), value: tt.sent_total, color: 'linear-gradient(90deg,#64748b,#94a3b8)' },
              { label: t('delivered'), value: tt.delivered_total, color: 'linear-gradient(90deg,#0ea5e9,#38bdf8)' },
              { label: t('read'), value: tt.read_total, color: 'linear-gradient(90deg,#8b5cf6,#a78bfa)' },
              { label: t('replied'), value: tt.replied_total, color: 'linear-gradient(90deg,#10b981,#34d399)' },
            ]}
          />
          <div className="mt-6 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/[0.03]"><div className="text-slate-500">{t('failed')}</div><div className="mt-1 text-lg font-bold text-rose-500">{fmt(tt.failed_total)}</div></div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/[0.03]"><div className="text-slate-500">{t('optOuts')}</div><div className="mt-1 text-lg font-bold">{fmt(data.counts.opt_outs)}</div></div>
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label={t('activeSessions')} value={`${fmt(data.counts.sessions_working)} / ${fmt(data.counts.sessions)}`} icon={<Smartphone size={20} />} />
        <Stat label={t('runningCampaigns')} value={fmt(data.counts.campaigns_running)} icon={<CheckCheck size={20} />} accent="sky" />
        <Stat label={t('totalContacts')} value={fmt(data.counts.contacts)} icon={<Users size={20} />} accent="violet" />
      </div>
    </>
  );
}
