import { Languages, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { ApiError } from '../api';

export default function Login() {
  const { t, lang, setLang } = useI18n();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? t(err.code) : t('error'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden p-4">
      <div className="pointer-events-none absolute -top-40 start-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-brand-500/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 end-0 h-[400px] w-[400px] rounded-full bg-sky-500/10 blur-[120px]" />
      <button className="btn-ghost absolute end-4 top-4" onClick={() => setLang(lang === 'fa' ? 'en' : 'fa')}>
        <Languages size={16} /> {lang === 'fa' ? 'English' : 'فارسی'}
      </button>
      <form onSubmit={submit} className="card relative w-full max-w-sm p-8">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-teal-600 shadow-xl shadow-brand-500/30">
            <svg viewBox="0 0 32 32" className="h-7 w-7"><path d="M9 22V10l14 12V10" stroke="white" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <h1 className="text-xl font-bold">{t('appName')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('tagline')}</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">{t('email')}</label>
            <input className="input ltr" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">{t('password')}</label>
            <input className="input ltr" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <div className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">{error}</div>}
          <button className="btn-primary w-full !py-3" disabled={busy}>
            {busy && <Loader2 size={16} className="animate-spin" />} {t('login')}
          </button>
        </div>
      </form>
    </div>
  );
}
