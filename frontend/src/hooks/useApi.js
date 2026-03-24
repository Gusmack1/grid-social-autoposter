import { API_BASE } from '../constants.js';

export function getToken() {
  return localStorage.getItem('gs_token');
}

export function setToken(token) {
  localStorage.setItem('gs_token', token);
}

export function clearToken() {
  localStorage.removeItem('gs_token');
}

export async function api(endpoint, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const data = await res.json();

  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error('Session expired');
  }

  if (!res.ok && !data.success) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return data;
}

// Convenience methods
export const apiGet = (path) => api(path);
export const apiPost = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });
export const apiPut = (path, body) => api(path, { method: 'PUT', body: JSON.stringify(body) });
export const apiDelete = (path, body) => api(path, { method: 'DELETE', body: JSON.stringify(body) });
