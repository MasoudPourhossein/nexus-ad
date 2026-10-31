import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseLink } from './xray.js';
import { normalizePhone } from './phone.js';

test('vless reality', () => {
  const p = parseLink('vless://11111111-2222-3333-4444-555555555555@1.2.3.4:443?type=tcp&security=reality&sni=www.speedtest.net&fp=chrome&pbk=PUBKEY&sid=ab12&flow=xtls-rprx-vision#My%20Server');
  assert.equal(p.protocol, 'vless');
  assert.equal(p.name, 'My Server');
  assert.equal(p.outbound.streamSettings.security, 'reality');
  assert.equal(p.outbound.streamSettings.realitySettings.publicKey, 'PUBKEY');
  assert.equal(p.outbound.settings.vnext[0].users[0].flow, 'xtls-rprx-vision');
});

test('vless xhttp tls', () => {
  const p = parseLink('vless://uuid@example.com:443?type=xhttp&security=tls&sni=example.com&path=%2Fxh&mode=packet-up&host=cdn.example.com#x');
  assert.equal(p.outbound.streamSettings.network, 'xhttp');
  assert.equal(p.outbound.streamSettings.xhttpSettings.path, '/xh');
  assert.equal(p.outbound.streamSettings.xhttpSettings.mode, 'packet-up');
});

test('vmess ws', () => {
  const json = { v: '2', ps: 'vm', add: 'a.com', port: '8080', id: 'uuid', aid: '0', net: 'ws', path: '/ws', host: 'h.com', tls: '' };
  const p = parseLink('vmess://' + Buffer.from(JSON.stringify(json)).toString('base64'));
  assert.equal(p.protocol, 'vmess');
  assert.equal(p.outbound.streamSettings.wsSettings.path, '/ws');
  assert.equal(p.outbound.settings.vnext[0].port, 8080);
});

test('ss sip002 and legacy', () => {
  const a = parseLink('ss://' + Buffer.from('aes-256-gcm:pass').toString('base64url') + '@5.6.7.8:8388#ss1');
  assert.equal(a.outbound.settings.servers[0].method, 'aes-256-gcm');
  assert.equal(a.outbound.settings.servers[0].port, 8388);
  const b = parseLink('ss://' + Buffer.from('chacha20-ietf-poly1305:p@ss@9.9.9.9:443').toString('base64'));
  assert.equal(b.outbound.settings.servers[0].password, 'p@ss');
  assert.equal(b.outbound.settings.servers[0].address, '9.9.9.9');
});

test('trojan', () => {
  const p = parseLink('trojan://secret@t.com:443?sni=t.com#tr');
  assert.equal(p.outbound.streamSettings.security, 'tls');
  assert.equal(p.outbound.settings.servers[0].password, 'secret');
});

test('iran phones', () => {
  assert.equal(normalizePhone('۰۹۱۲ ۱۲۳ ۴۵۶۷'), '989121234567');
  assert.equal(normalizePhone('+98 914 111 2233'), '989141112233');
  assert.equal(normalizePhone('00989351112233'), '989351112233');
  assert.equal(normalizePhone('9121234567'), '989121234567');
  assert.equal(normalizePhone('123'), null);
});
