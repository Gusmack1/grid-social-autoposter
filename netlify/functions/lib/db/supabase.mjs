// Supabase database adapter — drop-in replacement for Netlify Blobs
// Requires: SUPABASE_URL + SUPABASE_ANON_KEY env vars

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

// ── Helpers ──

// camelCase ↔ snake_case converters
function toSnake(str) {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

function toCamel(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function keysToSnake(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [toSnake(k), v])
  );
}

function keysToCamel(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [toCamel(k), v])
  );
}

// Lightweight Supabase REST client (no SDK dependency)
async function supabase(table, { method = 'GET', query = '', body, headers: extra = {} } = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query ? '?' + query : ''}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' ? 'return=representation' : method === 'PATCH' ? 'return=representation' : '',
    ...extra,
  };
  // Clean empty headers
  Object.keys(headers).forEach(k => { if (!headers[k]) delete headers[k]; });

  const res = await fetch(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${method} ${table}: ${res.status} ${text}`);
  }

  // DELETE returns no content
  if (res.status === 204) return null;

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('json')) return null;

  return res.json();
}

// ── Exported DB interface (same shape as Netlify Blobs adapter) ──

export const supabaseDb = {
  // ── Clients ──
  async getClients() {
    const rows = await supabase('clients', { query: 'order=created_at.asc' });
    return (rows || []).map(keysToCamel);
  },

  async saveClients(list) {
    // Upsert all clients — this replaces the entire list approach
    // For compatibility with existing code that replaces the full array
    const existing = await supabase('clients', { query: 'select=id' });
    const existingIds = new Set((existing || []).map(r => r.id));
    const newIds = new Set(list.map(c => c.id));

    // Delete removed clients
    for (const id of existingIds) {
      if (!newIds.has(id)) {
        await supabase('clients', {
          method: 'DELETE',
          query: `id=eq.${encodeURIComponent(id)}`,
        });
      }
    }

    // Upsert each client
    for (const client of list) {
      const row = keysToSnake(client);
      // JSONB fields need to stay as objects
      if (row.token_health && typeof row.token_health === 'object') {
        row.token_health = row.token_health;
      }
      await supabase('clients', {
        method: 'POST',
        body: row,
        headers: { 'Prefer': 'return=representation,resolution=merge-duplicates' },
      });
    }
  },

  async getClient(id) {
    const rows = await supabase('clients', {
      query: `id=eq.${encodeURIComponent(id)}&limit=1`,
    });
    return rows?.[0] ? keysToCamel(rows[0]) : null;
  },

  // ── Posts ──
  async getPosts(clientId) {
    const rows = await supabase('posts', {
      query: `client_id=eq.${encodeURIComponent(clientId)}&order=sort_order.asc,created_at.asc`,
    });
    return (rows || []).map(r => {
      const camel = keysToCamel(r);
      // Ensure platforms is always an array
      if (typeof camel.platforms === 'string') {
        try { camel.platforms = JSON.parse(camel.platforms); } catch { camel.platforms = []; }
      }
      if (typeof camel.imageUrls === 'string') {
        try { camel.imageUrls = JSON.parse(camel.imageUrls); } catch { camel.imageUrls = null; }
      }
      return camel;
    });
  },

  async savePosts(clientId, list) {
    // Delete all posts for this client, then re-insert
    await supabase('posts', {
      method: 'DELETE',
      query: `client_id=eq.${encodeURIComponent(clientId)}`,
    });

    if (list.length === 0) return;

    // Batch insert
    const rows = list.map((p, i) => {
      const row = keysToSnake({ ...p, clientId, sortOrder: p.sortOrder ?? i });
      // Ensure JSONB fields are arrays/objects not strings
      if (typeof row.platforms === 'string') {
        try { row.platforms = JSON.parse(row.platforms); } catch {}
      }
      if (typeof row.image_urls === 'string') {
        try { row.image_urls = JSON.parse(row.image_urls); } catch {}
      }
      if (typeof row.results === 'string') {
        try { row.results = JSON.parse(row.results); } catch {}
      }
      if (typeof row.delete_results === 'string') {
        try { row.delete_results = JSON.parse(row.delete_results); } catch {}
      }
      return row;
    });

    // Normalise keys — PostgREST requires all batch rows to have identical keys
    const allKeys = new Set();
    for (const r of rows) Object.keys(r).forEach(k => allKeys.add(k));
    const normalised = rows.map(r => {
      const out = {};
      for (const k of allKeys) out[k] = r[k] ?? null;
      return out;
    });

    // Insert in chunks of 50
    for (let i = 0; i < normalised.length; i += 50) {
      await supabase('posts', {
        method: 'POST',
        body: normalised.slice(i, i + 50),
      });
    }
  },

  // ── Users ──
  async getUser(emailKey) {
    const email = emailKey.replace(/_/g, '.').replace(/\-at\-/g, '@');
    const rows = await supabase('users', {
      query: `email=eq.${encodeURIComponent(email)}&limit=1`,
    });
    if (!rows?.[0]) return null;
    const user = keysToCamel(rows[0]);
    if (typeof user.assignedClients === 'string') {
      try { user.assignedClients = JSON.parse(user.assignedClients); } catch { user.assignedClients = []; }
    }
    return user;
  },

  async saveUser(emailKey, userData) {
    const email = emailKey.replace(/_/g, '.').replace(/\-at\-/g, '@');
    const row = keysToSnake({ ...userData, email });
    if (typeof row.assigned_clients === 'object' && Array.isArray(row.assigned_clients)) {
      // Keep as array for JSONB
    }
    await supabase('users', {
      method: 'POST',
      body: row,
      headers: { 'Prefer': 'return=representation,resolution=merge-duplicates' },
    });
  },

  async deleteUser(emailKey) {
    const email = emailKey.replace(/_/g, '.').replace(/\-at\-/g, '@');
    await supabase('users', {
      method: 'DELETE',
      query: `email=eq.${encodeURIComponent(email)}`,
    });
  },

  async listUsers() {
    const rows = await supabase('users', { query: 'order=created_at.asc' });
    return (rows || []).map(r => {
      const user = keysToCamel(r);
      if (typeof user.assignedClients === 'string') {
        try { user.assignedClients = JSON.parse(user.assignedClients); } catch { user.assignedClients = []; }
      }
      return user;
    });
  },

  // ── History ──
  async getHistory(clientId) {
    const rows = await supabase('history', {
      query: `client_id=eq.${encodeURIComponent(clientId)}&order=created_at.desc&limit=200`,
    });
    return (rows || []).map(keysToCamel);
  },

  async saveHistory(clientId, list) {
    // Delete existing history for client
    await supabase('history', {
      method: 'DELETE',
      query: `client_id=eq.${encodeURIComponent(clientId)}`,
    });
    if (list.length === 0) return;
    const rows = list.map(h => keysToSnake({ ...h, clientId }));
    // Normalise keys for PostgREST batch insert
    const allKeys = new Set();
    for (const r of rows) Object.keys(r).forEach(k => allKeys.add(k));
    const normalised = rows.map(r => {
      const out = {};
      for (const k of allKeys) out[k] = r[k] ?? null;
      return out;
    });
    const rows_ = normalised;
    for (let i = 0; i < rows_.length; i += 50) {
      await supabase('history', { method: 'POST', body: rows_.slice(i, i + 50) });
    }
  },

  // ── Rate limits ──
  async getRateLimit(key) {
    const rows = await supabase('rate_limits', {
      query: `key=eq.${encodeURIComponent(key)}&limit=1`,
    });
    return rows?.[0]?.data || null;
  },

  async saveRateLimit(key, data) {
    await supabase('rate_limits', {
      method: 'POST',
      body: { key, data, updated_at: new Date().toISOString() },
      headers: { 'Prefer': 'return=representation,resolution=merge-duplicates' },
    });
  },

  // ── Templates (new for Phase 6) ──
  async getTemplates(clientId) {
    const query = clientId
      ? `client_id=eq.${encodeURIComponent(clientId)}&order=created_at.desc`
      : `order=created_at.desc`;
    const rows = await supabase('templates', { query });
    return (rows || []).map(r => {
      const t = keysToCamel(r);
      if (typeof t.platforms === 'string') {
        try { t.platforms = JSON.parse(t.platforms); } catch { t.platforms = []; }
      }
      if (typeof t.tags === 'string') {
        try { t.tags = JSON.parse(t.tags); } catch { t.tags = []; }
      }
      return t;
    });
  },

  async saveTemplate(template) {
    const row = keysToSnake(template);
    await supabase('templates', {
      method: 'POST',
      body: row,
      headers: { 'Prefer': 'return=representation,resolution=merge-duplicates' },
    });
  },

  async deleteTemplate(id) {
    await supabase('templates', {
      method: 'DELETE',
      query: `id=eq.${encodeURIComponent(id)}`,
    });
  },
};
