import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Field, PageHeader, Toggle, useToast } from '../components/ui';
import { useI18n } from '../i18n';
import { toggleTheme } from '../theme';

export default function Settings() {
  const { t, lang, setLang } = useI18n();
  const { me, refresh } = useAuth();
  const toast = useToast();
  const [webhookUrl, setWebhook] = useState(me?.webhookUrl ?? '');
  const [keywords, setKeywords] = useState((me?.optOutKeywords ?? []).join('\n'));
  const [optReply, setOptReply] = useState(me?.optOutReply ?? '');
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'));
  async function save(body: any) {
    try {
      await api('/me', { method: 'PATCH', body });
      await refresh();
      toast.ok(t('saved'));
    } catch (e) {
      toast.err(e);
    }
  }
  return (
    <>
      <PageHeader title={t('settings')} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-4 p-5">
          <div className="text-sm font-semibold">{t('profile')}</div>
          <div className="flex items-center justify-between"><span className="text-sm text-slate-500">{t('email')}</span><code className="ltr text-sm">{me?.email}</code></div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500">{t('language')}</span>
            <div className="flex gap-2">
              {(['fa', 'en'] as const).map((l) => <button key={l} className={lang === l ? 'btn-primary !py-1.5' : 'btn-outline !py-1.5'} onClick={() => setLang(l)}>{l === 'fa' ? 'فارسی' : 'English'}</button>)}
            </div>
          </div>
          <Toggle checked={dark} onChange={() => { toggleTheme(); setDark(document.documentElement.classList.contains('dark')); }} label={t('theme')} />
        </div>
        <div className="card space-y-4 p-5">
          <div className="text-sm font-semibold">{t('changePassword')}</div>
          <Field label={t('currentPassword')}><input className="input ltr" type="password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
          <Field label={t('newPassword')}><input className="input ltr" type="password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
          <button className="btn-primary" disabled={!cur || next.length < 8} onClick={() => { save({ currentPassword: cur, newPassword: next }); setCur(''); setNext(''); }}>{t('save')}</button>
        </div>
        <div className="card space-y-4 p-5">
          <div className="text-sm font-semibold">Webhook</div>
          <Field label={t('webhookUrl')} hint={t('webhookHelp')}><input className="input ltr" value={webhookUrl} onChange={(e) => setWebhook(e.target.value)} placeholder="https://your-site.com/hook" /></Field>
          <button className="btn-primary" onClick={() => save({ webhookUrl: webhookUrl || null })}>{t('save')}</button>
        </div>
        <div className="card space-y-4 p-5">
          <div className="text-sm font-semibold">{t('optOutKeywords')}</div>
          <Field label={t('optOutKeywords')}><textarea className="input h-24" value={keywords} onChange={(e) => setKeywords(e.target.value)} /></Field>
          <Field label={t('optOutReply')}><input className="input" value={optReply} onChange={(e) => setOptReply(e.target.value)} /></Field>
          <button className="btn-primary" onClick={() => save({ optOutKeywords: keywords.split('\n').map((s) => s.trim()).filter(Boolean), optOutReply: optReply || null })}>{t('save')}</button>
        </div>
      </div>
    </>
  );
}
