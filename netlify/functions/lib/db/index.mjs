// Database abstraction — auto-detects Supabase, falls back to Netlify Blobs
// Set SUPABASE_URL + SUPABASE_ANON_KEY to enable Supabase
import { getStore } from '@netlify/blobs';

const USE_SUPABASE = !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);

let supabaseDb;
if (USE_SUPABASE) {
  supabaseDb = (await import('./supabase.mjs')).supabaseDb;
}

// ── Netlify Blobs implementation ──
const STORES = {
  clients: 'clients',
  posts: 'posts',
  users: 'users',
  history: 'history',
  rateLimits: 'rate-limits',
  templates: 'templates',
};

function store(name) { return getStore(STORES[name] || name); }

const blobsDb = {
  // Clients
  async getClients() {
    return await store('clients').get('list', { type: 'json' }).catch(() => []) || [];
  },
  async saveClients(list) {
    await store('clients').setJSON('list', list);
  },
  async getClient(id) {
    const list = await this.getClients();
    return list.find(c => c.id === id) || null;
  },

  // Posts
  async getPosts(clientId) {
    return await store('posts').get(clientId, { type: 'json' }).catch(() => []) || [];
  },
  async savePosts(clientId, list) {
    await store('posts').setJSON(clientId, list);
  },

  // Users
  async getUser(emailKey) {
    return await store('users').get(emailKey, { type: 'json' }).catch(() => null);
  },
  async saveUser(emailKey, user) {
    await store('users').setJSON(emailKey, user);
  },
  async deleteUser(emailKey) {
    await store('users').delete(emailKey);
  },
  async listUsers() {
    const { blobs } = await store('users').list();
    const users = [];
    for (const blob of blobs) {
      try { users.push(await store('users').get(blob.key, { type: 'json' })); } catch {}
    }
    return users;
  },

  // History
  async getHistory(clientId) {
    return await store('history').get(clientId, { type: 'json' }).catch(() => []) || [];
  },
  async saveHistory(clientId, list) {
    await store('history').setJSON(clientId, list);
  },

  // Rate limits
  async getRateLimit(key) {
    return await store('rateLimits').get(key, { type: 'json' }).catch(() => null);
  },
  async saveRateLimit(key, data) {
    await store('rateLimits').setJSON(key, data);
  },

  // Templates (Blobs fallback)
  async getTemplates(clientId) {
    const key = clientId ? `client_${clientId}` : 'global';
    return await store('templates').get(key, { type: 'json' }).catch(() => []) || [];
  },
  async saveTemplate(template) {
    const key = template.clientId ? `client_${template.clientId}` : 'global';
    const list = await this.getTemplates(template.clientId);
    const idx = list.findIndex(t => t.id === template.id);
    if (idx >= 0) list[idx] = template;
    else list.push(template);
    await store('templates').setJSON(key, list);
  },
  async deleteTemplate(id, clientId) {
    const key = clientId ? `client_${clientId}` : 'global';
    let list = await this.getTemplates(clientId);
    list = list.filter(t => t.id !== id);
    await store('templates').setJSON(key, list);
  },
};

// Export the active implementation
export const db = USE_SUPABASE ? supabaseDb : blobsDb;

// Export which backend is active (for diagnostics)
export const DB_BACKEND = USE_SUPABASE ? 'supabase' : 'netlify-blobs';
