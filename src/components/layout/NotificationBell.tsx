'use client';

import { useState, useEffect, useRef } from 'react';
import { getNotifications, markAllNotificationsRead } from '@/src/lib/demo-data';

function timeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60)  return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(date).toLocaleDateString();
}

const TYPE_ICON: Record<string, string> = {
  ORDER_PLACED:       '📦',
  ORDER_ACCEPTED:     '✅',
  TRUCK_ASSIGNED:     '🚛',
  TRUCK_EN_ROUTE:     '🚛',
  TRUCK_ARRIVED:      '📍',
  DELIVERY_COMPLETED: '✅',
  FUEL_ANOMALY:       '🚨',
  ORDER_ASSIGNED_TO_TSP: '📋',
  ORDER_PROGRESS:     '🔄',
  default:            '🔔',
};

export default function NotificationBell({ userId }: { userId: string }) {
  const [open,  setOpen]  = useState(false);
  const [notifs, setNotifs] = useState<any[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const load = () => {
    const all = getNotifications().filter(n => n.userId === userId);
    setNotifs(all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, [userId]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unread = notifs.filter(n => !n.read).length;

  const handleOpen = () => {
    setOpen(v => !v);
    if (!open && unread > 0) {
      markAllNotificationsRead(userId);
      setTimeout(load, 100);
    }
  };

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-sm font-bold text-gray-900">Notifications</p>
              {notifs.length > 0 && (
                <span className="text-xs text-gray-400">{notifs.length} total</span>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
              {notifs.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-2xl mb-2">🔕</p>
                  <p className="text-sm text-gray-400">No notifications yet</p>
                </div>
              ) : (
                notifs.map(n => (
                  <div key={n.id} className={`px-4 py-3 flex items-start gap-3 ${n.read ? '' : 'bg-blue-50/50'}`}>
                    <span className="text-lg flex-shrink-0 mt-0.5">
                      {TYPE_ICON[n.type] ?? TYPE_ICON.default}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${n.read ? 'text-gray-700' : 'text-gray-900 font-semibold'}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-snug">{n.message}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                    {!n.read && <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
