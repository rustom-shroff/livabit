// Token-free setup identity. This fingerprint does not itself establish consent or authenticate a receiver.
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { canonical, OapError } from './protocol.mjs';

const profiles = new Set(['direct-https-v1', 'direct-local-tls-v1', 'direct-loopback-test-v1']);
const reject = () => { throw new OapError('destination_rejected', 'The paired receiver descriptor is invalid or has changed.'); };
const sha256 = value => createHash('sha256').update(value).digest('hex');

function address(value) {
  if (typeof value !== 'string' || value.includes('%') || !isIP(value)) reject();
  let parsed = ipaddr.parse(value);
  if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress()) parsed = parsed.toIPv4Address();
  return parsed.toString();
}

function trustAnchor(value) {
  if (typeof value !== 'string' && !Buffer.isBuffer(value)) reject();
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
  if (!bytes.length || bytes.length > 65536) reject();
  // PEM represented as a Buffer/string or with CRLF/LF is the same configured public trust data.
  const text = bytes.toString('utf8');
  return sha256(Buffer.from(text, 'utf8').equals(bytes) ? Buffer.from(text.replace(/\r\n/gu, '\n').trim(), 'utf8') : bytes);
}

/**
 * The publisher persists this SHA-256 value at affirmative pairing approval.
 * Compare it on access/dispatch; token and expiry rotation do not alter the destination.
 * A null value exists only for isolated publisher unit fixtures without a transport endpoint.
 */
export function pairedDestinationFingerprint(credential) {
  if (!credential || !profiles.has(credential.profile_id)) reject();
  if (credential.endpoint === undefined && credential.profile_id === 'direct-loopback-test-v1' &&
      credential.allowedAddresses === undefined && credential.tls === undefined) return null;
  const endpoint = credential.endpoint;
  if (typeof endpoint !== 'string' || endpoint.length > 2048 || /[\\%\s]/u.test(endpoint)) reject();
  let url;
  try { url = new URL(endpoint); } catch { reject(); }
  if (url.href !== endpoint || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/')) reject();
  if (credential.profile_id === 'direct-loopback-test-v1') {
    if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname)) reject();
  } else if (url.protocol !== 'https:') reject();

  const configuredAddresses = credential.allowedAddresses ?? [];
  if (!Array.isArray(configuredAddresses) || configuredAddresses.length > 32) reject();
  const allowedAddresses = [...new Set(configuredAddresses.map(address))].sort();
  const tls = credential.tls;
  if (tls !== undefined && (!tls || typeof tls !== 'object' || Array.isArray(tls) ||
      Object.keys(tls).some(key => !['ca', 'peerKeySha256'].includes(key)))) reject();
  const anchors = tls?.ca === undefined ? [] : Array.isArray(tls.ca) ? tls.ca : [tls.ca];
  if (anchors.length > 8 || anchors.reduce((total, value) => total +
    (typeof value === 'string' ? Buffer.byteLength(value) : Buffer.isBuffer(value) ? value.length : 65537), 0) > 65536) reject();
  const ca = [...new Set(anchors.map(trustAnchor))].sort();
  const peerKeySha256 = tls?.peerKeySha256 ?? null;
  if (peerKeySha256 !== null && (typeof peerKeySha256 !== 'string' || !/^[A-Za-z0-9+/]{43}=$/u.test(peerKeySha256) ||
      Buffer.from(peerKeySha256, 'base64').toString('base64') !== peerKeySha256)) reject();
  if (credential.profile_id === 'direct-local-tls-v1' && (!allowedAddresses.length || !ca.length && !peerKeySha256)) reject();
  return sha256(canonical({ descriptor_version: 1, endpoint, profile_id: credential.profile_id,
    allowed_addresses: allowedAddresses, tls: { ca, peer_key_sha256: peerKeySha256 } }));
}
