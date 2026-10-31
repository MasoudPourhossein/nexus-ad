import { Ban, Building2, CheckCircle2, Coins, KeyRound, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api';
import { Empty, Field, Loading, Modal, PageHeader, useAsync, useToast } from '../../components/ui';
import { useI18n } from '../../i18n';

export default function Tenants() {
  const { t, fmt, date } = useI18n();
  const toast = useToast();
  const { data, reload } = useAsync(() => api('/admin/tenants'), []);
  const plans = useAsync(() => api('/admin/plans'), []);
  const [creating, setCreating] = useState(false);
  const [credit, setCredit] = useState<any>(null);
  const [form, setForm] = useState<any>({ name: '', email: '', password: '', role: 'user', credits: 0, sessionLimit: 1 });
  const [amount, setAmount] = useState(1000);
  async function create() {
    try {
      await api('/admin/tenants', { body: { ...form, credits: Number(form.credits), sessionLimit: Number(form.sessionLimit) } });
      setCreating(false);
      setForm({ name: '', email: '', password: '', role: 'user', credits: 0, sessionLimit: 1 });
      void reload();
    } catch (e) {
      toast.err(e);
    }
  }
  return (
    <>
      <PageHeader title={t('tenants')} actions={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> {t('newTenant')}</button>} />
      <div className="card overflow-hidden">
        {!data ? <Loading /> : !data.length ? <Empty icon={<Building2 size={36} />} /> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>{t('name')}</th><th>{t('plan')}</th><th>{t('credits')}</th><th>{t('sessions')}</th><th>{t('sent')}</th><th>{t('expires')}</th><th>{t('status')}</th><th /></tr></thead>
              <tbody>
                {data.map((u: any) => (
                  <tr key={u.id}>
                    <td><div className="font-medium">{u.name} {u.role === 'admin' && <span className="badge bg-violet-500/15 text-violet-500">admin</span>}</div><div className="ltr text-xs text-slate-500">{u.email}</div></td>
                    <td className="text-sm">{u.plan_name ?? '—'}</td>
                    <td className="font-semibold tabular-nums">{u.role === 'admin' ? '∞' : fmt(u.credits)}</td>
                    <td className="tabular-nums">{fmt(u.sessions)}{u.session_limit !== null && <span className="text-slate-400"> / {fmt(u.session_limit)}</span>}</td>
                    <td className="tabular-nums">{fmt(u.sent)}</td>
                    <td className="text-xs text-slate-500">{u.plan_expires_at ? date(u.plan_expires_at, false) : '—'}</td>
                    <td>{u.active ? <CheckCircle2 size={16} className="text-brand-500" /> : <Ban size={16} className="text-rose-500" />}</td>
                    <td className="text-end">
                      <div className="flex justify-end gap-1">
                        {plans.data?.length > 0 && (
                          <select className="input !w-auto !py-1 text-xs" value="" onChange={async (e) => { if (!e.target.value) return; await api(`/admin/tenants/${u.id}/plan`, { body: { planId: Number(e.target.value) } }); void reload(); }}>
                            <option value="">{t('assignPlan')}</option>
                            {plans.data.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        )}
                        <button className="btn-ghost !p-1.5" title={t('addCredits')} onClick={() => setCredit(u)}><Coins size={15} /></button>
                        {u.role !== 'admin' && <button className="btn-ghost !p-1.5" title={u.active ? t('deactivate') : t('activate')} onClick={async () => { await api(`/admin/tenants/${u.id}`, { method: 'PATCH', body: { active: !u.active } }); void reload(); }}><KeyRound size={15} /></button>}
                        {u.role !== 'admin' && <button className="btn-danger !p-1.5" onClick={async () => { if (!confirm(t('confirmDelete'))) return; await api(`/admin/tenants/${u.id}`, { method: 'DELETE' }); void reload(); }}><Trash2 size={15} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal open={creating} onClose={() => setCreating(false)} title={t('newTenant')}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('name')}><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label={t('role')}><select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="user">{t('user')}</option><option value="admin">admin</option></select></Field>
          </div>
          <Field label={t('email')}><input className="input ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label={t('password')}><input className="input ltr" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('credits')}><input className="input" type="number" value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} /></Field>
            <Field label={t('sessionLimit')}><input className="input" type="number" value={form.sessionLimit} onChange={(e) => setForm({ ...form, sessionLimit: e.target.value })} /></Field>
          </div>
          <button className="btn-primary w-full" disabled={!form.name || !form.email || form.password.length < 8} onClick={create}>{t('create')}</button>
        </div>
      </Modal>
      <Modal open={!!credit} onClose={() => setCredit(null)} title={`${t('addCredits')} — ${credit?.name}`}>
        <div className="space-y-4">
          <Field label={t('amount')}><input className="input" type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
          <button className="btn-primary w-full" onClick={async () => { await api(`/admin/tenants/${credit.id}/credits`, { body: { amount: Number(amount) } }); setCredit(null); void reload(); }}>{t('save')}</button>
        </div>
      </Modal>
    </>
  );
}
