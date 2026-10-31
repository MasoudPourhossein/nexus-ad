import { ArrowDownLeft, ArrowUpRight, Inbox as InboxIcon, Send } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api';
import { cleanMsg, MessageEditor, type Msg } from '../components/MessageEditor';
import { Empty, Field, Loading, Modal, PageHeader, Phone, StatusBadge, Tabs, useAsync, useToast } from '../components/ui';
import { useI18n } from '../i18n';

export default function Inbox() {
  const { t, date } = useI18n();
  const toast = useToast();
  const [dir, setDir] = useState<'in' | 'out' | 'all'>('in');
  const { data, reload } = useAsync(() => api(`/messages?limit=100${dir === 'all' ? '' : `&direction=${dir}`}`), [dir], 8000);
  const sessions = useAsync(() => api('/sessions'), []);
  const [sending, setSending] = useState(false);
  const [phone, setPhone] = useState('');
  const [sessionId, setSessionId] = useState<number | ''>('');
  const [msg, setMsg] = useState<Msg>({ type: 'text', text: '' });
  async function send() {
    try {
      await api('/messages', { body: { sessionId: Number(sessionId), phone, message: cleanMsg(msg) } });
      toast.ok(t('queued'));
      setSending(false);
      void reload();
    } catch (e) {
      toast.err(e);
    }
  }
  return (
    <>
      <PageHeader title={t('inbox')} actions={<button className="btn-primary" onClick={() => setSending(true)}><Send size={16} /> {t('sendTest')}</button>} />
      <div className="mb-4"><Tabs value={dir} onChange={setDir} items={[{ value: 'in', label: t('in') }, { value: 'out', label: t('out') }, { value: 'all', label: t('all') }]} /></div>
      <div className="card overflow-hidden">
        {!data ? <Loading /> : !data.length ? <Empty icon={<InboxIcon size={36} />} /> : (
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {data.map((m: any) => (
              <div key={m.id} className="flex items-start gap-3 p-4">
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${m.direction === 'in' ? 'bg-sky-500/15 text-sky-500' : 'bg-brand-500/15 text-brand-500'}`}>
                  {m.direction === 'in' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><Phone value={m.display} />{m.direction === 'out' && <StatusBadge status={m.status} />}<span className="ms-auto text-xs text-slate-400">{date(m.created_at)}</span></div>
                  <div className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600 dark:text-slate-300">{m.content?.text ?? m.content?.mediaUrl}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Modal open={sending} onClose={() => setSending(false)} title={t('sendTest')}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('session')}>
              <select className="input" value={sessionId} onChange={(e) => setSessionId(Number(e.target.value))}>
                <option value="">—</option>
                {sessions.data?.map((s: any) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
            <Field label={t('phone')}><input className="input ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0912..." /></Field>
          </div>
          <MessageEditor value={msg} onChange={setMsg} showVars={false} />
          <button className="btn-primary w-full" disabled={!sessionId || !phone} onClick={send}><Send size={16} /> {t('send')}</button>
        </div>
      </Modal>
    </>
  );
}
