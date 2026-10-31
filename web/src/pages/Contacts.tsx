import { ArrowLeft, ArrowRight, ClipboardPaste, FileUp, ListPlus, Search, Trash2, UserX, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, upload } from '../api';
import { Empty, Field, Loading, Modal, PageHeader, Phone, Progress, Spinner, Tabs, useAsync, useToast } from '../components/ui';
import { useI18n } from '../i18n';

function ImportResult({ r }: { r: any }) {
  const { t, fmt } = useI18n();
  return (
    <div className="grid grid-cols-3 gap-2 text-center text-xs">
      <div className="rounded-xl bg-brand-500/10 py-2"><div className="text-slate-500">{t('imported')}</div><div className="font-bold text-brand-600 dark:text-brand-400">{fmt(r.imported)}</div></div>
      <div className="rounded-xl bg-amber-500/10 py-2"><div className="text-slate-500">{t('duplicates')}</div><div className="font-bold">{fmt(r.duplicates)}</div></div>
      <div className="rounded-xl bg-rose-500/10 py-2"><div className="text-slate-500">{t('invalidRows')}</div><div className="font-bold">{fmt(r.invalid)}</div></div>
    </div>
  );
}

function ImportModal({ list, onClose }: { list: any; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const [tab, setTab] = useState<'csv' | 'paste'>('csv');
  const [pctv, setPct] = useState<number | null>(null);
  const [job, setJob] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [text, setText] = useState('');
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  function poll(jobId: string) {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(async () => {
      try {
        const j = await api(`/import-jobs/${jobId}`);
        setJob(j);
        if (j.status !== 'running') {
          if (timer.current) clearInterval(timer.current);
          if (j.status === 'failed') toast.err(new Error(j.error || t('importFailed')));
        }
      } catch {
        /* keep polling */
      }
    }, 1500);
  }

  async function send(file: File) {
    setResult(null);
    setJob(null);
    setPct(0);
    try {
      const r = await upload(`/lists/${list.id}/import`, file, setPct);
      setPct(null);
      if (r.jobId) {
        setJob({ status: 'running', rows: 0, imported: 0, invalid: 0, duplicates: 0 });
        poll(r.jobId);
      } else {
        setResult(r);
      }
    } catch (e) {
      toast.err(e);
      setPct(null);
    }
  }
  async function paste() {
    try {
      setResult(await api(`/lists/${list.id}/contacts`, { body: { text } }));
      setText('');
    } catch (e) {
      toast.err(e);
    }
  }
  return (
    <Modal open onClose={onClose} title={`${t('importCsv')} — ${list.name}`}>
      <div className="space-y-4">
        <Tabs value={tab} onChange={setTab} items={[{ value: 'csv', label: 'CSV' }, { value: 'paste', label: t('pasteNumbers') }]} />
        {tab === 'csv' ? (
          <>
            <div
              onClick={() => input.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void send(f); }}
              className={`flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition ${drag ? 'border-brand-500 bg-brand-500/5' : 'border-slate-200 hover:border-brand-400 dark:border-white/10'}`}
            >
              <FileUp size={32} className="text-brand-500" />
              <div className="text-sm font-medium">{t('dropCsv')}</div>
              <div className="max-w-xs text-xs text-slate-500">{t('csvHelp')}</div>
              <input ref={input} type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void send(f); e.target.value = ''; }} />
            </div>
            {pctv !== null && <div><div className="mb-1 text-xs text-slate-500">upload</div><Progress value={pctv} total={100} /></div>}
            {job && (
              <div className="space-y-2 rounded-xl bg-slate-50 p-4 dark:bg-white/[0.03]">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {job.status === 'running' && <Spinner />}
                  {job.status === 'running' ? t('importing') : job.status === 'done' ? t('importDone') : t('importFailed')}
                </div>
                <div className="text-xs text-slate-500">{fmt(job.rows)} {t('rowsRead')}</div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-brand-500/10 py-2"><div className="text-slate-500">{t('imported')}</div><div className="font-bold text-brand-600 dark:text-brand-400">{fmt(job.imported)}</div></div>
                  <div className="rounded-lg bg-amber-500/10 py-2"><div className="text-slate-500">{t('duplicates')}</div><div className="font-bold">{fmt(job.duplicates)}</div></div>
                  <div className="rounded-lg bg-rose-500/10 py-2"><div className="text-slate-500">{t('invalidRows')}</div><div className="font-bold">{fmt(job.invalid)}</div></div>
                </div>
                {job.status === 'running' && <div className="text-xs text-slate-400">{t('keepOpen')}</div>}
                {job.error && <div className="text-xs text-rose-500">{job.error}</div>}
              </div>
            )}
          </>
        ) : (
          <>
            <Field label={t('pasteNumbers')} hint={t('pasteHelp')}>
              <textarea className="input ltr h-48 font-mono" value={text} onChange={(e) => setText(e.target.value)} placeholder={'09121234567\n09141234567'} />
            </Field>
            <button className="btn-primary w-full" disabled={!text.trim()} onClick={paste}><ClipboardPaste size={16} /> {t('add')}</button>
            {result && <ImportResult r={result} />}
          </>
        )}
      </div>
    </Modal>
  );
}

