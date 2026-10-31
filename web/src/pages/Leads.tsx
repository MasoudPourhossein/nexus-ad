import { Download, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { api, download } from '../api';
import { Empty, Loading, PageHeader, Phone, useAsync } from '../components/ui';
import { useI18n } from '../i18n';

export default function Leads() {
  const { t, fmt, date } = useI18n();
  const [tag, setTag] = useState<string | null>(null);
  const { data } = useAsync(() => api(`/leads?limit=200${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`), [tag], 10000);
  return (
    <>
      <PageHeader title={t('leads')} actions={<button className="btn-outline" onClick={() => download(`/leads.csv${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`, `leads${tag ? '-' + tag : ''}.csv`)}><Download size={16} /> {t('exportCsv')}</button>} />
      {!data ? <Loading /> : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <button onClick={() => setTag(null)} className={`card p-4 text-start transition ${tag === null ? 'ring-2 ring-brand-500' : ''}`}>
              <div className="text-xs text-slate-500">{t('all')}</div>
              <div className="mt-1 text-2xl font-bold">{fmt(data.tags.reduce((a: number, x: any) => a + x.count, 0))}</div>
            </button>
            {data.tags.map((x: any) => (
              <button key={x.tag} onClick={() => setTag(x.tag)} className={`card p-4 text-start transition ${tag === x.tag ? 'ring-2 ring-brand-500' : ''}`}>
                <div className="truncate text-xs text-brand-600 dark:text-brand-400">#{x.tag}</div>
                <div className="mt-1 text-2xl font-bold">{fmt(x.count)}</div>
              </button>
            ))}
          </div>
          <div className="card overflow-hidden">
            {!data.items.length ? <Empty icon={<Sparkles size={36} />} /> : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead><tr><th>{t('phone')}</th><th>{t('tag')}</th><th>{t('message')}</th><th>{t('campaigns')}</th><th>{t('createdAt')}</th></tr></thead>
                  <tbody>
                    {data.items.map((l: any) => (
                      <tr key={l.id}>
                        <td><Phone value={l.display} /></td>
                        <td><span className="badge bg-brand-500/15 text-brand-700 dark:text-brand-300">#{l.tag}</span></td>
                        <td className="max-w-xs truncate">{l.text}</td>
                        <td className="text-xs text-slate-500">{l.campaign_name ?? '—'}</td>
                        <td className="text-xs text-slate-500">{date(l.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
