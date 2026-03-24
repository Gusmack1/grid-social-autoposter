// PBKDF2 password hashing — Web Crypto API, zero dependencies
const ITERATIONS = 100000;
const KEY_LEN = 64;

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, KEY_LEN * 8);
  return `${Buffer.from(salt).toString('hex')}:${Buffer.from(bits).toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [saltHex, expectedHash] = stored.split(':');
  const salt = Buffer.from(saltHex, 'hex');
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, KEY_LEN * 8);
  return Buffer.from(bits).toString('hex') === expectedHash;
}
