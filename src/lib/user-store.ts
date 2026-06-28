'use client';
import type { User } from '@/src/types';

const KEY = 'fuel_current_user';

export function getCurrentUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch { return null; }
}

export function setCurrentUser(user: User | null): void {
  if (typeof window === 'undefined') return;
  if (user) localStorage.setItem(KEY, JSON.stringify(user));
  else      localStorage.removeItem(KEY);
}

export function logout(): void {
  setCurrentUser(null);
}
