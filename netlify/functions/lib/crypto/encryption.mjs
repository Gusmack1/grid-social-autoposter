// AES-256-GCM encryption for tokens at rest
// Requires ENCRYPTION_KEY env var (64-char hex = 32 bytes)
import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 16;
const TAG_LEN = 16;

function getKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) throw new Error('ENCRYPTION_KEY must be 64-char hex (openssl rand -hex 32)');
  return Buffer.from(hex, 'hex');
}

export function encrypt(plaintext) {
  if (!plaintext) return plaintext;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: base64(iv + tag + ciphertext) prefixed with "enc:"
  return 'enc:' + Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decrypt(stored) {
  if (!stored) return stored;
  // Pass through unencrypted values (migration support)
  if (!stored.startsWith('enc:')) return stored;
  const key = getKey();
  const buf = Buffer.from(stored.slice(4), 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc, null, 'utf8') + decipher.final('utf8');
}

export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith('enc:');
}
