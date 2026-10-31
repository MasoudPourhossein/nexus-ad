import { Loader2, Mic, Paperclip, Square, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { upload } from '../api';
import { useI18n } from '../i18n';
import { Field, Tabs, useToast } from './ui';

export interface Msg {
  type: 'text' | 'image' | 'file' | 'video' | 'voice';
  text?: string;
  mediaUrl?: string;
  filename?: string;
  mimetype?: string;
}

const ACCEPT: Record<string, string> = {
  image: 'image/*',
  video: 'video/*',
  voice: 'audio/*',
  file: '*/*',
};

function Uploader({ value, onChange }: { value: Msg; onChange: (m: Msg) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function pick(file: File) {
    setBusy(true);
    try {
      const r = await upload('/media', file, () => {});
      onChange({ ...value, mediaUrl: r.mediaUrl, filename: r.filename, mimetype: r.mimetype });
    } catch (e) {
      toast.err(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button type="button" className="btn-outline" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />} {t('attachFile')}
        </button>
        {value.mediaUrl && (
          <>
            <span className="truncate text-xs text-slate-500">{value.filename ?? value.mediaUrl}</span>
            <button type="button" className="btn-danger !p-1.5" onClick={() => onChange({ ...value, mediaUrl: undefined, filename: undefined, mimetype: undefined })}><Trash2 size={14} /></button>
          </>
        )}
        <input ref={input} type="file" accept={ACCEPT[value.type]} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ''; }} />
      </div>
      {value.type === 'image' && value.mediaUrl && <img src={value.mediaUrl} className="max-h-40 rounded-lg" alt="" />}
      <details className="text-xs text-slate-400">
        <summary className="cursor-pointer">{t('orPasteUrl')}</summary>
        <input className="input ltr mt-2" placeholder="https://..." value={value.mediaUrl ?? ''} onChange={(e) => onChange({ ...value, mediaUrl: e.target.value })} />
      </details>
    </div>
  );
}

function VoiceRecorder({ value, onChange }: { value: Msg; onChange: (m: Msg) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [state, setState] = useState<'idle' | 'recording' | 'uploading'>('idle');
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    rec.current?.stream.getTracks().forEach((tr) => tr.stop());
  }, []);
  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.err(new Error(t('micUnavailable')));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus' : MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        if (timer.current) clearInterval(timer.current);
        const blob = new Blob(chunks.current, { type: chunks.current[0]?.type || 'audio/ogg' });
        const ext = blob.type.includes('webm') ? 'webm' : 'ogg';
        setState('uploading');
        try {
          const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type });
          const r = await upload('/media', file, () => {});
          onChange({ type: 'voice', mediaUrl: r.mediaUrl, filename: r.filename, mimetype: r.mimetype });
        } catch (e) {
          toast.err(e);
        } finally {
          setState('idle');
        }
      };
      mr.start();
      rec.current = mr;
      setSeconds(0);
      setState('recording');
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      toast.err(new Error(t('micDenied')));
    }
  }
  function stop() {
    rec.current?.stop();
  }
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {state === 'recording' ? (
          <button type="button" className="btn-danger" onClick={stop}><Square size={16} /> {t('stopRecord')}</button>
        ) : (
          <button type="button" className="btn-primary" disabled={state === 'uploading'} onClick={start}>
            {state === 'uploading' ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />} {t('record')}
          </button>
        )}
        {state === 'recording' && <span className="flex items-center gap-2 text-sm text-rose-500"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" /> {mm}:{ss}</span>}
        <span className="text-xs text-slate-400">{t('or')}</span>
        <Uploader value={value} onChange={onChange} />
      </div>
      {value.mediaUrl && state === 'idle' && <audio controls src={value.mediaUrl} className="h-10 w-full" />}
    </div>
  );
}

export function MessageEditor({ value, onChange, showVars = true }: { value: Msg; onChange: (m: Msg) => void; showVars?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <Tabs
        value={value.type}
        onChange={(type) => onChange({ ...value, type, mediaUrl: type === 'text' ? undefined : value.mediaUrl })}
        items={(['text', 'image', 'video', 'file', 'voice'] as const).map((v) => ({ value: v, label: t(v) }))}
      />
      {value.type === 'voice' ? (
        <VoiceRecorder value={value} onChange={onChange} />
      ) : value.type !== 'text' ? (
        <Uploader value={value} onChange={onChange} />
      ) : null}
      {value.type !== 'voice' && (
        <Field label={value.type === 'text' ? t('text') : t('caption')} hint={showVars ? t('variablesHelp') : undefined}>
          <textarea className="input h-28" value={value.text ?? ''} onChange={(e) => onChange({ ...value, text: e.target.value })} />
        </Field>
      )}
    </div>
  );
}

export function cleanMsg(m: Msg): Msg {
  const out: Msg = { type: m.type };
  if (m.text) out.text = m.text;
  if (m.type !== 'text' && m.mediaUrl) out.mediaUrl = m.mediaUrl;
  if (m.filename) out.filename = m.filename;
  if (m.mimetype) out.mimetype = m.mimetype;
  return out;
}

export function Bubble({ m }: { m: Msg }) {
  const text = (m.text ?? '').replace(/\{\{?\s*name\s*\}?\}/g, 'علی').replace(/\{\{?\s*phone\s*\}?\}/g, '09121234567');
  return (
    <div className="rounded-2xl bg-[#0b141a] p-4">
      <div className="ms-auto max-w-[85%] rounded-xl rounded-se-sm bg-[#005c4b] px-3 py-2 text-sm text-white shadow">
        {m.type === 'voice' && m.mediaUrl && <div className="mb-1 flex items-center gap-2 text-xs"><span>🎤</span><span>voice</span></div>}
        {m.type !== 'text' && m.type !== 'voice' && m.mediaUrl && (
          m.type === 'image' ? <img src={m.mediaUrl} className="mb-2 max-h-48 rounded-lg" alt="" /> : <div className="mb-2 rounded-lg bg-black/20 px-3 py-2 text-xs">📎 {m.filename ?? m.mediaUrl.split('/').pop()}</div>
        )}
        {m.type !== 'voice' && <div className="whitespace-pre-wrap break-words">{text || '…'}</div>}
        <div className="mt-1 text-end text-[10px] text-white/60">12:00 ✓✓</div>
      </div>
    </div>
  );
}
