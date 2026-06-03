export interface AuthUser {
  id: string | null;
  name: string;
  email: string;
  role?: string;
  crewId?: string | null;
  base?: string | null;
  rank?: string | null;
}

export interface AuthSession {
  user: AuthUser;
  token: string;
  expiresAt?: string;
}

const TOKEN_KEY = 'crewcheck_auth_token';
const USER_KEY = 'crewcheck_auth_user';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return Boolean(getToken());
}

function persistSession(session: AuthSession) {
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    if (response.status === 401) clearSession();
    throw new Error([payload?.message, payload?.detail && !String(payload?.message || '').includes(String(payload.detail)) ? `Detalhe: ${payload.detail}` : '', payload?.code ? `Código: ${payload.code}` : ''].filter(Boolean).join(' | ') || `Erro HTTP ${response.status}`);
  }
  return payload as T;
}

export async function register(payload: {
  email: string;
  password: string;
  confirmPassword: string;
  role?: string;
}): Promise<AuthSession> {
  const session = await jsonFetch<AuthSession & { ok: boolean }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  persistSession(session);
  return session;
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const session = await jsonFetch<AuthSession & { ok: boolean }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  persistSession(session);
  return session;
}


export async function requestPasswordReset(email: string): Promise<{ ok: boolean; emailSent?: boolean; emailStatus?: unknown }> {
  return jsonFetch<{ ok: boolean; emailSent?: boolean; emailStatus?: unknown }>('/api/auth/request-reset', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function getMe(): Promise<AuthUser> {
  const payload = await jsonFetch<{ ok: boolean; user: AuthUser }>('/api/auth/me');
  localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
  return payload.user;
}

export async function logout(): Promise<void> {
  try {
    await jsonFetch('/api/auth/logout', { method: 'POST', body: '{}' });
  } catch {
    // Mesmo offline, removemos a sessão local.
  } finally {
    clearSession();
  }
}

export async function authFetch<T>(url: string, init?: RequestInit): Promise<T> {
  return jsonFetch<T>(url, init);
}