function ListView({ list, onBack }: { list: any; onBack: () => void }) {
  const { t, dir, fmt, date } = useI18n();
  const [q, setQ] = useState('');
  const [pageN, setPage] = useState(1);
  const { data, reload } = useAsync(() => api(`/lists/${list.id}/contacts?page=${pageN}&q=${encodeURIComponent(q)}`), [list.id, pageN, q]);
  const Back = dir === 'rtl' ? ArrowRight : ArrowLeft;
  return (
    <>
      <PageHeader title={list.name} subtitle={data ? `${fmt(data.total)} ${t('contacts')}` : ''} actions={<button className="btn-outline" onClick={onBack}><Back size={16} /> {t('back')}</button>} />
      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 p-3 dark:border-white/5">
          <div className="relative max-w-xs">
            <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input ps-9" placeholder={t('search')} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
        </div>
        {!data ? <Loading /> : !data.items.length ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>{t('phone')}</th><th>{t('name')}</th><th>Vars</th><th>{t('createdAt')}</th><th /></tr></thead>
              <tbody>
                {data.items.map((c: any) => (
                  <tr key={c.id}>
                    <td><Phone value={c.display} /></td>
                    <td>{c.name ?? '—'}</td>
                    <td className="max-w-xs truncate text-xs text-slate-500">{Object.entries(c.vars ?? {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—'}</td>
                    <td className="text-xs text-slate-500">{date(c.created_at, false)}</td>
                    <td className="text-end"><button className="btn-danger !p-1.5" onClick={async () => { await api(`/lists/${list.id}/contacts/${c.id}`, { method: 'DELETE' }); void reload(); }}><Trash2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 50 && (
          <div className="flex items-center justify-center gap-2 border-t border-slate-100 p-3 text-sm dark:border-white/5">
            <button className="btn-ghost" disabled={pageN === 1} onClick={() => setPage(pageN - 1)}>‹</button>
            <span className="tabular-nums">{fmt(pageN)} / {fmt(Math.ceil(data.total / 50))}</span>
            <button className="btn-ghost" disabled={pageN * 50 >= data.total} onClick={() => setPage(pageN + 1)}>›</button>
          </div>
        )}
      </div>
    </>
  );
}

function OptOuts() {
  const { t, date } = useI18n();
  const { data, reload } = useAsync(() => api('/opt-outs'), []);
  const [phone, setPhone] = useState('');
  return (
    <div className="card overflow-hidden">
      <div className="flex gap-2 border-b border-slate-100 p-3 dark:border-white/5">
        <input className="input ltr max-w-xs" placeholder="0912..." value={phone} onChange={(e) => setPhone(e.target.value)} />
        <button className="btn-outline" onClick={async () => { await api('/opt-outs', { body: { phone } }); setPhone(''); void reload(); }}><UserX size={16} /> {t('add')}</button>
      </div>
      {!data ? <Loading /> : !data.length ? <Empty /> : (
        <table className="table">
          <thead><tr><th>{t('phone')}</th><th>{t('createdAt')}</th><th /></tr></thead>
          <tbody>
            {data.map((o: any) => (
              <tr key={o.phone}>
                <td><Phone value={o.display} /></td>
                <td className="text-xs text-slate-500">{date(o.created_at)}</td>
                <td className="text-end"><button className="btn-danger !p-1.5" onClick={async () => { await api(`/opt-outs/${o.phone}`, { method: 'DELETE' }); void reload(); }}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function Contacts() {
  const { t, fmt, date } = useI18n();
  const toast = useToast();
  const [tab, setTab] = useState<'lists' | 'optout'>('lists');
  const { data, reload } = useAsync(() => api('/lists'), []);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [importing, setImporting] = useState<any>(null);
  const [viewing, setViewing] = useState<any>(null);
  if (viewing) return <ListView list={viewing} onBack={() => { setViewing(null); void reload(); }} />;
  return (
    <>
      <PageHeader title={t('contacts')} actions={tab === 'lists' && <button className="btn-primary" onClick={() => setCreating(true)}><ListPlus size={16} /> {t('newList')}</button>} />
      <div className="mb-4"><Tabs value={tab} onChange={setTab} items={[{ value: 'lists', label: t('lists') }, { value: 'optout', label: t('optOuts') }]} /></div>
      {tab === 'optout' ? <OptOuts /> : !data ? <Loading /> : !data.length ? <div className="card"><Empty icon={<Users size={36} />} /></div> : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((l: any) => (
            <div key={l.id} className="card group p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{l.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{date(l.created_at, false)}</div>
                </div>
                <button className="btn-danger !p-1.5 opacity-0 transition group-hover:opacity-100" onClick={async () => { if (!confirm(t('confirmDelete'))) return; await api(`/lists/${l.id}`, { method: 'DELETE' }); void reload(); }}><Trash2 size={15} /></button>
              </div>
              <div className="mt-4 text-3xl font-bold tracking-tight">{fmt(l.contacts)}</div>
              <div className="text-xs text-slate-500">{t('contacts')}</div>
              <div className="mt-4 flex gap-2">
                <button className="btn-outline flex-1" onClick={() => setImporting(l)}><FileUp size={15} /> {t('importCsv')}</button>
                <button className="btn-ghost" onClick={() => setViewing(l)}>{t('view')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title={t('newList')}>
        <div className="space-y-4">
          <Field label={t('name')}><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
          <button className="btn-primary w-full" disabled={!name} onClick={async () => { try { await api('/lists', { body: { name } }); setName(''); setCreating(false); void reload(); } catch (e) { toast.err(e); } }}>{t('create')}</button>
        </div>
      </Modal>
      {importing && <ImportModal list={importing} onClose={() => { setImporting(null); void reload(); }} />}
    </>
  );
}
