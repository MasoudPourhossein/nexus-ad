import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { dirname } from 'node:path';
import tls from 'node:tls';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlink } from 'node:fs/promises';

export const XRAY_BIN = process.env.NEXUS_XRAY_BIN ?? 'xray';
export const XRAY_CONFIG = process.env.NEXUS_XRAY_CONFIG ?? '/data/xray/config.json';
export const XRAY_HTTP_PORT = Number(process.env.NEXUS_XRAY_HTTP_PORT ?? 10809);
export const XRAY_SOCKS_PORT = Number(process.env.NEXUS_XRAY_SOCKS_PORT ?? 10808);
/** Address WAHA uses to reach the Xray HTTP inbound, e.g. "nexus:10809". */
export const XRAY_ADVERTISE = process.env.NEXUS_PROXY_ADVERTISE ?? `127.0.0.1:${XRAY_HTTP_PORT}`;

export interface ParsedLink {
  protocol: 'vless' | 'vmess' | 'shadowsocks' | 'trojan';
  name: string;
  outbound: Record<string, any>;
}

function b64decode(input: string): string {
  const s = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(s + '='.repeat((4 - (s.length % 4)) % 4), 'base64').toString('utf8');
}

function list(value: string | null | undefined): string[] | undefined {
  if (!value) return undefined;
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

interface StreamOpts {
  network?: string;
  security?: string;
  sni?: string;
  fp?: string;
  alpn?: string;
  pbk?: string;
  sid?: string;
  spx?: string;
  host?: string;
  path?: string;
  serviceName?: string;
  mode?: string;
  headerType?: string;
  allowInsecure?: boolean;
  extra?: string;
}

export function buildStream(o: StreamOpts): Record<string, any> {
  let network = (o.network || 'tcp').toLowerCase();
  if (network === 'splithttp') network = 'xhttp';
  if (network === 'raw') network = 'tcp';
  const stream: Record<string, any> = { network: network };
  if (network === 'ws') {
    stream.wsSettings = { path: o.path || '/', host: o.host || undefined };
  } else if (network === 'grpc') {
    stream.grpcSettings = { serviceName: o.serviceName || o.path || '', multiMode: o.mode === 'multi' };
  } else if (network === 'httpupgrade') {
    stream.httpupgradeSettings = { path: o.path || '/', host: o.host || undefined };
  } else if (network === 'xhttp') {
    const settings: Record<string, any> = { path: o.path || '/', host: o.host || undefined, mode: o.mode || 'auto' };
    if (o.extra) {
      try {
        settings.extra = JSON.parse(o.extra);
      } catch {
        // ignore malformed extra
      }
    }
    stream.xhttpSettings = settings;
  } else if (network === 'tcp' && o.headerType === 'http') {
    stream.tcpSettings = {
      header: {
        type: 'http',
        request: { path: list(o.path) ?? ['/'], headers: o.host ? { Host: list(o.host) } : {} },
      },
    };
  }
  const security = (o.security || 'none').toLowerCase();
  if (security === 'tls') {
    stream.security = 'tls';
    stream.tlsSettings = {
      serverName: o.sni || o.host || undefined,
      fingerprint: o.fp || 'chrome',
      alpn: list(o.alpn),
      allowInsecure: o.allowInsecure ?? false,
    };
  } else if (security === 'reality') {
    stream.security = 'reality';
    stream.realitySettings = {
      serverName: o.sni || '',
      fingerprint: o.fp || 'chrome',
      publicKey: o.pbk || '',
      shortId: o.sid || '',
      spiderX: o.spx || '',
    };
  } else {
    stream.security = 'none';
  }
  return stream;
}

function streamFromQuery(q: URLSearchParams): Record<string, any> {
  return buildStream({
    network: q.get('type') ?? undefined,
    security: q.get('security') ?? undefined,
    sni: q.get('sni') ?? q.get('peer') ?? undefined,
    fp: q.get('fp') ?? undefined,
    alpn: q.get('alpn') ?? undefined,
    pbk: q.get('pbk') ?? undefined,
    sid: q.get('sid') ?? undefined,
    spx: q.get('spx') ?? undefined,
    host: q.get('host') ?? undefined,
    path: q.get('path') ?? undefined,
    serviceName: q.get('serviceName') ?? undefined,
    mode: q.get('mode') ?? undefined,
    headerType: q.get('headerType') ?? undefined,
    allowInsecure: q.get('allowInsecure') === '1' || q.get('insecure') === '1',
    extra: q.get('extra') ?? undefined,
  });
}

function hostOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, '');
}

