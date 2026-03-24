// Database abstraction — currently Netlify Blobs, swap to Supabase later
import { getStore } from '@netlify/blobs';

// Store names match existing data
const STORES = {
  clients: 'clients',
  posts: 'posts',
  users: 'users',
  history: 'history',
  rateLimits: 'rate-limits',
};

function store(name) { return getStore(STORES[name] || name); }

export const db = {
  // Clients — stored as single "list" key
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

  // Posts — keyed by clientId
  async getPosts(clientId) {
    return await store('posts').get(clientId, { type: 'json' }).catch(() => []) || [];
  },
  async savePosts(clientId, list) {
    await store('posts').setJSON(clientId, list);
  },

  // Users — keyed by email slug
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

  // History — keyed by clientId
  async getHistory(clientId) {
    return await store('history').get(clientId, { type: 'json' }).catch(() => []) || [];
  },
  async saveHistory(clientId, list) {
    await store('history').setJSON(clientId, list);
  },

  // Rate limits — keyed by IP
  async getRateLimit(key) {
    return await store('rateLimits').get(key, { type: 'json' }).catch(() => null);
  },
  async saveRateLimit(key, data) {
    await store('rateLimits').setJSON(key, data);
  },
};
