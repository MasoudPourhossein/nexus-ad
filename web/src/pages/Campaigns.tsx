import { ArrowLeft, ArrowRight, Ban, Download, Megaphone, Pause, Play, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, download } from '../api';
import { Bubble, cleanMsg, MessageEditor, type Msg } from '../components/MessageEditor';
import { Empty, Field, Loading, Modal, PageHeader, Phone, Progress, StatusBadge, Tabs, Toggle, pct, useAsync, useToast } from '../components/ui';
import { useI18n } from '../i18n';
import { ChartTooltip, Funnel } from './Dashboard';

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const sessions = useAsync(() => api('/sessions'), []);
  const lists = useAsync(() => api('/lists'), []);
  const [name, setName] = useState('');
  const [sessionId, setSessionId] = useState<number | ''>('');
  const [listId, setListId] = useState<number | ''>('');
  const [msg, setMsg] = useState<Msg>({ type: 'text', text: '' });
  const [checkExists, setCheckExists] = useState(true);
  const [start, setStart] = useState(true);
  const [override, setOverride] = useState(false);
  const [rate, setRate] = useState(20);
  const [cap, setCap] = useState(50000);
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    try {
      await api('/campaigns', { body: { name, sessionId: Number(sessionId), listId: Number(listId), message: cleanMsg(msg), checkExists, start, ...(override ? { ratePerMinute: Number(rate), dailyCap: Number(cap) } : {}) } });
      onCreated();
    } catch (e) {
      toast.err(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={t('newCampaign')} wide>
      <div className="grid gap-6 md:grid-cols-5">
        <div className="space-y-4 md:col-span-3">
          <Field label={t('name')}><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('session')}>
              <select className="input" value={sessionId} onChange={(e) => setSessionId(Number(e.target.value))}>
                <option value="">—</option>
                {sessions.data?.map((s: any) => <option key={s.id} value={s.id}>{s.label} ({t(s.status)})</option>)}
              </select>
            </Field>
            <Field label={t('list')}>
              <select className="input" value={listId} onChange={(e) => setListId(Number(e.target.value))}>
                <option value="">—</option>
                {lists.data?.map((l: any) => <option key={l.id} value={l.id}>{l.name} ({fmt(l.contacts)})</option>)}
              </select>
            </Field>
          </div>
          <MessageEditor value={msg} onChange={setMsg} />
          <div className="space-y-3 rounded-xl bg-slate-50 p-4 dark:bg-white/[0.03]">
            <Toggle checked={checkExists} onChange={setCheckExists} label={t('checkExists')} />
            <Toggle checked={start} onChange={setStart} label={t('startNow')} />
            <Toggle checked={override} onChange={setOverride} label={t('overrideRate')} />
            {override && (
              <div className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 dark:border-white/5">
                <Field label={t('ratePerMinute')}><input className="input" type="number" min={1} max={600} value={rate} onChange={(e) => setRate(Number(e.target.value))} /></Field>
                <Field label={t('dailyCap')}><input className="input" type="number" min={0} value={cap} onChange={(e) => setCap(Number(e.target.value))} /></Field>
              </div>
            )}
          </div>
        </div>
        <div className="md:col-span-2">
          <div className="label">{t('preview')}</div>
          <Bubble m={msg} />
        </div>
      </div>
      <button className="btn-primary mt-6 w-full !py-3" disabled={busy || !name || !sessionId || !listId || (msg.type === 'text' ? !msg.text : !msg.mediaUrl)} onClick={create}>
        <Megaphone size={16} /> {t('create')}
      </button>
    </Modal>
  );
}

