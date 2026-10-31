import { Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api';
import { Empty, Field, Loading, Modal, PageHeader, useAsync, useToast } from '../../components/ui';
import { useI18n } from '../../i18n';

export default function Plans() {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const { data, reload } = useAsync(() => api('/admin/plans'), []);
  const [edit, setEdit] = useState<any>(null);
  const [f, setF] = useState<any>({});
  function open(p: any) {
    setF(p ?? { name: '', price: 0, messageQuota: 1000, sessionLimit: 1, durationDays: 30, active: true });
    setEdit(p ?? {});
  }
  async function save() {
    const body = { name: f.name, price: Number(f.price), messageQuota: Number(f.message_quota ?? f.messageQuota), sessionLimit: Number(f.session_limit ?? f.sessionLimit), durationDays: Number(f.duration_days ?? f.durationDays), active: f.active ?? true };
    try {
      if (f.id) await api(`/admin/plans/${f.id}`, { method: 'PUT', body });
      else await api('/admin/plans', { body });
      setEdit(null);
      void reload();
    } catch (e) {
      toast.err(e);
    }
  }
  return (
    <>
      <PageHeader title={t('plans')} actions={<button className="btn-primary" onClick={() => open(null)}><Plus size={16} /> {t('newPlan')}</button>} />
      {!data ? <Loading /> : !data.length ? <div className="card"><Empty icon={<Package size={36} />} /></div> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((p: any) => (
            <div key={p.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div className="font-semibold">{p.name}</div>
                <div className="flex gap-1"><button className="btn-ghost !p-1.5" onClick={() => open(p)}><Pencil size={14} /></button><button className="btn-danger !p-1.5" onClick={async () => { if (!confirm(t('confirmDelete'))) return; await api(`/admin/plans/${p.id}`, { method: 'DELETE' }); void reload(); }}><Trash2 size={14} /></button></div>
              </div>
              <div className="mt-3 text-3xl font-bold">{fmt(p.price)}<span className="text-sm font-normal text-slate-500"> / {fmt(p.duration_days)}d</span></div>
              <div className="mt-4 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                <div className="flex justify-between"><span className="text-slate-500">{t('messageQuota')}</span><b>{fmt(p.message_quota)}</b></div>
                <div className="flex justify-between"><span className="text-slate-500">{t('sessionLimit')}</span><b>{fmt(p.session_limit)}</b></div>
                <div className="flex justify-between"><span className="text-slate-500">{t('tenants')}</span><b>{fmt(p.tenants)}</b></div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={f.id ? t('edit') : t('newPlan')}>
        <div className="space-y-4">
          <Field label={t('name')}><input className="input" value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('price')}><input className="input" type="number" value={f.price ?? 0} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
            <Field label={t('durationDays')}><input className="input" type="number" value={f.duration_days ?? f.durationDays ?? 30} onChange={(e) => setF({ ...f, durationDays: e.target.value, duration_days: e.target.value })} /></Field>
            <Field label={t('messageQuota')}><input className="input" type="number" value={f.message_quota ?? f.messageQuota ?? 0} onChange={(e) => setF({ ...f, messageQuota: e.target.value, message_quota: e.target.value })} /></Field>
            <Field label={t('sessionLimit')}><input className="input" type="number" value={f.session_limit ?? f.sessionLimit ?? 1} onChange={(e) => setF({ ...f, sessionLimit: e.target.value, session_limit: e.target.value })} /></Field>
          </div>
          <button className="btn-primary w-full" disabled={!f.name} onClick={save}>{t('save')}</button>
        </div>
      </Modal>
    </>
  );
}
