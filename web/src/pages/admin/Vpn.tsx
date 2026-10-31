import { Activity, Plus, Power, ShieldCheck, Trash2, Zap } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api';
import { Empty, Field, Loading, Modal, PageHeader, useAsync, useToast } from '../../components/ui';
import { useI18n } from '../../i18n';

export default function Vpn() {
  const { t, date } = useI18n();
  const toast = useToast();
  const { data, reload } = useAsync(() => api('/admin/proxy'), [], 10000);
  const [adding, setAdding] = useState(false);
  const [links, setLinks] = useState('');
  const [testing, setTesting] = useState(false);
  async function add() {
    try {
      const r = await api('/admin/proxy', { body: { links } });
      toast.ok(`+${r.added.length}`);
      if (r.errors.length) toast.err(r.errors[0]);
      setLinks('');
      setAdding(false);
      void reload();
    } catch (e) {
      toast.err(e);
    }
  }
  async function act(path: string) {
    try {
      const r = await api(path, { method: 'POST' });
      if (r.sessions?.failed?.length) toast.err(`${t('upstream_error')}: ${r.sessions.failed.length}`);
      else toast.ok(t('saved'));
      void reload();
    } catch (e) {
      toast.err(e);
    }
  }
  async function test() {
    setTesting(true);
    try {
      const r = await api('/admin/proxy/test', { method: 'POST' });
      if (r.ok) toast.ok(`${t('latency')}: ${r.ms}ms`);
      else toast.err(r.error ?? t('error'));
      void reload();
    } catch (e) {
      toast.err(e);
    } finally {
      setTesting(false);
    }
  }
  const running = data?.xray?.running;
  return (
    <>
      <PageHeader title={t('vpn')} subtitle={t('vpnHelp')} actions={
        <>
          <button className="btn-outline" disabled={testing} onClick={test}><Activity size={16} /> {t('test')}</button>
          <button className="btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> {t('addConfigs')}</button>
        </>
      } />
      <div className={`card mb-4 flex items-center gap-3 p-4 ${running ? 'ring-1 ring-brand-500/30' : ''}`}>
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${running ? 'bg-brand-500/15 text-brand-500' : 'bg-slate-500/10 text-slate-400'}`}><Zap size={20} /></div>
        <div className="flex-1"><div className="text-sm font-semibold">{running ? t('xrayRunning') : t('xrayStopped')}</div>{data?.xray?.error && <div className="text-xs text-rose-400">{data.xray.error}</div>}</div>
        {data?.items?.some((p: any) => p.active) && <button className="btn-danger" onClick={() => act('/admin/proxy/deactivate')}><Power size={16} /> {t('deactivate')}</button>}
      </div>
      <div className="card overflow-hidden">
        {!data ? <Loading /> : !data.items.length ? <Empty icon={<ShieldCheck size={36} />} /> : (
          <table className="table">
            <thead><tr><th>{t('name')}</th><th>Protocol</th><th>Transport</th><th>{t('test')}</th><th /></tr></thead>
            <tbody>
              {data.items.map((p: any) => (
                <tr key={p.id} className={p.active ? 'bg-brand-500/5' : ''}>
                  <td><div className="flex items-center gap-2 font-medium">{p.active && <span className="h-2 w-2 rounded-full bg-brand-500" />}{p.name}</div></td>
                  <td><span className="badge bg-slate-500/10 uppercase">{p.protocol}</span></td>
                  <td className="text-xs text-slate-500">{p.network}{p.security !== 'none' && ` · ${p.security}`}</td>
                  <td className="text-xs">{p.last_test_at ? (p.last_test_ok ? <span className="text-brand-500">{p.last_test_ms}ms</span> : <span className="text-rose-500">{t('error')}</span>) : '—'}</td>
                  <td className="text-end">
                    <div className="flex justify-end gap-1">
                      {!p.active && <button className="btn-outline !px-3 !py-1.5" onClick={() => act(`/admin/proxy/${p.id}/activate`)}><Power size={14} /> {t('activate')}</button>}
                      <button className="btn-danger !p-1.5" onClick={async () => { if (!confirm(t('confirmDelete'))) return; await api(`/admin/proxy/${p.id}`, { method: 'DELETE' }); void reload(); }}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Modal open={adding} onClose={() => setAdding(false)} title={t('addConfigs')}>
        <div className="space-y-4">
          <Field label="vless / vmess / ss / trojan" hint={t('vpnHelp')}>
            <textarea className="input ltr h-40 font-mono text-xs" value={links} onChange={(e) => setLinks(e.target.value)} placeholder={'vless://...\nvmess://...\nss://...'} />
          </Field>
          <button className="btn-primary w-full" disabled={!links.trim()} onClick={add}>{t('addConfigs')}</button>
        </div>
      </Modal>
    </>
  );
}
