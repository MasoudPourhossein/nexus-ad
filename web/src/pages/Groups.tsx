import { Megaphone, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api';
import { Field, PageHeader, Tabs, useAsync, useToast } from '../components/ui';
import { useI18n } from '../i18n';

type Source = 'list' | 'paste';

function MembersPicker({ source, setSource, listId, setListId, paste, setPaste, lists }: any) {
  const { t, fmt } = useI18n();
  return (
    <div className="space-y-3">
      <div className="label">{t('membersFrom')}</div>
      <Tabs value={source} onChange={setSource} items={[{ value: 'list', label: t('fromList') }, { value: 'paste', label: t('fromPaste') }]} />
      {source === 'list' ? (
        <select className="input" value={listId} onChange={(e) => setListId(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">—</option>
          {lists?.map((l: any) => <option key={l.id} value={l.id}>{l.name} ({fmt(l.contacts)})</option>)}
        </select>
      ) : (
        <textarea className="input ltr h-32 font-mono" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'09121234567\n09141234567'} />
      )}
    </div>
  );
}

export default function Groups() {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const sessions = useAsync(() => api('/sessions'), []);
  const lists = useAsync(() => api('/lists'), []);
  const [tab, setTab] = useState<'create' | 'add' | 'channel'>('create');
  const [sessionId, setSessionId] = useState<number | ''>('');
  const [subject, setSubject] = useState('');
  const [source, setSource] = useState<Source>('list');
  const [listId, setListId] = useState<number | ''>('');
  const [paste, setPaste] = useState('');
  const [groups, setGroups] = useState<any[] | null>(null);
  const [groupId, setGroupId] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>('');

  function members() {
    return source === 'list' ? { listId: listId === '' ? null : Number(listId) } : { phones: paste.split(/[\n,;\s]+/).filter(Boolean) };
  }
  async function run(fn: () => Promise<any>) {
    setBusy(true);
    setResult('');
    try {
      await fn();
    } catch (e) {
      toast.err(e);
    } finally {
      setBusy(false);
    }
  }
  async function loadGroups() {
    if (!sessionId) return;
    await run(async () => setGroups(await api(`/sessions/${sessionId}/groups`)));
  }
  const ready = !!sessionId && (source === 'paste' ? !!paste.trim() : listId !== '');
  return (
    <>
      <PageHeader title={t('groups')} />
      <div className="card max-w-2xl space-y-5 p-5">
        <Field label={t('session')}>
          <select className="input" value={sessionId} onChange={(e) => { setSessionId(Number(e.target.value)); setGroups(null); }}>
            <option value="">—</option>
            {sessions.data?.map((s: any) => <option key={s.id} value={s.id}>{s.label} ({t(s.status)})</option>)}
          </select>
        </Field>
        <Tabs value={tab} onChange={setTab} items={[
          { value: 'create', label: <span className="flex items-center gap-1.5"><Users size={14} /> {t('createGroup')}</span> },
          { value: 'add', label: <span className="flex items-center gap-1.5"><UserPlus size={14} /> {t('addMembers')}</span> },
          { value: 'channel', label: <span className="flex items-center gap-1.5"><Megaphone size={14} /> {t('createChannel')}</span> },
        ]} />

        {tab === 'create' && (
          <div className="space-y-4">
            <Field label={t('groupName')}><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
            <MembersPicker source={source} setSource={setSource} listId={listId} setListId={setListId} paste={paste} setPaste={setPaste} lists={lists.data} />
            <button className="btn-primary w-full" disabled={busy || !ready || !subject} onClick={() => run(async () => {
              const r = await api(`/sessions/${sessionId}/groups`, { body: { subject, ...members() } });
              setResult(`${t('groupCreated')} — ${t('added')}: ${fmt(r.members?.added ?? 0)}${r.members?.failed ? ` · ${t('failed')}: ${fmt(r.members.failed)}` : ''}`);
              toast.ok(t('groupCreated'));
            })}>{t('createGroup')}</button>
          </div>
        )}

        {tab === 'add' && (
          <div className="space-y-4">
            <div className="flex items-end gap-2">
              <Field label={t('pickGroup')}>
                <select className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                  <option value="">—</option>
                  {groups?.map((g) => <option key={g.id} value={g.id}>{g.name}{g.participants !== null ? ` (${fmt(g.participants)})` : ''}</option>)}
                </select>
              </Field>
              <button className="btn-outline shrink-0" disabled={!sessionId || busy} onClick={loadGroups}>{t('loadGroups')}</button>
            </div>
            {groups && !groups.length && <div className="text-xs text-slate-500">{t('noGroups')}</div>}
            <MembersPicker source={source} setSource={setSource} listId={listId} setListId={setListId} paste={paste} setPaste={setPaste} lists={lists.data} />
            <button className="btn-primary w-full" disabled={busy || !ready || !groupId} onClick={() => run(async () => {
              const r = await api(`/sessions/${sessionId}/groups/${encodeURIComponent(groupId)}/participants`, { body: members() });
              setResult(`${t('added')}: ${fmt(r.added)}${r.failed ? ` · ${t('failed')}: ${fmt(r.failed)}` : ''}`);
              toast.ok(t('saved'));
            })}>{t('addMembers')}</button>
          </div>
        )}

        {tab === 'channel' && (
          <div className="space-y-4">
            <Field label={t('channelTitle')}><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
            <Field label={t('channelDesc')}><textarea className="input h-24" value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
            <button className="btn-primary w-full" disabled={busy || !sessionId || !title} onClick={() => run(async () => {
              await api(`/sessions/${sessionId}/channels`, { body: { title, description: desc } });
              setResult(t('channelCreated'));
              toast.ok(t('channelCreated'));
            })}>{t('createChannel')}</button>
          </div>
        )}

        {result && <div className="rounded-xl bg-brand-500/10 px-4 py-3 text-sm text-brand-700 dark:text-brand-300">{result}</div>}
      </div>
    </>
  );
}
