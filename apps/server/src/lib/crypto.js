/* =========================================================================
   Kryptografické pomůcky — tokeny, hashe, HMAC podpisy.
   Token (= recovery kód) generujeme jako randomUUID a NIKDY ho neukládáme;
   v DB drží jen sha256(token) jako token_hash.
   ========================================================================= */
import { randomUUID, createHash, createHmac, timingSafeEqual } from 'node:crypto';

/* sha256 z řetězce → hex. Používá se na token_hash a kanonický HMAC. */
export function sha256hex(input) {
  return createHash('sha256').update(String(input)).digest('hex');
}

/* Nový tajný token = recovery kód. Klient si ho drží v localStorage. */
export function generateToken() {
  return randomUUID();
}

/* Kanonický JSON: klíče seřazené abecedně, žádné mezery.
   Musí se shodovat s klientskou serializací, jinak HMAC nesedí. */
export function canonicalJSON(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalJSON).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJSON(obj[k])).join(',') + '}';
}

/* hex HMAC-SHA256 nad kanonickým JSONem. */
export function hmacSign(secret, payload) {
  return createHmac('sha256', secret).update(canonicalJSON(payload)).digest('hex');
}

/* Ověří podpis v konstantním čase. Vrací bool; nikdy nevyhodí výjimku. */
export function hmacVerify(secret, payload, sig) {
  if (typeof sig !== 'string' || sig.length === 0) return false;
  const expected = hmacSign(secret, payload);
  if (expected.length !== sig.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'));
  } catch {
    return false;
  }
}
