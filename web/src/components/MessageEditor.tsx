import { useI18n } from '../i18n';
import { Field, Tabs } from './ui';

export interface Msg {
  type: 'text' | 'image' | 'file' | 'video' | 'voice';
  text?: string;
  mediaUrl?: string;
  filename?: string;
}

export function MessageEditor({ value, onChange, showVars = true }: { value: Msg; onChange: (m: Msg) => void; showVars?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <Tabs
        value={value.type}
        onChange={(type) => onChange({ ...value, type })}
        items={(['text', 'image', 'video', 'file', 'voice'] as const).map((v) => ({ value: v, label: t(v) }))}
      />
      {value.type !== 'text' && (
        <Field label={t('mediaUrl')}>
          <input className="input ltr" placeholder="https://..." value={value.mediaUrl ?? ''} onChange={(e) => onChange({ ...value, mediaUrl: e.target.value })} />
        </Field>
      )}
      {value.type !== 'voice' && (
        <Field label={t('text')} hint={showVars ? t('variablesHelp') : undefined}>
          <textarea className="input h-32" value={value.text ?? ''} onChange={(e) => onChange({ ...value, text: e.target.value })} />
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
  return out;
}

export function Bubble({ m }: { m: Msg }) {
  const text = (m.text ?? '').replace(/\{\{?\s*name\s*\}?\}/g, 'علی').replace(/\{\{?\s*phone\s*\}?\}/g, '09121234567');
  return (
    <div className="rounded-2xl bg-[#0b141a] p-4">
      <div className="ms-auto max-w-[85%] rounded-xl rounded-se-sm bg-[#005c4b] px-3 py-2 text-sm text-white shadow">
        {m.type !== 'text' && m.mediaUrl && (
          m.type === 'image' ? <img src={m.mediaUrl} className="mb-2 max-h-48 rounded-lg" alt="" /> : <div className="mb-2 rounded-lg bg-black/20 px-3 py-2 text-xs">📎 {m.mediaUrl.split('/').pop()}</div>
        )}
        <div className="whitespace-pre-wrap break-words">{text || '…'}</div>
        <div className="mt-1 text-end text-[10px] text-white/60">12:00 ✓✓</div>
      </div>
    </div>
  );
}
