'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getUser, getToken, type AuthUser } from '@/lib/auth';

export function useAuth(requiredRole?: 'REPORTER' | 'CHIEF_EDITOR' | 'ADMIN') {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [token, setToken]     = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const u = getUser();
    const t = getToken();
    setUser(u);
    setToken(t);
    setChecked(true);

    if (!u || !t) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    // Role check: CHIEF_EDITOR+ required for editor pages
    if (requiredRole === 'CHIEF_EDITOR') {
      if (!['CHIEF_EDITOR', 'ADMIN'].includes(u.role)) {
        router.replace('/reporter');
      }
    }
  }, []);

  return { user, token, checked };
}
