import { translateServerMessage } from '../i18n/index.js';
import { API_URL } from '../lib/config.js';

const TOKEN_KEY = 'enp_token';

// Session token from login, sent as `Authorization: Bearer`. Storage can be unavailable (private mode),
// so every access is guarded and the app then just behaves as signed-out.
export const tokenStore = {
  get() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(token) {
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
  },
  clear() {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  },
};

// The API speaks English; messages are translated to the current language when the error is created.
export class ApiError extends Error {
  constructor(status, message, fields) {
    super(translateServerMessage(message));
    this.status = status;
    this.rawFields = fields ?? {};
    this.fields = Object.fromEntries(Object.entries(fields ?? {}).map(([k, v]) => [k, translateServerMessage(v)]));
  }

  /** status 0: the request never reached the server (no network). */
  get offline() {
    return this.status === 0;
  }
}

async function send(path, { method = 'GET', json, form } = {}) {
  const init = { method, headers: {} };
  const token = tokenStore.get();
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  } else if (form) {
    init.body = form; // the browser sets the multipart boundary itself
  }
  try {
    return await fetch(`${API_URL}/api${path}`, init);
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
}

async function request(path, options) {
  const res = await send(path, options);
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.message ?? 'Something went wrong. Please try again.', data?.error?.fields);
  return data;
}

/** GET a file (Excel export / template) with the session token and hand it to the browser to save. */
async function download(path, fallbackName) {
  const res = await send(path);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.error?.message ?? 'Something went wrong. Please try again.');
  }
  const name = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null)).toString();
  return s ? `?${s}` : '';
};

export const api = {
  // public
  settings: () => request('/public/settings'),
  notices: () => request('/public/notices'),
  schemes: () => request('/public/schemes'),
  scheme: (id) => request(`/public/schemes/${encodeURIComponent(id)}`),
  selfRegister: (data) => request('/public/self-register', { method: 'POST', json: data }),
  applyCertificate: (data) => request('/public/certificates', { method: 'POST', json: data }),
  trackCertificate: (id, phone) => request('/public/certificates/track', { method: 'POST', json: { id, phone } }),
  // auth
  me: () => request('/auth/me'),
  login: async (credentials) => {
    const data = await request('/auth/login', { method: 'POST', json: credentials });
    tokenStore.set(data.token);
    return data;
  },
  logout: async () => {
    try {
      await request('/auth/logout', { method: 'POST' });
    } finally {
      tokenStore.clear();
    }
  },
  // staff
  dashboard: () => request('/dashboard'),
  households: (params) => request(`/households${qs(params)}`),
  areas: () => request('/households/areas'),
  household: (id) => request(`/households/${id}`),
  createHousehold: (data) => request('/households', { method: 'POST', json: data }),
  updateHousehold: (id, data) => request(`/households/${id}`, { method: 'PUT', json: data }),
  verifyHousehold: (id) => request(`/households/${id}/verify`, { method: 'POST' }),
  deleteHousehold: (id) => request(`/households/${id}`, { method: 'DELETE' }),
  exportHouseholds: () => download('/households/export', 'families.xlsx'),
  importTemplate: () => download('/imports/template', 'family-survey-template.xlsx'),
  importFile: (form) => request('/imports', { method: 'POST', form }),
  importBatches: () => request('/imports/batches'),
  messages: (status) => request(`/messages${qs({ status })}`),
  setMessageStatus: (id, status) => request(`/messages/${id}/status`, { method: 'POST', json: { status } }),
  broadcast: (data) => request('/messages/broadcast', { method: 'POST', json: data }),
  certificates: (status) => request(`/certificates${qs({ status })}`),
  certificate: (id) => request(`/certificates/${encodeURIComponent(id)}`),
  updateCertificate: (id, data) => request(`/certificates/${encodeURIComponent(id)}/status`, { method: 'POST', json: data }),
  // admin
  adminNotices: () => request('/content/notices'),
  saveNotice: (id, data) => request(id ? `/content/notices/${id}` : '/content/notices', { method: id ? 'PUT' : 'POST', json: data }),
  deleteNotice: (id) => request(`/content/notices/${id}`, { method: 'DELETE' }),
  adminSchemes: () => request('/content/schemes'),
  saveScheme: (id, data) => request(id ? `/content/schemes/${id}` : '/content/schemes', { method: id ? 'PUT' : 'POST', json: data }),
  deleteScheme: (id) => request(`/content/schemes/${id}`, { method: 'DELETE' }),
  users: () => request('/admin/users'),
  createUser: (data) => request('/admin/users', { method: 'POST', json: data }),
  updateUser: (id, data) => request(`/admin/users/${id}`, { method: 'PUT', json: data }),
  adminSettings: () => request('/admin/settings'),
  saveSettings: (data) => request('/admin/settings', { method: 'PUT', json: data }),
};
