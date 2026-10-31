import { KeyRound, LogOut, Plus, QrCode, RotateCw, Settings2, Smartphone, Trash2 } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { Empty, Field, Loading, Modal, PageHeader, Phone, Spinner, StatusBadge, useAsync, useToast } from '../components/ui';
import { useI18n } from '../i18n';

function ConnectModal({ session, onClose }: { session: any; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState<string>(session.status);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    async function tick() {
      try {
        const s = await api(`/sessions/${session.id}`);
        if (stop) return;
        setStatus(s.status);
        if (s.status === 'WORKING') return;
        if (s.status === 'SCAN_QR_CODE') {
          const q = await api(`/sessions/${session.id}/qr`);
          if (!stop && q.value) setQr(await QRCode.toDataURL(q.value, { margin: 1, width: 320, color: { dark: '#0b111b', light: '#ffffff' } }));
        }
      } catch {
        // keep polling
      }
    }
    void tick();
    const id = setInterval(tick, 4000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [session.id]);
  async function pair() {
    try {
      const r = await api(`/sessions/${session.id}/pair-code`, { body: { phone } });
      setCode(r.code);
    } catch (e) {
      toast.err(e);
    }
  }
  return (
    <Modal open onClose={onClose} title={`${t('connect')} — ${session.label}`}>
      {status === 'WORKING' ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-brand-500/15 text-brand-500"><Smartphone size={30} /></div>
          <StatusBadge status="WORKING" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-col items-center gap-3">
            <div className="grid h-[280px] w-[280px] place-items-center rounded-2xl bg-white p-3 shadow-inner">
              {qr ? <img src={qr} alt="QR" className="h-full w-full" /> : <Spinner />}
            </div>
            <div className="text-center">
              <div className="font-medium">{t('scanQr')}</div>
              <div className="mt-1 text-xs text-slate-500">{t('scanHelp')}</div>
            </div>
            <StatusBadge status={status} />
          </div>
          <div className="border-t border-slate-200 pt-4 dark:border-white/5">
            <div className="label">{t('pairWithCode')}</div>
            <div className="flex gap-2">
              <input className="input ltr" placeholder="0912..." value={phone} onChange={(e) => setPhone(e.target.value)} />
              <button className="btn-outline shrink-0" onClick={pair}><KeyRound size={16} /> {t('getCode')}</button>
            </div>
            {code && <div className="mt-3 rounded-xl bg-brand-500/10 py-3 text-center font-mono text-2xl font-bold tracking-[0.3em] text-brand-600 ltr dark:text-brand-300">{code}</div>}
          </div>
        </div>
      )}
    </Modal>
  );
}

function EditModal({ session, onClose, onSaved }: { session: any; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const isNew = !session.id;
  const [label, setLabel] = useState(session.label ?? '');
  const [rate, setRate] = useState(session.rate_per_minute ?? 10);
  const [cap, setCap] = useState(session.daily_cap ?? 500);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const body = { label, ratePerMinute: Number(rate), dailyCap: Number(cap) };
      if (isNew) await api('/sessions', { body });
      else await api(`/sessions/${session.id}`, { method: 'PATCH', body });
      toast.ok(t('saved'));
      onSaved();
    } catch (e) {
      toast.err(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={isNew ? t('newSession') : t('edit')}>
      <div className="space-y-4">
        <Field label={t('label')}><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('ratePerMinute')}><input className="input" type="number" min={1} max={60} value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
          <Field label={t('dailyCap')}><input className="input" type="number" min={0} value={cap} onChange={(e) => setCap(e.target.value)} /></Field>
        </div>
        <button className="btn-primary w-full" disabled={busy || !label} onClick={save}>{isNew ? t('create') : t('save')}</button>
      </div>
    </Modal>
  );
}

export default function Sessions() {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const { data, loading, reload } = useAsync(() => api('/sessions'), [], 8000);
  const [connect, setConnect] = useState<any>(null);
  const [edit, setEdit] = useState<any>(null);
  async function act(path: string, method = 'POST', confirmIt = false) {
    if (confirmIt && !confirm(t('confirmDelete'))) return;
    try {
      await api(path, { method });
      await reload();
    } catch (e) {
      toast.err(e);
    }
  }
  return (
    <>
      <PageHeader title={t('sessions')} actions={<button className="btn-primary" onClick={() => setEdit({})}><Plus size={16} /> {t('newSession')}</button>} />
      {loading && !data ? <Loading /> : !data?.length ? (
        <div className="card"><Empty icon={<Smartphone size={36} />} /></div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((s: any) => (
            <div key={s.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand-500/20 to-teal-500/5 text-brand-600 dark:text-brand-400"><Smartphone size={20} /></div>
                  <div>
                    <div className="font-semibold">{s.label}</div>
                    <div className="text-xs text-slate-500">{s.phone ? <Phone value={'0' + String(s.phone).slice(2)} /> : '—'}</div>
                  </div>
                </div>
                <StatusBadge status={s.status} />
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl bg-slate-50 py-2 dark:bg-white/[0.03]"><div className="text-slate-500">{t('sentToday')}</div><div className="mt-0.5 font-semibold">{fmt(s.sent_today)}</div></div>
                <div className="rounded-xl bg-slate-50 py-2 dark:bg-white/[0.03]"><div className="text-slate-500">{t('ratePerMinute')}</div><div className="mt-0.5 font-semibold">{fmt(s.rate_per_minute)}</div></div>
                <div className="rounded-xl bg-slate-50 py-2 dark:bg-white/[0.03]"><div className="text-slate-500">{t('dailyCap')}</div><div className="mt-0.5 font-semibold">{fmt(s.daily_cap)}</div></div>
              </div>
              <div className="mt-4 flex flex-wrap gap-1">
                {s.status !== 'WORKING' && <button className="btn-primary !px-3 !py-1.5" onClick={() => setConnect(s)}><QrCode size={15} /> {t('connect')}</button>}
                <button className="btn-ghost !px-3 !py-1.5" onClick={() => setEdit(s)}><Settings2 size={15} /></button>
                <button className="btn-ghost !px-3 !py-1.5" onClick={() => act(`/sessions/${s.id}/restart`)} title={t('restart')}><RotateCw size={15} /></button>
                {s.status === 'WORKING' && <button className="btn-ghost !px-3 !py-1.5" onClick={() => act(`/sessions/${s.id}/logout`, 'POST', true)} title={t('logout')}><LogOut size={15} /></button>}
                <button className="btn-danger ms-auto !px-3 !py-1.5" onClick={() => act(`/sessions/${s.id}`, 'DELETE', true)}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {connect && <ConnectModal session={connect} onClose={() => { setConnect(null); void reload(); }} />}
      {edit && <EditModal session={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void reload(); }} />}
    </>
  );
}
