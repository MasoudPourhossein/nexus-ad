import { Activity, AlertTriangle, Link2, Plus, Power, ShieldCheck, Trash2, Zap } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api';
import { Empty, Field, Loading, Modal, PageHeader, Toggle, useAsync, useToast } from '../../components/ui';
import { useI18n } from '../../i18n';

export default function Vpn() {
  const { t, date } = useI18n();
  const toast = useToast();
  const { data, reload } = useAsync(() => api('/admin/proxy'), [], 10000);
  const [adding, setAdding] = useState(false);
  const [links, setLinks] = useState('');
  const [sub, setSub] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.err(e);
    } finally {
      setBusy(null);
      void reload();
    }
  }
  const addResultToast = (r: any) => {
    toast.ok(`+${r.added.length}${r.skipped ? ` · ${r.skipped} ${t('skipped')}` : ''}`);
    if (r.errors?.length) toast.err(r.errors[0]);
  };
  const running = data?.xray?.running;
  const installed = data?.xray?.installed !== false;
  const hasActive = data?.items?.some((p: any) => p.active);

  return (
    <>
      <PageHeader title={t('vpn')} subtitle={t('vpnHelp')} actions={
        <>
          <button className="btn-outline" disabled={!!busy || !installed} onClick={() => run('testall', async () => { await api('/admin/proxy/test-all', { method: 'POST' }); })}>
            <Activity size={16} /> {busy === 'testall' ? t('testing') : t('testAll')}
          </button>
          <button className="btn-primary" disabled={!!busy || !installed} onClick={() => run('auto', async () => { const r = await api('/admin/proxy/auto', { method: 'POST' }); toast.ok(`${t('bestPicked')}: ${r.best.name} (${r.best.ms}ms)`); })}>
            <Zap size={16} /> {busy === 'auto' ? t('testing') : t('autoBest')}
          </button>
          <button className="btn-outline" onClick={() => setAdding(true)}><Plus size={16} /> {t('addConfigs')}</button>
        </>
      } />

      {!installed && (
        <div className="card mb-4 flex items-start gap-3 border-amber-500/40 bg-amber-500/10 p-4">
          <AlertTriangle className="mt-0.5 shrink-0 text-amber-500" size={20} />
          <div><div className="font-semibold text-amber-700 dark:text-amber-300">{t('xrayMissing')}</div><div className="mt-1 text-sm text-amber-700/80 dark:text-amber-200/80">{t('xrayMissingHelp')}</div></div>
        </div>
      )}

      <div className="card mb-4 space-y-3 p-4">
        <div className="flex items-center gap-3">
          <div className={`grid h-10 w-10 place-items-center rounded-xl ${running ? 'bg-brand-500/15 text-brand-500' : 'bg-slate-500/10 text-slate-400'}`}><Zap size={20} /></div>
          <div className="flex-1"><div className="text-sm font-semibold">{running ? t('xrayRunning') : t('xrayStopped')}</div>{data?.xray?.error && <div className="text-xs text-rose-400">{data.xray.error}</div>}</div>
          {hasActive && <button className="btn-danger" disabled={!!busy} onClick={() => run('off', async () => { await api('/admin/proxy/deactivate', { method: 'POST' }); })}><Power size={16} /> {t('deactivate')}</button>}
        </div>
        <div className="border-t border-slate-100 pt-3 dark:border-white/5">
          <Toggle checked={data?.failover !== false} onChange={(v) => run('fo', async () => { await api('/admin/proxy/failover', { body: { enabled: v } }); })} label={t('failover')} />
        </div>
        <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3 dark:border-white/5">
          <div className="min-w-[260px] flex-1">
            <Field label={t('subscription')}><input className="input ltr" placeholder="https://..." value={sub || data?.subscriptionUrl || ''} onChange={(e) => setSub(e.target.value)} /></Field>
          </div>
          <button className="btn-outline" disabled={!!busy || !(sub || data?.subscriptionUrl)} onClick={() => run('sub', async () => { addResultToast(await api('/admin/proxy/subscription', { body: { url: sub || data?.subscriptionUrl } })); })}>
            <Link2 size={16} /> {busy === 'sub' ? t('loading') : t('importSub')}
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {!data ? <Loading /> : !data.items.length ? <Empty icon={<ShieldCheck size={36} />} /> : (
          <table className="table">
            <thead><tr><th>{t('name')}</th><th>Protocol</th><th>Transport</th><th>{t('latency')}</th><th /></tr></thead>
            <tbody>
              {[...data.items].sort((a: any, b: any) => (a.active ? -1 : b.active ? 1 : (a.last_test_ms ?? 1e9) - (b.last_test_ms ?? 1e9))).map((p: any) => (
                <tr key={p.id} className={p.active ? 'bg-brand-500/5' : ''}>
                  <td><div className="flex items-center gap-2 font-medium">{p.active && <span className="h-2 w-2 rounded-full bg-brand-500" />}{p.name}</div></td>
                  <td><span className="badge bg-slate-500/10 uppercase">{p.protocol}</span></td>
                  <td className="text-xs text-slate-500">{p.network}{p.security !== 'none' && ` · ${p.security}`}</td>
                  <td className="text-xs">{p.last_test_at ? (p.last_test_ok ? <span className="font-semibold text-brand-500">{p.last_test_ms} ms</span> : <span className="text-rose-500">{t('error')}</span>) : '—'}<div className="text-[10px] text-slate-400">{p.last_test_at ? date(p.last_test_at) : ''}</div></td>
                  <td className="text-end">
                    <div className="flex justify-end gap-1">
                      {!p.active && <button className="btn-outline !px-3 !py-1.5" disabled={!!busy} onClick={() => run('act', async () => { await api(`/admin/proxy/${p.id}/activate`, { method: 'POST' }); })}><Power size={14} /> {t('activate')}</button>}
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
          <button className="btn-primary w-full" disabled={!links.trim() || !!busy} onClick={() => run('add', async () => { addResultToast(await api('/admin/proxy', { body: { links } })); setLinks(''); setAdding(false); })}>{t('addConfigs')}</button>
        </div>
      </Modal>
    </>
  );
}
