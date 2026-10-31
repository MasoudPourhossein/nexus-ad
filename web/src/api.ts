const BASE: string = (window as any).__NEXUS_BASE__ ?? '';
export const API = `${BASE}/api/v1`;

export class ApiError extends Error {
  constructor(public status: number, public code: string, public details?: unknown) {
    super(code);
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem('nx_token');
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem('nx_token', token);
    else localStorage.removeItem('nx_token');
  } catch {
    // storage unavailable
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(API + path, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body });
  if (res.status === 401 && !path.startsWith('/auth')) {
    setToken(null);
    window.location.reload();
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'error', data?.details ?? data?.message);
  return data as T;
}

export function upload(path: string, file: File, onProgress: (pct: number) => void): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', API + path);
    const token = getToken();
    if (token) xhr.setRequestHeader('authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      const data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(xhr.status, data?.error ?? 'error'));
    };
    xhr.onerror = () => reject(new ApiError(0, 'network'));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

export async function download(path: string, filename: string): Promise<void> {
  const res = await fetch(API + path, { headers: { authorization: `Bearer ${getToken()}` } });
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
