'use client';
import type { User } from '@/src/types';

const KEY = 'fuel_current_user';

// In-memory cache so consecutive calls within a render cycle return the same
// object reference. Without this, JSON.parse produces a new object every call,
// causing useEffect([..., user]) to re-run on every render and create a
// polling storm (hundreds of API calls per second across all pages).
let _cached: User | null = null;
let _loaded = false;

export function getCurrentUser(): User | null {
  if (typeof window === 'undefined') return null;
  if (!_loaded) {
    try {
      const raw = localStorage.getItem(KEY);
      _cached = raw ? (JSON.parse(raw) as User) : null;
    } catch { _cached = null; }
    _loaded = true;
  }
  return _cached;
}

export function setCurrentUser(user: User | null): void {
  if (typeof window === 'undefined') return;
  _cached = user;
  _loaded = true;
  if (user) localStorage.setItem(KEY, JSON.stringify(user));
  else      localStorage.removeItem(KEY);
}

export function logout(): void {
  setCurrentUser(null);
}
