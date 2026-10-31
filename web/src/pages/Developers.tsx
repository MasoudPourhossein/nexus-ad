import { Check, Code2, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api, API } from '../api';
import { Empty, Field, Loading, Modal, PageHeader, useAsync, useToast } from '../components/ui';
import { useI18n } from '../i18n';

function Copyable({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="btn-ghost !p-1.5" onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}>
      {done ? <Check size={14} className="text-brand-500" /> : <Copy size={14} />}
    </button>
  );
}

function Endpoint({ method, path, desc }: { method: string; path: string; desc: string }) {
  const color = { GET: 'text-sky-500', POST: 'text-brand-500', PUT: 'text-amber-500', DELETE: 'text-rose-500', PATCH: 'text-violet-500' }[method] ?? '';
  return (
    <div className="flex items-center gap-3 border-t border-slate-100 py-2.5 text-sm dark:border-white/5">
      <span className={`w-14 shrink-0 font-mono text-xs font-bold ${color}`}>{method}</span>
      <code className="ltr font-mono text-xs">{path}</code>
      <span className="ms-auto text-xs text-slate-500">{desc}</span>
    </div>
  );
}

export default function Developers() {
  const { t } = useI18n();
  const toast = useToast();
  const { data, reload } = useAsync(() => api('/api-keys'), []);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const origin = window.location.origin + API;
  async function create() {
    try {
      const r = await api('/api-keys', { body: { name } });
      setFresh(r.key);
      setName('');
      setCreating(false);
      void reload();
    } catch (e) {
      toast.err(e);
    }
  }
  const curl = `curl -X POST "${origin}/messages" \\\n  -H "X-Api-Key: YOUR_KEY" \\\n  -H "content-type: application/json" \\\n  -d '{"sessionId":1,"phone":"0912xxxxxxx","message":{"type":"text","text":"Salam"}}'`;
  return (
    <>
      <PageHeader title={t('apiKeys')} subtitle={t('apiDocs')} actions={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> {t('newKey')}</button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 p-4 text-sm font-semibold dark:border-white/5">{t('apiKeys')}</div>
          {!data ? <Loading /> : !data.length ? <Empty icon={<KeyRound size={32} />} /> : (
            <table className="table">
              <tbody>
                {data.map((k: any) => (
                  <tr key={k.id}>
                    <td><div className="font-medium">{k.name}</div><code className="ltr text-xs text-slate-500">{k.prefix}…</code></td>
                    <td className="text-xs text-slate-500">{k.revoked ? <span className="badge bg-rose-500/10 text-rose-500">{t('revoked')}</span> : t('active')}</td>
                    <td className="text-end">{!k.revoked && <button className="btn-danger !p-1.5" onClick={async () => { await api(`/api-keys/${k.id}`, { method: 'DELETE' }); void reload(); }}><Trash2 size={14} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Code2 size={16} /> {t('apiDocs')}</div>
          <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-white/[0.03]">
            <code className="ltr truncate text-xs">{origin}</code><Copyable text={origin} />
          </div>
          <p className="mb-3 text-xs text-slate-500">Header: <code className="ltr">X-Api-Key: YOUR_KEY</code>. For n8n and AI agents, use the HTTP Request node with this header. Webhooks are posted to your URL in {t('settings')}.</p>
          <div className="relative rounded-xl bg-ink-900 p-3 dark:bg-black/40">
            <div className="absolute end-2 top-2"><Copyable text={curl} /></div>
            <pre className="ltr overflow-x-auto text-[11px] leading-relaxed text-slate-300">{curl}</pre>
          </div>
          <div className="mt-4">
            <Endpoint method="POST" path="/messages" desc="send one" />
            <Endpoint method="GET" path="/messages/:id" desc="status" />
            <Endpoint method="POST" path="/campaigns" desc="bulk" />
            <Endpoint method="GET" path="/campaigns/:id" desc="funnel" />
            <Endpoint method="POST" path="/lists/:id/contacts" desc="add" />
            <Endpoint method="GET" path="/leads" desc="leads" />
            <Endpoint method="GET" path="/sessions" desc="accounts" />
          </div>
        </div>
      </div>
      <Modal open={creating} onClose={() => setCreating(false)} title={t('newKey')}>
        <div className="space-y-4">
          <Field label={t('name')}><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
          <button className="btn-primary w-full" disabled={!name} onClick={create}>{t('create')}</button>
        </div>
      </Modal>
      <Modal open={!!fresh} onClose={() => setFresh(null)} title={t('newKey')}>
        <p className="mb-3 text-sm text-amber-600">{t('keyCreated')}</p>
        <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-white/[0.03]">
          <code className="ltr break-all text-xs">{fresh}</code><Copyable text={fresh ?? ''} />
        </div>
        <button className="btn-primary mt-4 w-full" onClick={() => setFresh(null)}>{t('close')}</button>
      </Modal>
    </>
  );
}
