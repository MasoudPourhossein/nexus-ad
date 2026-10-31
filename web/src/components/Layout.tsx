import clsx from 'clsx';
import {
  Bot, Building2, Code2, Gauge, Inbox, Languages, LogOut, Megaphone, Menu, Moon, Package, Settings, ShieldCheck, Smartphone, Sparkles, Sun, Users, X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { toggleTheme } from '../theme';

function Logo() {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 px-2">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-teal-600 shadow-lg shadow-brand-500/30">
        <svg viewBox="0 0 32 32" className="h-5 w-5"><path d="M9 22V10l14 12V10" stroke="white" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <div>
        <div className="font-bold tracking-tight">{t('appName')}</div>
        <div className="text-[11px] text-slate-500">{t('tagline')}</div>
      </div>
    </div>
  );
}

function Item({ to, icon, label, onClick }: { to: string; icon: ReactNode; label: string; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onClick}
      className={({ isActive }) =>
        clsx(
          'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
          isActive
            ? 'bg-gradient-to-r from-brand-500/15 to-transparent text-brand-700 dark:text-brand-300 rtl:bg-gradient-to-l'
            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200',
        )
      }
    >
      <span className="opacity-90">{icon}</span>
      {label}
    </NavLink>
  );
}

export function Layout() {
  const { t, lang, setLang, fmt } = useI18n();
  const { me, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const nav = (
    <nav className="flex flex-1 flex-col gap-1">
      <Item to="/" icon={<Gauge size={18} />} label={t('dashboard')} onClick={close} />
      <Item to="/sessions" icon={<Smartphone size={18} />} label={t('sessions')} onClick={close} />
      <Item to="/contacts" icon={<Users size={18} />} label={t('contacts')} onClick={close} />
      <Item to="/campaigns" icon={<Megaphone size={18} />} label={t('campaigns')} onClick={close} />
      <Item to="/rules" icon={<Bot size={18} />} label={t('rules')} onClick={close} />
      <Item to="/leads" icon={<Sparkles size={18} />} label={t('leads')} onClick={close} />
      <Item to="/inbox" icon={<Inbox size={18} />} label={t('inbox')} onClick={close} />
      <Item to="/developers" icon={<Code2 size={18} />} label={t('apiKeys')} onClick={close} />
      <Item to="/settings" icon={<Settings size={18} />} label={t('settings')} onClick={close} />
      {me?.role === 'admin' && (
        <>
          <div className="mt-4 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t('admin')}</div>
          <Item to="/admin/tenants" icon={<Building2 size={18} />} label={t('tenants')} onClick={close} />
          <Item to="/admin/plans" icon={<Package size={18} />} label={t('plans')} onClick={close} />
          <Item to="/admin/vpn" icon={<ShieldCheck size={18} />} label={t('vpn')} onClick={close} />
        </>
      )}
    </nav>
  );
  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <Logo />
      {nav}
      <div className="card space-y-3 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">{t('credits')}</span>
          <span className="font-semibold text-brand-600 dark:text-brand-400">{me?.credits === null ? t('unlimited') : fmt(me?.credits)}</span>
        </div>
        <div className="truncate text-xs text-slate-500" title={me?.email}>{me?.email}</div>
        <div className="flex gap-1">
          <button className="btn-ghost flex-1 !px-2 !py-1.5" onClick={() => setLang(lang === 'fa' ? 'en' : 'fa')} title={t('language')}>
            <Languages size={16} /> <span className="text-xs">{lang === 'fa' ? 'EN' : 'فا'}</span>
          </button>
          <button className="btn-ghost flex-1 !px-2 !py-1.5" onClick={toggleTheme} title={t('theme')}>
            <Sun size={16} className="hidden dark:block" /><Moon size={16} className="dark:hidden" />
          </button>
          <button className="btn-ghost flex-1 !px-2 !py-1.5 hover:!text-rose-500" onClick={logout} title={t('logout')}>
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-e border-slate-200/70 bg-white/60 backdrop-blur-xl dark:border-white/5 dark:bg-ink-900/40 lg:block">
        {sidebar}
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden" onClick={close}>
          <aside className="h-full w-72 overflow-y-auto bg-white dark:bg-ink-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end p-2"><button className="btn-ghost !p-2" onClick={close}><X size={18} /></button></div>
            {sidebar}
          </aside>
        </div>
      )}
      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/70 bg-white/70 px-4 py-3 backdrop-blur-xl dark:border-white/5 dark:bg-ink-950/70 lg:hidden">
          <button className="btn-ghost !p-2" onClick={() => setOpen(true)}><Menu size={20} /></button>
          <Logo />
          <span className="w-9" />
        </div>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
