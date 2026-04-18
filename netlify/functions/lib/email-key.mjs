// Canonical email → blob-store-safe key helper
// Lowercase, replace every non-alphanumeric with _
// Matches the inline transform used across admin.mjs, ai-writer.mjs, stripe-webhook.mjs.
export function emailKey(email) {
  return String(email || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
}
