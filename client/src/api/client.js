const BASE = '/api';

function getToken() {
  return localStorage.getItem('bebold_token');
}

export function setToken(token) {
  if (token) localStorage.setItem('bebold_token', token);
  else localStorage.removeItem('bebold_token');
}

export function setUser(user) {
  if (user) localStorage.setItem('bebold_user', JSON.stringify(user));
  else localStorage.removeItem('bebold_user');
}

export function getUser() {
  const raw = localStorage.getItem('bebold_user');
  return raw ? JSON.parse(raw) : null;
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }

  if (!res.ok) {
    const message = (data && data.error) || `요청 실패 (${res.status})`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  get: (path) => request(path, { method: 'GET' }),
  post: (path, body) => request(path, { method: 'POST', body }),
};

export function logout() {
  setToken(null);
  setUser(null);
}