export function parseLink(link: string): ParsedLink {
  const raw = link.trim();
  const scheme = raw.split('://')[0].toLowerCase();

  if (scheme === 'vmess') {
    const json = JSON.parse(b64decode(raw.slice('vmess://'.length).split('#')[0]));
    const stream = buildStream({
      network: json.net,
      security: json.tls === 'tls' || json.tls === 'reality' ? json.tls : 'none',
      sni: json.sni,
      fp: json.fp,
      alpn: json.alpn,
      pbk: json.pbk,
      sid: json.sid,
      host: json.host,
      path: json.path,
      serviceName: json.path,
      mode: json.type === 'multi' ? 'multi' : json.mode,
      headerType: json.type,
    });
    return {
      protocol: 'vmess',
      name: json.ps || `${json.add}:${json.port}`,
      outbound: {
        protocol: 'vmess',
        settings: {
          vnext: [
            {
              address: json.add,
              port: Number(json.port),
              users: [{ id: json.id, alterId: Number(json.aid ?? 0), security: json.scy || 'auto' }],
            },
          ],
        },
        streamSettings: stream,
      },
    };
  }

  if (scheme === 'vless' || scheme === 'trojan') {
    const url = new URL(raw);
    const q = url.searchParams;
    const name = decodeURIComponent(url.hash.replace(/^#/, '')) || `${hostOf(url)}:${url.port}`;
    const stream = streamFromQuery(q);
    if (scheme === 'trojan' && !q.get('security')) {
      stream.security = 'tls';
      stream.tlsSettings = { serverName: q.get('sni') || hostOf(url), fingerprint: q.get('fp') || 'chrome' };
    }
    if (scheme === 'vless') {
      return {
        protocol: 'vless',
        name: name,
        outbound: {
          protocol: 'vless',
          settings: {
            vnext: [
              {
                address: hostOf(url),
                port: Number(url.port || 443),
                users: [
                  {
                    id: decodeURIComponent(url.username),
                    encryption: q.get('encryption') || 'none',
                    flow: q.get('flow') || undefined,
                  },
                ],
              },
            ],
          },
          streamSettings: stream,
        },
      };
    }
    return {
      protocol: 'trojan',
      name: name,
      outbound: {
        protocol: 'trojan',
        settings: {
          servers: [{ address: hostOf(url), port: Number(url.port || 443), password: decodeURIComponent(url.username) }],
        },
        streamSettings: stream,
      },
    };
  }

  if (scheme === 'ss') {
    let body = raw.slice('ss://'.length);
    let name = '';
    const hashAt = body.indexOf('#');
    if (hashAt >= 0) {
      name = decodeURIComponent(body.slice(hashAt + 1));
      body = body.slice(0, hashAt);
    }
    body = body.split('?')[0].replace(/\/$/, '');
    let method: string;
    let password: string;
    let host: string;
    let port: number;
    if (!body.includes('@')) {
      body = b64decode(body);
    }
    const at = body.lastIndexOf('@');
    const userinfo = body.slice(0, at);
    const server = body.slice(at + 1);
    const decoded = userinfo.includes(':') ? decodeURIComponent(userinfo) : b64decode(userinfo);
    const colon = decoded.indexOf(':');
    method = decoded.slice(0, colon);
    password = decoded.slice(colon + 1);
    const portAt = server.lastIndexOf(':');
    host = server.slice(0, portAt).replace(/^\[|\]$/g, '');
    port = Number(server.slice(portAt + 1));
    return {
      protocol: 'shadowsocks',
      name: name || `${host}:${port}`,
      outbound: {
        protocol: 'shadowsocks',
        settings: { servers: [{ address: host, port: port, method: method, password: password }] },
      },
    };
  }

  throw new Error(`Unsupported link scheme "${scheme}". Use vless://, vmess://, ss:// or trojan://`);
}

export function buildXrayConfig(outbound: Record<string, any> | null): Record<string, any> {
  const outbounds: Record<string, any>[] = [];
  if (outbound) outbounds.push({ ...outbound, tag: 'proxy' });
  outbounds.push({ protocol: 'freedom', tag: 'direct' });
  outbounds.push({ protocol: 'blackhole', tag: 'block' });
  return {
    log: { loglevel: 'warning' },
    inbounds: [
      { tag: 'http-in', listen: '0.0.0.0', port: XRAY_HTTP_PORT, protocol: 'http', settings: {} },
      { tag: 'socks-in', listen: '0.0.0.0', port: XRAY_SOCKS_PORT, protocol: 'socks', settings: { udp: true } },
    ],
    outbounds: outbounds,
    routing: {
      domainStrategy: 'IPIfNonMatch',
      rules: [{ type: 'field', ip: ['geoip:private'], outboundTag: 'direct' }],
    },
  };
}

let child: ChildProcess | null = null;
let lastError = '';

export function xrayInstalled(): boolean {
  if (XRAY_BIN.includes('/')) return existsSync(XRAY_BIN);
  const dirs = (process.env.PATH ?? '').split(':');
  return dirs.some(function has(d) { return d && existsSync(join(d, XRAY_BIN)); });
}

export function xrayStatus(): { running: boolean; error: string; installed: boolean } {
  return { running: child !== null && child.exitCode === null, error: lastError, installed: xrayInstalled() };
}

export async function applyXray(outbound: Record<string, any> | null): Promise<void> {
  await mkdir(dirname(XRAY_CONFIG), { recursive: true });
  const cfg = buildXrayConfig(outbound);
  // geoip may be missing in slim images; fall back to explicit private ranges
  cfg.routing.rules = [
    { type: 'field', ip: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', '::1/128', 'fc00::/7'], outboundTag: 'direct' },
  ];
  await writeFile(XRAY_CONFIG, JSON.stringify(cfg, null, 2));
  await stopXray();
  if (!outbound) return;
  lastError = '';
  const proc = spawn(XRAY_BIN, ['run', '-c', XRAY_CONFIG], { stdio: ['ignore', 'pipe', 'pipe'] });
  child = proc;
  proc.on('error', function onError(err) {
    lastError = err.message;
    child = null;
  });
  proc.stderr?.on('data', function onErr(buf: Buffer) {
    lastError = buf.toString().slice(-500);
  });
  proc.on('exit', function onExit(code) {
    if (child === proc) {
      child = null;
      if (code) lastError = `xray exited with code ${code}. ${lastError}`;
    }
  });
  await new Promise((r) => setTimeout(r, 700));
}

export async function stopXray(): Promise<void> {
  const proc = child;
  child = null;
  if (!proc || proc.exitCode !== null) return;
  await new Promise<void>(function wait(resolve) {
    proc.once('exit', function done() {
      resolve();
    });
    proc.kill('SIGTERM');
    setTimeout(resolve, 2000);
  });
}

/** Open a TLS connection to target through the local HTTP proxy, return latency in ms. */
export function testThroughProxy(target = 'web.whatsapp.com', timeoutMs = 10_000, port = XRAY_HTTP_PORT): Promise<number> {
  const started = Date.now();
  return new Promise(function run(resolve, reject) {
    const socket = net.connect(port, '127.0.0.1');
    const timer = setTimeout(function timeout() {
      socket.destroy();
      reject(new Error('timeout'));
    }, timeoutMs);
    socket.once('error', function onError(err) {
      clearTimeout(timer);
      reject(err);
    });
    socket.once('connect', function onConnect() {
      socket.write(`CONNECT ${target}:443 HTTP/1.1\r\nHost: ${target}:443\r\n\r\n`);
    });
    socket.once('data', function onData(buf) {
      const line = buf.toString().split('\r\n')[0];
      if (!/ 200 /.test(line)) {
        clearTimeout(timer);
        socket.destroy();
        reject(new Error(`proxy answered: ${line}`));
        return;
      }
      const secure = tls.connect({ socket: socket, servername: target }, function onSecure() {
        clearTimeout(timer);
        secure.destroy();
        resolve(Date.now() - started);
      });
      secure.once('error', function onTlsError(err) {
        clearTimeout(timer);
        reject(err);
      });
    });
  });
}

function freePort(): Promise<number> {
  return new Promise(function find(resolve, reject) {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', function listening() {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(function closed() { resolve(port); });
    });
    srv.on('error', reject);
  });
}

/** Spawn a throwaway Xray for one outbound, measure a TLS handshake to WhatsApp through it, kill it. */
export async function testOutbound(outbound: Record<string, any>, timeoutMs = 9_000): Promise<number> {
  if (!xrayInstalled()) throw new Error('xray_not_installed');
  const port = await freePort();
  const cfg = {
    log: { loglevel: 'none' },
    inbounds: [{ tag: 'http-in', listen: '127.0.0.1', port: port, protocol: 'http', settings: {} }],
    outbounds: [{ ...outbound, tag: 'proxy' }, { protocol: 'freedom', tag: 'direct' }],
  };
  const file = join(tmpdir(), `xray-test-${port}.json`);
  await writeFile(file, JSON.stringify(cfg));
  const proc = spawn(XRAY_BIN, ['run', '-c', file], { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  proc.stderr?.on('data', function onErr(b: Buffer) { err += b.toString().slice(-300); });
  try {
    await new Promise((r) => setTimeout(r, 700));
    if (proc.exitCode !== null) throw new Error(`xray exited: ${err.trim() || 'bad config'}`);
    return await testThroughProxy('web.whatsapp.com', timeoutMs, port);
  } finally {
    proc.kill('SIGKILL');
    await unlink(file).catch(function ignore() {});
  }
}

/**
 * Through the local HTTP proxy: CONNECT → TLS → "GET / HTTP/1.1" to web.whatsapp.com.
 * Returns the HTTP status WhatsApp answered with. 2xx/3xx = reachable; 403/405/429 = this
 * exit IP is refused by WhatsApp; errors = proxy/network problem.
 */
export function probeHttps(target: string, port = XRAY_HTTP_PORT, timeoutMs = 15_000): Promise<{ ms: number; status: number; line: string; bytes: number; complete: boolean }> {
  const started = Date.now();
  return new Promise(function run(resolve, reject) {
    const socket = net.connect(port, '127.0.0.1');
    let status = 0;
    let line = '';
    let bytes = 0;
    let done = false;
    const finish = (complete: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      if (!status) return reject(new Error(bytes ? 'no http status' : 'timeout'));
      resolve({ ms: Date.now() - started, status: status, line: line, bytes: bytes, complete: complete });
    };
    const timer = setTimeout(function timeout() { finish(false); }, timeoutMs);
    const fail = (err: Error) => {
      if (done) return;
      if (status) return finish(false);
      done = true;
      clearTimeout(timer);
      socket.destroy();
      reject(err);
    };
    socket.once('error', fail);
    socket.once('connect', function onConnect() {
      socket.write(`CONNECT ${target}:443 HTTP/1.1\r\nHost: ${target}:443\r\n\r\n`);
    });
    socket.once('data', function onData(buf) {
      const first = buf.toString().split('\r\n')[0];
      if (!/ 200 /.test(first)) return fail(new Error(`proxy answered: ${first}`));
      const secure = tls.connect({ socket: socket, servername: target }, function onSecure() {
        secure.write(`GET / HTTP/1.1\r\nHost: ${target}\r\nUser-Agent: Mozilla/5.0\r\nAccept: */*\r\nConnection: close\r\n\r\n`);
      });
      let head = '';
      secure.on('data', function onHttp(d: Buffer) {
        bytes += d.length;
        if (!status) {
          head += d.toString('latin1');
          const m = head.match(/^HTTP\/\d\.\d (\d{3})[^\r\n]*/);
          if (m) { status = Number(m[1]); line = m[0]; }
        }
        if (bytes > 200_000) finish(true);
      });
      secure.once('error', fail);
      secure.once('close', function onClose() { finish(true); });
    });
  });
}

export function probeWhatsApp(port = XRAY_HTTP_PORT, timeoutMs = 15_000) {
  return probeHttps('web.whatsapp.com', port, timeoutMs);
}

export interface WaVerdict {
  ok: boolean;
  verdict: 'reachable' | 'ip_blocked_by_whatsapp' | 'stalled' | 'error';
  status: number | null;
  bytes: number;
  ms: number | null;
  note: string;
}

/** Judge a WhatsApp probe result. */
export function judgeWhatsApp(r: { status: number; bytes: number; complete: boolean; ms: number } | null, err?: unknown): WaVerdict {
  if (!r) {
    const msg = String((err as any)?.message ?? err ?? 'error');
    const stalled = /timeout|closed without response/i.test(msg);
    return { ok: false, verdict: stalled ? 'stalled' : 'error', status: null, bytes: 0, ms: null, note: msg.slice(0, 120) };
  }
  const blocked = r.status === 403 || r.status === 405 || r.status === 429;
  if (blocked) return { ok: false, verdict: 'ip_blocked_by_whatsapp', status: r.status, bytes: r.bytes, ms: r.ms, note: `HTTP ${r.status}` };
  if (!r.complete && r.bytes < 20_000) return { ok: false, verdict: 'stalled', status: r.status, bytes: r.bytes, ms: r.ms, note: `stalled after ${r.bytes} B` };
  return { ok: true, verdict: 'reachable', status: r.status, bytes: r.bytes, ms: r.ms, note: `HTTP ${r.status}, ${r.bytes} B` };
}

/** Spawn a throwaway Xray for one outbound and measure both latency and real WhatsApp reachability. */
export async function testOutboundFull(outbound: Record<string, any>): Promise<{ ms: number; wa: WaVerdict }> {
  if (!xrayInstalled()) throw new Error('xray_not_installed');
  const port = await freePort();
  const cfg = {
    log: { loglevel: 'none' },
    inbounds: [{ tag: 'http-in', listen: '127.0.0.1', port: port, protocol: 'http', settings: {} }],
    outbounds: [{ ...outbound, tag: 'proxy' }, { protocol: 'freedom', tag: 'direct' }],
  };
  const file = join(tmpdir(), `xray-test-${port}.json`);
  await writeFile(file, JSON.stringify(cfg));
  const proc = spawn(XRAY_BIN, ['run', '-c', file], { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  proc.stderr?.on('data', function onErr(b: Buffer) { err += b.toString().slice(-300); });
  try {
    await new Promise((r) => setTimeout(r, 700));
    if (proc.exitCode !== null) throw new Error(`xray exited: ${err.trim() || 'bad config'}`);
    const ms = await testThroughProxy('web.whatsapp.com', 9_000, port);
    let wa: WaVerdict;
    try {
      wa = judgeWhatsApp(await probeWhatsApp(port, 12_000));
    } catch (e) {
      wa = judgeWhatsApp(null, e);
    }
    return { ms: ms, wa: wa };
  } finally {
    proc.kill('SIGKILL');
    await unlink(file).catch(function ignore() {});
  }
}