function Detail({ id, onBack }: { id: number; onBack: () => void }) {
  const { t, dir, fmt, date } = useI18n();
  const toast = useToast();
  const [filter, setFilter] = useState<string>('all');
  const { data, reload } = useAsync(() => api(`/campaigns/${id}`), [id], 5000);
  const msgs = useAsync(() => api(`/campaigns/${id}/messages?limit=100${filter === 'all' ? '' : `&status=${filter}`}`), [id, filter], 5000);
  const Back = dir === 'rtl' ? ArrowRight : ArrowLeft;
  if (!data) return <Loading />;
  const f = data.funnel;
  async function act(a: string) {
    try {
      await api(`/campaigns/${id}/${a}`, { method: 'POST' });
      void reload();
    } catch (e) {
      toast.err(e);
    }
  }
  return (
    <>
      <PageHeader
        title={data.name}
        subtitle={date(data.created_at)}
        actions={
          <>
            {data.status === 'draft' && <button className="btn-primary" onClick={() => act('start')}><Play size={16} /> {t('start')}</button>}
            {data.status === 'running' && <button className="btn-outline" onClick={() => act('pause')}><Pause size={16} /> {t('pause')}</button>}
            {data.status === 'paused' && <button className="btn-primary" onClick={() => act('resume')}><Play size={16} /> {t('resume')}</button>}
            {['draft', 'running', 'paused'].includes(data.status) && <button className="btn-danger" onClick={() => confirm(t('confirmDelete')) && act('cancel')}><Ban size={16} /> {t('cancel')}</button>}
            <button className="btn-outline" onClick={onBack}><Back size={16} /> {t('back')}</button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <StatusBadge status={data.status} />
        {data.pause_reason && <span className="badge bg-amber-500/10 text-amber-600">{t(data.pause_reason)}</span>}
        <div className="min-w-[200px] flex-1"><Progress value={f.total - f.queued} total={f.total} /></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5">
          <div className="mb-5 text-sm font-semibold">{t('funnel')}</div>
          <Funnel steps={[
            { label: t('total' as any) === 'total' ? `${t('contacts')}` : t('contacts'), value: f.total, color: 'linear-gradient(90deg,#475569,#64748b)' },
            { label: t('sent'), value: f.sent, color: 'linear-gradient(90deg,#64748b,#94a3b8)' },
            { label: t('delivered'), value: f.delivered, color: 'linear-gradient(90deg,#0ea5e9,#38bdf8)' },
            { label: t('read'), value: f.read, color: 'linear-gradient(90deg,#8b5cf6,#a78bfa)' },
            { label: t('replied'), value: f.replied, color: 'linear-gradient(90deg,#10b981,#34d399)' },
          ]} />
          <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-xl bg-rose-500/10 py-2"><div className="text-slate-500">{t('failed')}</div><div className="font-bold">{fmt(f.failed)}</div></div>
            <div className="rounded-xl bg-rose-500/10 py-2"><div className="text-slate-500">{t('invalid')}</div><div className="font-bold">{fmt(f.invalid)}</div></div>
            <div className="rounded-xl bg-amber-500/10 py-2"><div className="text-slate-500">{t('opted_out')}</div><div className="font-bold">{fmt(f.opted_out)}</div></div>
          </div>
        </div>
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 text-sm font-semibold">{t('hourly')}</div>
          <div className="h-60 ltr">
            <ResponsiveContainer>
              <BarChart data={data.hourly.map((h: any) => ({ ...h, label: h.hour.slice(11, 16) }))} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-white/5" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,.08)' }} />
                <Bar dataKey="sent" name={t('sent')} fill="#10b981" radius={[6, 6, 0, 0]} />
                <Bar dataKey="replied" name={t('replied')} fill="#38bdf8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {data.leads.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-xs font-medium text-slate-500">{t('leadsByTag')}</div>
              <div className="flex flex-wrap gap-2">
                {data.leads.map((l: any) => (
                  <span key={l.tag} className="badge bg-brand-500/15 px-3 py-1 text-brand-700 dark:text-brand-300">#{l.tag} · {fmt(l.count)} <span className="opacity-70">({pct(l.count, f.sent)})</span></span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="card mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-3 dark:border-white/5">
          <Tabs value={filter} onChange={setFilter} items={['all', 'queued', 'sent', 'delivered', 'read', 'replied', 'failed', 'invalid'].map((v) => ({ value: v, label: t(v) }))} />
        </div>
        {!msgs.data ? <Loading /> : !msgs.data.length ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>{t('phone')}</th><th>{t('status')}</th><th>{t('sent')}</th><th>{t('delivered')}</th><th>{t('read')}</th><th>{t('replied')}</th></tr></thead>
              <tbody>
                {msgs.data.map((m: any) => (
                  <tr key={m.id}>
                    <td><Phone value={m.display} /></td>
                    <td><StatusBadge status={m.status} />{m.error && <div className="mt-1 max-w-[220px] truncate text-[11px] text-rose-400" title={m.error}>{m.error}</div>}</td>
                    <td className="text-xs text-slate-500">{date(m.sent_at)}</td>
                    <td className="text-xs text-slate-500">{date(m.delivered_at)}</td>
                    <td className="text-xs text-slate-500">{date(m.read_at)}</td>
                    <td className="text-xs text-slate-500">{date(m.replied_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="mt-3 flex justify-end">
        <button className="btn-ghost text-xs" onClick={() => download(`/leads.csv`, 'leads.csv')}><Download size={14} /> {t('exportCsv')}</button>
      </div>
    </>
  );
}

export default function Campaigns() {
  const { t, fmt, date } = useI18n();
  const toast = useToast();
  const { data, reload } = useAsync(() => api('/campaigns'), [], 6000);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  if (open) return <Detail id={open} onBack={() => { setOpen(null); void reload(); }} />;
  return (
    <>
      <PageHeader title={t('campaigns')} actions={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> {t('newCampaign')}</button>} />
      {!data ? <Loading /> : !data.length ? <div className="card"><Empty icon={<Megaphone size={36} />} /></div> : (
        <div className="space-y-3">
          {data.map((c: any) => (
            <div key={c.id} className="card cursor-pointer p-5 transition hover:border-brand-500/30" onClick={() => setOpen(c.id)}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="truncate font-semibold">{c.name}</span><StatusBadge status={c.status} /></div>
                  <div className="mt-1 text-xs text-slate-500">{c.session_label} · {c.list_name} · {date(c.created_at)}</div>
                </div>
                <div className="flex items-center gap-5 text-center text-xs">
                  {([['sent', c.sent], ['delivered', c.delivered], ['read', c.read], ['replied', c.replied], ['leads', c.leads]] as const).map(([k, v]) => (
                    <div key={k}><div className="text-slate-500">{t(k)}</div><div className="mt-0.5 text-base font-bold tabular-nums">{fmt(v)}</div></div>
                  ))}
                  {c.status !== 'running' && (
                    <button className="btn-danger !p-2" onClick={async (e) => { e.stopPropagation(); if (!confirm(t('confirmDelete'))) return; try { await api(`/campaigns/${c.id}`, { method: 'DELETE' }); void reload(); } catch (er) { toast.err(er); } }}><Trash2 size={15} /></button>
                  )}
                </div>
              </div>
              <div className="mt-4"><Progress value={c.total - c.queued} total={c.total} /></div>
            </div>
          ))}
        </div>
      )}
      {creating && <CreateModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); void reload(); }} />}
    </>
  );
}
