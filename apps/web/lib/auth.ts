const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'REPORTER' | 'CHIEF_EDITOR' | 'SOCIAL_MANAGER' | 'ADMIN';
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

export function getUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('authUser');
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch { return null; }
}

export function saveAuth(token: string, user: AuthUser) {
  localStorage.setItem('accessToken', token);
  localStorage.setItem('authUser', JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('authUser');
}

export async function login(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // NestJS validation errors have message as array or nested object
    const msg = err.message;
    const text = Array.isArray(msg) ? msg[0] :
                 (typeof msg === 'object' && msg !== null) ? (msg.message?.[0] ?? msg.error ?? JSON.stringify(msg)) :
                 (typeof msg === 'string' ? msg : 'Invalid credentials');
    throw new Error(text);
  }
  const data = await res.json() as { accessToken: string; user: AuthUser };
  return { token: data.accessToken, user: data.user };
}

export function canEdit(user: AuthUser | null) {
  return user && ['REPORTER', 'CHIEF_EDITOR', 'ADMIN'].includes(user.role);
}

export function canReview(user: AuthUser | null) {
  return user && ['CHIEF_EDITOR', 'ADMIN'].includes(user.role);
}
