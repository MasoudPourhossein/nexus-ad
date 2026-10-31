import { Bot, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api';
import { Bubble, cleanMsg, MessageEditor, type Msg } from '../components/MessageEditor';
import { Empty, Field, Loading, Modal, PageHeader, Toggle, useAsync, useToast } from '../components/ui';
import { useI18n } from '../i18n';

function Chips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  function add() {
    const v = draft.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft('');
  }
  return (
    <div className="input flex min-h-[46px] flex-wrap items-center gap-1.5 !py-1.5">
      {value.map((k) => (
        <span key={k} className="badge bg-brand-500/15 py-1 text-brand-700 dark:text-brand-300">
          {k}
          <button onClick={() => onChange(value.filter((x) => x !== k))}><X size={12} /></button>
        </span>
      ))}
      <input
        className="min-w-[80px] flex-1 bg-transparent outline-none"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
        onBlur={add}
      />
    </div>
  );
}

function Editor({ rule, onClose, onSaved }: { rule: any; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const sessions = useAsync(() => api('/sessions'), []);
  const campaigns = useAsync(() => api('/campaigns'), []);
  const [name, setName] = useState(rule.name ?? '');
  const [keywords, setKeywords] = useState<string[]>(rule.keywords ?? []);
  const [match, setMatch] = useState(rule.match ?? 'exact');
  const [reply, setReply] = useState<Msg>(rule.reply ?? { type: 'text', text: '' });
  const [tag, setTag] = useState(rule.tag ?? '');
  const [sessionId, setSessionId] = useState<number | ''>(rule.session_id ?? '');
  const [campaignId, setCampaignId] = useState<number | ''>(rule.campaign_id ?? '');
  const [active, setActive] = useState(rule.active ?? true);
  const [priority, setPriority] = useState(rule.priority ?? 0);
  async function save() {
    const body = {
      name, keywords, match, reply: cleanMsg(reply), tag: tag || null, active, priority: Number(priority),
      sessionId: sessionId === '' ? null : Number(sessionId), campaignId: campaignId === '' ? null : Number(campaignId),
    };
    try {
      if (rule.id) await api(`/rules/${rule.id}`, { method: 'PUT', body });
      else await api('/rules', { body });
      onSaved();
    } catch (e) {
      toast.err(e);
    }
  }
  return (
    <Modal open onClose={onClose} title={rule.id ? t('edit') : t('newRule')} wide>
      <div className="grid gap-6 md:grid-cols-5">
        <div className="space-y-4 md:col-span-3">
          <Field label={t('name')}><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('match')}>
              <select className="input" value={match} onChange={(e) => setMatch(e.target.value)}>
                {['exact', 'contains', 'any'].map((m) => <option key={m} value={m}>{t(m)}</option>)}
              </select>
            </Field>
            <Field label={t('priority')}><input className="input" type="number" value={priority} onChange={(e) => setPriority(e.target.value)} /></Field>
          </div>
          {match !== 'any' && <Field label={t('keywords')} hint={t('keywordsHelp')}><Chips value={keywords} onChange={setKeywords} /></Field>}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('session')}>
              <select className="input" value={sessionId} onChange={(e) => setSessionId(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">{t('allSessions')}</option>
                {sessions.data?.map((s: any) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
            <Field label={t('onlyCampaign')}>
              <select className="input" value={campaignId} onChange={(e) => setCampaignId(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">{t('allCampaigns')}</option>
                {campaigns.data?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label={t('tag')} hint={t('tagHelp')}><input className="input ltr" value={tag} onChange={(e) => setTag(e.target.value.replace(/\s/g, '_'))} placeholder="catalog" /></Field>
          <div className="label">{t('reply')}</div>
          <MessageEditor value={reply} onChange={setReply} showVars={false} />
          <Toggle checked={active} onChange={setActive} label={t('active')} />
        </div>
        <div className="space-y-3 md:col-span-2">
          <div className="label">{t('preview')}</div>
          <div className="rounded-2xl bg-[#0b141a] p-4">
            <div className="max-w-[70%] rounded-xl rounded-ss-sm bg-[#202c33] px-3 py-2 text-sm text-white">{match === 'any' ? '…' : keywords[0] ?? '1'}</div>
          </div>
          <Bubble m={reply} />
        </div>
      </div>
      <button className="btn-primary mt-6 w-full" disabled={!name || (match !== 'any' && !keywords.length)} onClick={save}>{t('save')}</button>
    </Modal>
  );
}

export default function Rules() {
  const { t, fmt } = useI18n();
  const { data, reload } = useAsync(() => api('/rules'), []);
  const [edit, setEdit] = useState<any>(null);
  return (
    <>
      <PageHeader title={t('rules')} actions={<button className="btn-primary" onClick={() => setEdit({})}><Plus size={16} /> {t('newRule')}</button>} />
      {!data ? <Loading /> : !data.length ? <div className="card"><Empty icon={<Bot size={36} />} /></div> : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((r: any) => (
            <div key={r.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-semibold">{r.name} {!r.active && <span className="badge bg-slate-500/15 text-slate-500">off</span>}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.match === 'any' ? <span className="badge bg-sky-500/15 text-sky-600 dark:text-sky-300">{t('any')}</span> : r.keywords.map((k: string) => <span key={k} className="badge bg-slate-500/10 font-mono">{k}</span>)}
                    {r.tag && <span className="badge bg-brand-500/15 text-brand-700 dark:text-brand-300">#{r.tag}</span>}
                  </div>
                </div>
                <div className="text-center"><div className="text-xs text-slate-500">{t('hits')}</div><div className="text-xl font-bold">{fmt(r.hits)}</div></div>
              </div>
              <div className="mt-3 line-clamp-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-white/[0.03] dark:text-slate-300">{r.reply?.text ?? r.reply?.mediaUrl}</div>
              <div className="mt-3 flex justify-end gap-1">
                <button className="btn-ghost !p-2" onClick={() => setEdit(r)}><Pencil size={15} /></button>
                <button className="btn-danger !p-2" onClick={async () => { if (!confirm(t('confirmDelete'))) return; await api(`/rules/${r.id}`, { method: 'DELETE' }); void reload(); }}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {edit && <Editor rule={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void reload(); }} />}
    </>
  );
}
